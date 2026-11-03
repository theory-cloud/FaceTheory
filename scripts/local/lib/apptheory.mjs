import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { checkProducerAncestor } from './manifest.mjs';
import {
  DEFAULT_TIMEOUT_MS,
  RunError,
  cacheRoot,
  cleanupDockerPrefix,
  clearProcess,
  readLog,
  runCommand,
  startRecordedProcess,
  stopProcess,
  waitForChildExit,
} from './runtime.mjs';

export const FT2_RUNNERS = new Set([
  'apptheory-local-handler',
  'apptheory-local-gateway',
  'apptheory-local-gateway-isr',
]);
export const PROFILE_PATH = 'scripts/local/apptheory-local-profile.json';

const RUNNER_CACHE = new Map();

export function profilePath(root) {
  return path.join(root, PROFILE_PATH);
}

function producerName(value) {
  const name = String(value)
    .toLowerCase()
    .replaceAll(/[^a-z0-9._-]+/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '');
  if (name === '') return 'function';
  if (name.length > 40) {
    return `${name.slice(0, 31)}-${createHash('sha256').update(name).digest('hex').slice(0, 8)}`;
  }
  return name;
}

export function dockerPrefixFor(row) {
  const slug = row.id
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
    .slice(0, 48);
  // The producer sanitizes and truncates --name-prefix (names longer than 40
  // characters become 31 characters plus a hash), so the harness must use the
  // same effective prefix for container lookups and cleanup.
  return producerName(`${row.containerPrefix ?? 'ft2'}-${slug}`);
}

export function ledgerRecordFor(ledger, rowId) {
  return (ledger?.rows ?? []).find((entry) => entry.row === rowId);
}

/**
 * Resolve the sibling AppTheory checkout named by the row's ledger record and
 * prove the ledger SHA is contained in its HEAD. A missing checkout, a dirty
 * checkout or a HEAD without the SHA fails this row by name.
 */
export function unreleasedProducerFor(root, row, ledger) {
  const record = ledgerRecordFor(ledger, row.id);
  if (!record) {
    throw new RunError(
      `${row.id}: consumes the unreleased AppTheory producer but the ledger has no record for it`,
    );
  }
  if (record.kind !== 'record') {
    throw new RunError(
      `${row.id}: the ledger record must set kind "record" for a row that executes against the sibling checkout`,
    );
  }
  const producer = record.producer ?? {};
  let resolved;
  try {
    resolved = checkProducerAncestor(root, {
      checkout: producer.checkout,
      sha: producer.staging_sha,
    });
  } catch (error) {
    throw new RunError(
      `${row.id}: unreleased AppTheory producer unavailable: ${
        error instanceof Error ? error.message : String(error)
      }. This row needs the sibling checkout ${String(
        producer.checkout,
      )} with ${String(producer.staging_sha)} in its history; a skip is a failure.`,
    );
  }
  const status = spawnSync('git', ['-C', resolved.directory, 'status', '--porcelain'], {
    encoding: 'utf8',
  });
  if (status.status !== 0) {
    throw new RunError(
      `${row.id}: cannot inspect the AppTheory checkout ${producer.checkout}: ${status.stderr.trim()}`,
    );
  }
  if (status.stdout.trim() !== '') {
    throw new RunError(
      `${row.id}: the AppTheory checkout ${producer.checkout} is not clean; the row must run against the ledger SHA ${producer.staging_sha}`,
    );
  }
  return {
    directory: resolved.directory,
    head: resolved.head,
    sha: producer.staging_sha,
    checkout: producer.checkout,
  };
}

/**
 * Build apptheory-local from the sibling checkout into the harness cache. No
 * file: dependency, override, vendored binary or pin change is committed.
 */
export async function ensureApptheoryLocal(root, producer) {
  const key = `${producer.directory}@${producer.head}`;
  if (RUNNER_CACHE.has(key)) return RUNNER_CACHE.get(key);

  const go = spawnSync('go', ['version'], { encoding: 'utf8' });
  if (go.status !== 0) {
    throw new RunError(
      `building apptheory-local needs the Go toolchain on PATH: ${
        (go.stderr || go.stdout || '').trim() || 'go version failed'
      }`,
    );
  }

  const buildDir = path.join(cacheRoot(), 'apptheory-local', producer.head);
  const binary = path.join(buildDir, 'apptheory-local');
  if (!existsSync(binary)) {
    mkdirSync(buildDir, { recursive: true });
    await runCommand({
      command: 'go',
      args: ['build', '-C', producer.directory, '-o', binary, './cmd/apptheory-local'],
      cwd: root,
      env: process.env,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      label: `build apptheory-local from ${producer.checkout} ${producer.head.slice(0, 12)}`,
    });
  }
  if (!existsSync(binary)) {
    throw new RunError(`apptheory-local build produced no binary at ${binary}`);
  }
  const runner = {
    binary,
    head: producer.head,
    sha: producer.sha,
    checkout: producer.directory,
    profile: profilePath(root),
  };
  RUNNER_CACHE.set(key, runner);
  return runner;
}

/**
 * Bundle a handler-only example from its own TypeScript entry with esbuild.
 * The package name resolves to this checkout's built package exactly as the
 * example's Node self-reference does; nothing is installed or overridden.
 */
export async function bundleHandler(root, row) {
  const bundle = row.bundle;
  if (!bundle || typeof bundle.entry !== 'string') {
    throw new RunError(`${row.id}: apptheory-local-handler rows must name a bundle entry`);
  }
  const entry = path.join(root, row.directory, bundle.entry);
  if (!existsSync(entry)) {
    throw new RunError(`${row.id}: bundle entry ${path.relative(root, entry)} does not exist`);
  }
  const esbuild = path.join(root, 'ts/node_modules/.bin/esbuild');
  if (!existsSync(esbuild)) {
    throw new RunError(`${row.id}: ts/node_modules/.bin/esbuild is missing; run npm ci in ts/ first`);
  }
  const outDir = path.join(cacheRoot(), 'ft2-bundles', dockerPrefixFor(row));
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const dist = path.join(root, 'ts/dist');
  const outfile = path.join(outDir, 'index.js');
  await runCommand({
    command: esbuild,
    args: [
      entry,
      '--bundle',
      '--platform=node',
      '--format=cjs',
      '--target=node24',
      `--alias:@theory-cloud/facetheory=${path.join(dist, 'index.js')}`,
      `--alias:@theory-cloud/facetheory/apptheory=${path.join(dist, 'apptheory/index.js')}`,
      `--outfile=${outfile}`,
    ],
    cwd: root,
    env: process.env,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    label: `${row.id} bundle (esbuild)`,
  });
  return { dir: outDir, entry: outfile };
}

let requestCounter = 0;

function nextRequestId(rowId) {
  requestCounter += 1;
  return createHash('sha256').update(`${rowId}:${requestCounter}`).digest('hex').slice(0, 32);
}

/**
 * Build a Function URL payload 2.0 event with the shape the AppTheory local
 * runner derives for a Function URL: `$default` route key and stage, and a
 * `.lambda-url.<region>.on.aws` domain.
 */
export function functionUrlEvent({
  rowId,
  method = 'GET',
  path: requestPath = '/',
  query = '',
  body,
  headers = {},
}) {
  const domainName = 'facetheory-examples-local.lambda-url.us-east-1.on.aws';
  const normalized = {};
  for (const [name, value] of Object.entries(headers)) {
    normalized[name.toLowerCase()] = String(value);
  }
  if (normalized.host === undefined) normalized.host = domainName;
  const event = {
    version: '2.0',
    routeKey: '$default',
    rawPath: requestPath,
    rawQueryString: query,
    headers: normalized,
    requestContext: {
      accountId: '123456789012',
      apiId: 'local',
      domainName,
      http: {
        method,
        path: requestPath,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'facetheory-examples-local',
      },
      requestId: nextRequestId(rowId),
      routeKey: '$default',
      stage: '$default',
    },
    isBase64Encoded: false,
  };
  if (normalized.cookie !== undefined) {
    event.cookies = normalized.cookie
      .split(';')
      .map((cookie) => cookie.trim())
      .filter((cookie) => cookie.length > 0);
    delete event.headers.cookie;
  }
  if (body !== undefined) event.body = body;
  return event;
}

class LineReader {
  constructor(stream) {
    this.buffer = '';
    this.lines = [];
    this.waiters = [];
    this.closed = false;
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      this.buffer += chunk;
      let index = this.buffer.indexOf('\n');
      while (index >= 0) {
        this.push(this.buffer.slice(0, index));
        this.buffer = this.buffer.slice(index + 1);
        index = this.buffer.indexOf('\n');
      }
    });
    stream.on('end', () => {
      if (this.buffer.length > 0) this.push(this.buffer);
      this.closed = true;
      for (const waiter of this.waiters.splice(0)) {
        waiter.reject(new RunError('apptheory-local closed its result stream'));
      }
    });
  }

  push(line) {
    const waiter = this.waiters.shift();
    if (waiter) waiter.resolve(line);
    else this.lines.push(line);
  }

  next(timeoutMs) {
    if (this.lines.length > 0) return Promise.resolve(this.lines.shift());
    if (this.closed) return Promise.reject(new RunError('apptheory-local closed its result stream'));
    return new Promise((resolve, reject) => {
      const waiter = { resolve: undefined, reject: undefined };
      const timer = setTimeout(() => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(new RunError(`apptheory-local did not answer within ${timeoutMs}ms`));
      }, timeoutMs);
      waiter.resolve = (value) => {
        clearTimeout(timer);
        resolve(value);
      };
      waiter.reject = (error) => {
        clearTimeout(timer);
        reject(error);
      };
      this.waiters.push(waiter);
    });
  }
}

async function waitForRunnerReady({ child, logPath, timeoutMs }) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child.exitCode !== null) {
      throw new RunError(
        `apptheory-local exited with code ${child.exitCode} before it was ready`,
        readLog(logPath),
      );
    }
    const log = await readFile(logPath, 'utf8').catch(() => '');
    if (/function .* ready on|local-run: ready/.test(log)) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new RunError(`apptheory-local was not ready within ${timeoutMs}ms`, readLog(logPath));
}

/**
 * Start one warm handler container with the producer's `invoke --stdio` mode.
 * The container keeps state across events; every event is a real invocation
 * through the Runtime Interface Emulator inside the official runtime image.
 */
export async function startInvokeSession({ root, row, runner, env }) {
  const bundle = await bundleHandler(root, row);
  const prefix = dockerPrefixFor(row);
  const { child, logPath } = startRecordedProcess({
    command: runner.binary,
    args: [
      'invoke',
      '--handler-dir',
      bundle.dir,
      '--runtime',
      row.runtime,
      '--handler',
      row.handler,
      '--profile',
      runner.profile,
      '--name-prefix',
      prefix,
      '--stdio',
    ],
    cwd: root,
    env,
    root,
    row: row.id,
    binary: runner.binary,
    dockerPrefix: prefix,
  });
  const reader = new LineReader(child.stdout);
  try {
    await waitForRunnerReady({ child, logPath, timeoutMs: 180_000 });
  } catch (error) {
    await stopProcess(child, { timeoutMs: 10_000 });
    clearProcess(root, child.pid);
    await cleanupDockerPrefix(prefix).catch(() => {});
    throw error;
  }

  const call = async (event, timeoutMs = 180_000) => {
    if (child.exitCode !== null) {
      throw new RunError(
        `apptheory-local exited with code ${child.exitCode} before answering`,
        readLog(logPath),
      );
    }
    try {
      child.stdin.write(`${JSON.stringify(event)}\n`);
    } catch (error) {
      throw new RunError(
        `apptheory-local closed its input: ${error instanceof Error ? error.message : String(error)}`,
        readLog(logPath),
      );
    }
    const line = await reader.next(timeoutMs).catch((error) => {
      throw new RunError(
        `${error.message}`,
        readLog(logPath),
      );
    });
    try {
      return JSON.parse(line);
    } catch {
      throw new RunError(`apptheory-local returned non-JSON: ${line.slice(0, 500)}`, readLog(logPath));
    }
  };

  const close = async () => {
    if (child.exitCode === null) {
      try {
        child.stdin.end();
      } catch {
        // The producer may have already closed the pipe.
      }
      const exited = await waitForChildExit(child, 30_000);
      if (!exited) await stopProcess(child, { timeoutMs: 10_000 });
    }
    clearProcess(root, child.pid);
    const removed = await cleanupDockerPrefix(prefix);
    return removed;
  };

  return { call, close, prefix, logPath };
}

export function lambdaHeader(result, name) {
  const value = result?.headers?.[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

export function assertProxyResult(result, label) {
  if (result?.proxy !== true) {
    throw new RunError(`${label}: handler did not return a Lambda proxy response: ${JSON.stringify(result).slice(0, 500)}`);
  }
  if (result.streamed !== true) {
    throw new RunError(`${label}: the response was not the RIE's framed streaming response`);
  }
}
