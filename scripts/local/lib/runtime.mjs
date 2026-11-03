import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

export class RunError extends Error {
  constructor(message, output = '') {
    super(message);
    this.name = 'RunError';
    this.output = output;
  }
}

export const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
export const HTTP_TIMEOUT_MS = 20 * 1000;

export function cacheRoot() {
  const base = process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), '.cache');
  return path.join(base, 'facetheory-examples-local');
}

export function checkoutId(root) {
  return createHash('sha256').update(path.resolve(root)).digest('hex').slice(0, 8);
}

export function stateFile(root) {
  return path.join(cacheRoot(), `state-${checkoutId(root)}.json`);
}

export function logDirectory(root) {
  return path.join(cacheRoot(), `logs-${checkoutId(root)}`);
}

export function lockFile(root) {
  return path.join(cacheRoot(), `lock-${checkoutId(root)}`);
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function acquireLock(root) {
  mkdirSync(cacheRoot(), { recursive: true });
  const file = lockFile(root);
  const existing = readJson(file, null);
  if (existing && Number.isInteger(existing.pid) && isProcessAlive(existing.pid)) {
    throw new RunError(
      `another examples-local run owns this checkout (pid ${existing.pid}); run make examples-local-down if it is stale`,
    );
  }
  writeJson(file, { pid: process.pid, startedAt: new Date().toISOString(), root });
  return () => {
    const current = readJson(file, null);
    if (current?.pid === process.pid) rmSync(file, { force: true });
  };
}

export function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function processStartTime(pid) {
  const result = spawnSync('ps', ['-p', String(pid), '-o', 'lstart='], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : '';
}

function processCommand(pid) {
  const result = spawnSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : '';
}

export function recordProcess(root, entry) {
  const file = stateFile(root);
  const state = readJson(file, { checkout: path.resolve(root), processes: [] });
  state.checkout = path.resolve(root);
  state.processes = (state.processes ?? []).filter((item) => item.pid !== entry.pid);
  state.processes.push(entry);
  writeJson(file, state);
}

export function clearProcess(root, pid) {
  const file = stateFile(root);
  const state = readJson(file, { checkout: path.resolve(root), processes: [] });
  state.processes = (state.processes ?? []).filter((item) => item.pid !== pid);
  if (state.processes.length === 0) {
    rmSync(file, { force: true });
  } else {
    writeJson(file, state);
  }
}

function killProcessGroup(pid, signal) {
  try {
    process.kill(-pid, signal);
    return true;
  } catch (error) {
    if (error?.code === 'ESRCH') return false;
    try {
      process.kill(pid, signal);
      return true;
    } catch (inner) {
      return inner?.code !== 'ESRCH';
    }
  }
}

export async function stopProcess(child, { timeoutMs = 5000 } = {}) {
  if (!child || child.exitCode !== null) return;
  const pid = child.pid;
  if (!Number.isInteger(pid)) return;
  killProcessGroup(pid, 'SIGTERM');
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child.exitCode !== null) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  killProcessGroup(pid, 'SIGKILL');
  await new Promise((resolve) => setTimeout(resolve, 100));
}

export async function stopRecordedProcesses(root) {
  const file = stateFile(root);
  const state = readJson(file, { checkout: path.resolve(root), processes: [] });
  const results = [];
  const prefixes = new Set();
  for (const entry of state.processes ?? []) {
    if (entry.dockerPrefix) prefixes.add(entry.dockerPrefix);
    if (!Number.isInteger(entry.pid) || !isProcessAlive(entry.pid)) {
      results.push({ pid: entry.pid, row: entry.row, stopped: false, reason: 'already exited' });
      continue;
    }
    const currentStart = processStartTime(entry.pid);
    if (entry.startTime && currentStart && currentStart !== entry.startTime) {
      results.push({ pid: entry.pid, row: entry.row, stopped: false, reason: 'pid was reused; not ours' });
      continue;
    }
    const command = processCommand(entry.pid);
    const owned =
      command.includes('examples/') ||
      command.includes('src/dev-cli.ts') ||
      (typeof entry.binary === 'string' && command.includes(entry.binary));
    if (!owned) {
      results.push({ pid: entry.pid, row: entry.row, stopped: false, reason: 'command no longer matches' });
      continue;
    }
    killProcessGroup(entry.pid, 'SIGTERM');
    results.push({ pid: entry.pid, row: entry.row, stopped: true, reason: 'stopped' });
  }
  rmSync(file, { force: true });
  rmSync(logDirectory(root), { recursive: true, force: true });
  const lock = readJson(lockFile(root), null);
  if (lock === null || !Number.isInteger(lock.pid) || !isProcessAlive(lock.pid)) {
    rmSync(lockFile(root), { force: true });
  }
  for (const prefix of prefixes) {
    try {
      await cleanupDockerPrefix(prefix);
    } catch (error) {
      results.push({
        pid: null,
        row: null,
        stopped: false,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}

export function cleanEnvironment() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    const upper = key.toUpperCase();
    if (upper.startsWith('AWS_')) delete env[key];
    if (['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY'].includes(upper)) delete env[key];
    if (['PORT', 'NODE_OPTIONS', 'DYNAMODB_ENDPOINT', 'DDB_ENDPOINT', 'S3_ENDPOINT', 'KMS_ENDPOINT', 'STS_ENDPOINT', 'SQS_ENDPOINT'].includes(upper)) {
      delete env[key];
    }
    if (['FACETHEORY_ISR_BUCKET', 'FACETHEORY_ISR_PREFIX', 'FACETHEORY_CACHE_TABLE_NAME', 'APPTHEORY_CACHE_TABLE_NAME'].includes(upper)) {
      delete env[key];
    }
  }
  Object.assign(env, {
    AWS_REGION: 'us-east-1',
    AWS_DEFAULT_REGION: 'us-east-1',
    AWS_ACCESS_KEY_ID: 'dummy',
    AWS_SECRET_ACCESS_KEY: 'dummy',
    AWS_EC2_METADATA_DISABLED: 'true',
    AWS_CONFIG_FILE: '/dev/null',
    AWS_SHARED_CREDENTIALS_FILE: '/dev/null',
    AWS_ENDPOINT_URL: 'http://127.0.0.1:8299',
    AWS_ENDPOINT_URL_DYNAMODB: 'http://127.0.0.1:8299',
    AWS_ENDPOINT_URL_S3: 'http://127.0.0.1:8299',
    AWS_ENDPOINT_URL_KMS: 'http://127.0.0.1:8299',
    AWS_ENDPOINT_URL_STS: 'http://127.0.0.1:8299',
    AWS_ENDPOINT_URL_SQS: 'http://127.0.0.1:8299',
    FACETHEORY_EXAMPLES_LOCAL: '1',
  });
  return env;
}

export function assertLocalAwsEndpoints(env) {
  for (const name of ['AWS_ENDPOINT_URL', 'AWS_ENDPOINT_URL_DYNAMODB']) {
    const value = env[name];
    let url;
    try {
      url = new URL(value);
    } catch {
      throw new RunError(`${name} is unresolved (${String(value)}); refusing to start`);
    }
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
      throw new RunError(`${name}=${value} does not resolve to loopback; refusing to start`);
    }
  }
}

export async function runCommand({ command, args = [], cwd, env, timeoutMs = DEFAULT_TIMEOUT_MS, label }) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });
    let stdout = '';
    let stderr = '';
    let timeout;
    const labelText = label ?? `${command} ${args.join(' ')}`;
    const finish = (error) => {
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve({ stdout, stderr });
    };
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
      if (stdout.length > 200_000) stdout = stdout.slice(-200_000);
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
      if (stderr.length > 200_000) stderr = stderr.slice(-200_000);
    });
    child.once('error', (error) => {
      finish(new RunError(`${labelText} could not start: ${error.message}`, `${stdout}${stderr}`));
    });
    child.once('exit', (code, signal) => {
      if (code === 0) {
        finish();
        return;
      }
      const output = `${stdout}${stderr}`.trim();
      finish(
        new RunError(
          `${labelText} exited ${signal ? `by signal ${signal}` : `with code ${code}`}`,
          output,
        ),
      );
    });
    timeout = setTimeout(() => {
      killProcessGroup(child.pid, 'SIGKILL');
      finish(new RunError(`${labelText} timed out after ${timeoutMs}ms`, `${stdout}${stderr}`));
    }, timeoutMs);
    timeout.unref?.();
  });
}

export function startServer({ command, args = [], cwd, env, root, row, port, binary, dockerPrefix }) {
  mkdirSync(logDirectory(root), { recursive: true });
  const safeRow = String(row).replaceAll(/[^a-z0-9-]+/gi, '-');
  const logPath = path.join(logDirectory(root), `${safeRow}.log`);
  const stream = createWriteStream(logPath, { flags: 'w' });
  const child = spawn(command, args, {
    cwd,
    env: { ...env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  child.stdout.pipe(stream);
  child.stderr.pipe(stream);
  const entry = {
    pid: child.pid,
    row,
    command: `${command} ${args.join(' ')}`,
    cwd,
    port,
    logPath,
    startedAt: new Date().toISOString(),
    startTime: processStartTime(child.pid),
    binary,
    dockerPrefix,
  };
  recordProcess(root, entry);
  child.once('exit', () => {
    stream.end();
  });
  return { child, logPath };
}

/**
 * Start a long-lived machine process whose stdout is a protocol channel. Only
 * stderr goes to the row log; the caller owns stdout.
 */
export function startRecordedProcess({
  command,
  args = [],
  cwd,
  env,
  root,
  row,
  binary,
  dockerPrefix,
  logPath: requestedLogPath,
}) {
  mkdirSync(logDirectory(root), { recursive: true });
  const safeRow = String(row).replaceAll(/[^a-z0-9-]+/gi, '-');
  const logPath = requestedLogPath ?? path.join(logDirectory(root), `${safeRow}.log`);
  const stream = createWriteStream(logPath, { flags: 'w' });
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: true,
  });
  child.stderr.pipe(stream);
  recordProcess(root, {
    pid: child.pid,
    row,
    command: `${command} ${args.join(' ')}`,
    cwd,
    logPath,
    startedAt: new Date().toISOString(),
    startTime: processStartTime(child.pid),
    binary,
    dockerPrefix,
  });
  child.once('exit', () => {
    stream.end();
  });
  return { child, logPath };
}

export function waitForChildExit(child, timeoutMs) {
  if (!child || child.exitCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

function dockerNames(args) {
  const result = spawnSync('docker', args, { encoding: 'utf8' });
  if (result.status !== 0) return null;
  return (result.stdout ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * List the producer-managed Docker resources whose names belong to this
 * harness's prefix. The label filter keeps unrelated containers out even when
 * a name happens to match.
 */
export function dockerLeftovers(prefix) {
  const containers = dockerNames([
    'ps',
    '-a',
    '--filter',
    'label=apptheory.local.managed=true',
    '--format',
    '{{.Names}}',
  ]);
  const networks = dockerNames([
    'network',
    'ls',
    '--filter',
    'label=apptheory.local.managed=true',
    '--format',
    '{{.Name}}',
  ]);
  return {
    containers: (containers ?? []).filter((name) => name === prefix || name.startsWith(`${prefix}-`)),
    networks: (networks ?? []).filter((name) => name === `${prefix}-net`),
  };
}

/**
 * Wait for the producer's own SIGTERM cleanup, then remove exact-name
 * leftovers under this harness's prefix and verify none remain.
 */
export async function cleanupDockerPrefix(prefix, { timeoutMs = 20_000 } = {}) {
  const started = Date.now();
  let leftovers = dockerLeftovers(prefix);
  while (
    Date.now() - started < timeoutMs &&
    (leftovers.containers.length > 0 || leftovers.networks.length > 0)
  ) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    leftovers = dockerLeftovers(prefix);
  }
  const removed = [];
  for (const name of leftovers.containers) {
    spawnSync('docker', ['rm', '-f', name], { encoding: 'utf8' });
    removed.push(name);
  }
  for (const name of leftovers.networks) {
    spawnSync('docker', ['network', 'rm', name], { encoding: 'utf8' });
    removed.push(name);
  }
  const remaining = dockerLeftovers(prefix);
  if (remaining.containers.length > 0 || remaining.networks.length > 0) {
    throw new RunError(
      `cleanup left Docker resources for ${prefix}: ${[...remaining.containers, ...remaining.networks].join(', ')}`,
    );
  }
  return removed;
}

export function assertDockerAvailable() {
  const result = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new RunError(
      `Docker is required for the AppTheory local runner but its daemon is not reachable: ${
        (result.stderr || result.stdout || '').trim() || 'docker version failed'
      }`,
    );
  }
}

function logTail(logPath, maxBytes = 8000) {
  try {
    const content = readFileSync(logPath, 'utf8');
    return content.slice(-maxBytes);
  } catch {
    return '';
  }
}

export async function waitForPort({ port, child, logPath, timeoutMs = 30_000 }) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child && child.exitCode !== null) {
      throw new RunError(
        `server for port ${port} exited with code ${child.exitCode} before listening`,
        logTail(logPath),
      );
    }
    const ready = await new Promise((resolve) => {
      const socket = net.connect({ port, host: '127.0.0.1' });
      const done = (value) => {
        socket.destroy();
        resolve(value);
      };
      socket.once('connect', () => done(true));
      socket.once('error', () => done(false));
      socket.setTimeout(500, () => done(false));
    });
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new RunError(`server for port ${port} did not listen within ${timeoutMs}ms`, logTail(logPath));
}


function parseRawHttpResponse(raw) {
  const headerEnd = raw.indexOf('\r\n\r\n');
  if (headerEnd < 0) throw new RunError('raw HTTP response has no header terminator');
  const head = raw.subarray(0, headerEnd).toString('utf8');
  const lines = head.split('\r\n');
  const statusLine = lines.shift() ?? '';
  const statusMatch = /^HTTP\/1\.[01] (\d{3})/.exec(statusLine);
  if (!statusMatch) throw new RunError(`raw HTTP response has an invalid status line: ${statusLine}`);
  const headers = {};
  for (const line of lines) {
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const name = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    headers[name] = headers[name] === undefined ? value : `${headers[name]}, ${value}`;
  }
  let offset = headerEnd + 4;
  const chunks = [];
  if ((headers['transfer-encoding'] ?? '').toLowerCase().includes('chunked')) {
    while (offset < raw.length) {
      const lineEnd = raw.indexOf('\r\n', offset);
      if (lineEnd < 0) break;
      const sizeText = raw.subarray(offset, lineEnd).toString('ascii').split(';')[0].trim();
      const size = Number.parseInt(sizeText, 16);
      if (!Number.isFinite(size) || size < 0) {
        throw new RunError(`raw HTTP response has an invalid chunk size: ${sizeText}`);
      }
      offset = lineEnd + 2;
      if (size === 0) break;
      chunks.push(raw.subarray(offset, offset + size));
      offset += size;
      if (raw.subarray(offset, offset + 2).toString('ascii') === '\r\n') offset += 2;
    }
  } else {
    const length = Number.parseInt(headers['content-length'] ?? '', 10);
    if (Number.isFinite(length)) {
      chunks.push(raw.subarray(offset, offset + length));
    } else if (offset < raw.length) {
      chunks.push(raw.subarray(offset));
    }
  }
  return {
    status: Number(statusMatch[1]),
    headers,
    chunks: chunks.map((chunk) => Buffer.from(chunk)),
    body: Buffer.concat(chunks).toString('utf8'),
  };
}

/**
 * Read the HTTP/1.1 chunk framing directly from a loopback socket. A Node HTTP
 * client may coalesce several writes into one data event; the wire framing is
 * the stable evidence for a streaming response.
 */
export function rawHttpChunks({ port, path: requestPath = '/', timeoutMs = HTTP_TIMEOUT_MS }) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    const received = [];
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve(value);
    };
    socket.setTimeout(timeoutMs, () => {
      finish(new RunError(`raw HTTP request ${requestPath} timed out after ${timeoutMs}ms`));
    });
    socket.once('error', (error) => finish(error));
    socket.once('connect', () => {
      socket.write(
        `GET ${requestPath} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`,
      );
    });
    socket.on('data', (chunk) => received.push(chunk));
    socket.once('end', () => {
      try {
        finish(null, parseRawHttpResponse(Buffer.concat(received)));
      } catch (error) {
        finish(error);
      }
    });
  });
}

export function httpRequest({ port, path: requestPath, method = 'GET', headers = {}, timeoutMs = HTTP_TIMEOUT_MS }) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      { host: '127.0.0.1', port, path: requestPath, method, headers },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          resolve({
            status: response.statusCode,
            headers: response.headers,
            chunks,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`HTTP request ${method} ${requestPath} timed out`));
    });
    request.once('error', reject);
    request.end();
  });
}

export async function waitForHttp({ port, child, logPath, requestPath = '/', timeoutMs = 30_000 }) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      return await httpRequest({ port, path: requestPath, timeoutMs: 2000 });
    } catch {
      if (child && child.exitCode !== null) {
        throw new RunError(
          `server for port ${port} exited with code ${child.exitCode} before answering`,
          logTail(logPath),
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new RunError(`server for port ${port} did not answer within ${timeoutMs}ms`, logTail(logPath));
}

export function assert(condition, message) {
  if (!condition) throw new RunError(message);
}

export function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new RunError(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

export function assertMatch(value, pattern, message) {
  if (!pattern.test(value)) {
    throw new RunError(`${message}: ${String(value).slice(0, 300)}`);
  }
}

export function assertNotMatch(value, pattern, message) {
  if (pattern.test(value)) {
    throw new RunError(`${message}: ${String(value).slice(0, 300)}`);
  }
}

export function assertIncludes(value, needle, message) {
  if (!value.includes(needle)) {
    throw new RunError(`${message}: missing ${JSON.stringify(needle)}`);
  }
}

export function assertNotIncludes(value, needle, message) {
  if (value.includes(needle)) {
    throw new RunError(`${message}: unexpectedly contains ${JSON.stringify(needle)}`);
  }
}

export function assertHeader(headers, name, patternOrValue) {
  const actual = headers[name.toLowerCase()];
  if (typeof patternOrValue === 'string') {
    assertEqual(actual, patternOrValue, `header ${name}`);
  } else {
    assertMatch(String(actual ?? ''), patternOrValue, `header ${name}`);
  }
}

export function readLog(logPath) {
  return logTail(logPath);
}

export function exists(filePath) {
  return existsSync(filePath);
}
