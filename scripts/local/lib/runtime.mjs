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

export function stopRecordedProcesses(root) {
  const file = stateFile(root);
  const state = readJson(file, { checkout: path.resolve(root), processes: [] });
  const results = [];
  for (const entry of state.processes ?? []) {
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
    if (!command.includes('examples/') && !command.includes('src/dev-cli.ts')) {
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

export function startServer({ command, args = [], cwd, env, root, row, port }) {
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
  };
  recordProcess(root, entry);
  child.once('exit', () => {
    stream.end();
  });
  return { child, logPath };
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
