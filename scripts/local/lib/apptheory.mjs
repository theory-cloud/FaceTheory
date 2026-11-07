import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  DEFAULT_TIMEOUT_MS,
  RunError,
  cacheRoot,
  cleanupDockerPrefix,
  clearProcess,
  httpRequest,
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
  return producerName(`${row.containerPrefix ?? 'ad3'}-${slug}`);
}

export function runnerSpec(manifest) {
  const spec = manifest?.profile?.apptheoryRunner;
  if (
    !spec ||
    typeof spec.module !== 'string' ||
    typeof spec.package !== 'string' ||
    typeof spec.version !== 'string'
  ) {
    throw new RunError(
      'manifest.profile.apptheoryRunner must pin the released runner module, package and version',
    );
  }
  return spec;
}

export function runnerCacheDir(spec) {
  return path.join(cacheRoot(), 'apptheory-local', spec.version);
}

/**
 * Read the module line `go version -m` prints for an installed command. A
 * binary built with `go install <package>@<version>` reports `path` as the
 * package and `mod`/`mod version` as the module and its release tag.
 */
export function parseGoVersionM(output) {
  const info = { path: undefined, module: undefined, version: undefined };
  for (const line of String(output).split('\n')) {
    const fields = line.trim().split('\t');
    if (fields[0] === 'path' && info.path === undefined) info.path = fields[1];
    if (fields[0] === 'mod' && info.module === undefined) {
      info.module = fields[1];
      info.version = fields[2];
    }
  }
  return info;
}

/**
 * Fail closed unless the binary is the exact released command the manifest
 * pins. The check runs before any row starts, so a stale or tampered cache
 * cannot serve a different runner under the pinned version's name.
 */
export function assertRunnerVersion(binary, spec, { run = spawnSync } = {}) {
  const result = run('go', ['version', '-m', binary], { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    throw new RunError(
      `cannot verify the installed apptheory-local at ${binary}: ${
        (result.stderr || result.stdout || (result.error && result.error.message) || 'go version -m failed').trim()
      }`,
    );
  }
  const info = parseGoVersionM(result.stdout);
  if (info.path !== spec.package) {
    throw new RunError(
      `apptheory-local at ${binary} reports command ${String(info.path)}; the manifest pins ${spec.package}`,
    );
  }
  if (info.module !== spec.module || info.version !== spec.version) {
    throw new RunError(
      `apptheory-local at ${binary} reports ${String(info.module)} ${String(info.version)}; the manifest pins ${spec.module} ${spec.version}`,
    );
  }
  return info;
}

/**
 * Install the released runner at the version pinned in the committed manifest.
 * GOBIN is the harness-owned cache, never PATH and never /tmp; no file:
 * dependency, override, vendored binary or floating ref is committed.
 */
export async function ensureApptheoryLocal(root, manifest) {
  const spec = runnerSpec(manifest);
  const key = `${spec.package}@${spec.version}`;
  if (RUNNER_CACHE.has(key)) return RUNNER_CACHE.get(key);

  const go = spawnSync('go', ['version'], { encoding: 'utf8' });
  if (go.status !== 0) {
    throw new RunError(
      `installing apptheory-local needs the Go toolchain on PATH: ${
        (go.stderr || go.stdout || '').trim() || 'go version failed'
      }`,
    );
  }

  const binDir = path.join(runnerCacheDir(spec), 'bin');
  const binary = path.join(binDir, 'apptheory-local');
  if (existsSync(binary)) {
    assertRunnerVersion(binary, spec);
  } else {
    mkdirSync(binDir, { recursive: true });
    await runCommand({
      command: 'go',
      args: ['install', `${spec.package}@${spec.version}`],
      cwd: root,
      env: { ...process.env, GOBIN: binDir },
      timeoutMs: DEFAULT_TIMEOUT_MS,
      label: `go install ${spec.package}@${spec.version}`,
    });
    if (!existsSync(binary)) {
      throw new RunError(`go install ${spec.package}@${spec.version} produced no binary at ${binary}`);
    }
    assertRunnerVersion(binary, spec);
  }

  const runner = {
    binary,
    version: spec.version,
    module: spec.module,
    package: spec.package,
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
  const incremental = row.expect?.incremental === true;
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
      ...(incremental ? ['--stream-chunks'] : []),
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

  const writeEvent = (event) => {
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
  };

  const readLine = async (timeoutMs) => {
    const line = await reader.next(timeoutMs).catch((error) => {
      throw new RunError(`${error.message}`, readLog(logPath));
    });
    try {
      return JSON.parse(line);
    } catch {
      throw new RunError(`apptheory-local returned non-JSON: ${line.slice(0, 500)}`, readLog(logPath));
    }
  };

  const call = async (event, timeoutMs = 180_000) => {
    writeEvent(event);
    return await readLine(timeoutMs);
  };

  /**
   * Read one invocation that carries chunk events before its result line. The
   * runner writes each streamed chunk as it arrives and the result line only
   * after the invocation completes, so a chunk received here is a chunk the
   * client observed while the handler was still running. A buffered response
   * writes no chunk event and fails the incremental assertion.
   *
   * https://docs.aws.amazon.com/lambda/latest/dg/configuration-response-streaming.html
   * https://docs.aws.amazon.com/lambda/latest/dg/runtimes-api.html
   */
  const callStreaming = async (event, timeoutMs = 180_000) => {
    if (!incremental) {
      throw new RunError(
        'the warm invoke session did not start with --stream-chunks; set expect.incremental on the row',
      );
    }
    writeEvent(event);
    const chunks = [];
    for (;;) {
      const parsed = await readLine(timeoutMs);
      if (parsed.event === 'chunk') {
        chunks.push({
          index: parsed.index,
          contentType: parsed.contentType,
          data: Buffer.from(String(parsed.data ?? ''), 'base64'),
          atMs: performance.now(),
        });
        continue;
      }
      if (parsed.event === 'result') {
        return { result: parsed, chunks, resultAtMs: performance.now() };
      }
      throw new RunError(
        `apptheory-local returned an unknown stream event: ${JSON.stringify(parsed).slice(0, 500)}`,
        readLog(logPath),
      );
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

  return { call, callStreaming, close, prefix, logPath };
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

const FUNCTION_URL_DELIMITER = Buffer.alloc(8);

/**
 * Split a Function URL streaming prelude from its payload. The documented
 * format is `{statusCode, headers, cookies}` followed by eight null bytes;
 * API Gateway requires the same delimiter within the first 16 KB.
 *
 * https://docs.aws.amazon.com/lambda/latest/dg/urls-invocation.html
 */
export function parseStreamPrelude(data, label) {
  const index = data.indexOf(FUNCTION_URL_DELIMITER);
  if (index < 0) {
    throw new RunError(
      `${label}: the first streamed chunk carries no Function URL metadata prelude delimiter`,
    );
  }
  let metadata;
  try {
    metadata = JSON.parse(data.subarray(0, index).toString('utf8'));
  } catch {
    throw new RunError(`${label}: the streamed metadata prelude is not JSON`);
  }
  return { metadata, payload: data.subarray(index + FUNCTION_URL_DELIMITER.length) };
}

/**
 * Prove incremental delivery from the runner's chunk events. The document
 * start marker must be in the first payload chunk and the end marker must be
 * absent from it, so the client observed a chunk boundary before the handler
 * finished writing. A buffered response fails: it either carries no chunk
 * event or puts the whole document, end marker included, in the first chunk.
 *
 * https://docs.aws.amazon.com/lambda/latest/dg/configuration-response-streaming.html
 */
export function assertIncrementalStream({
  chunks,
  label,
  startMarker = '<!doctype html>',
  endMarker = '</html>',
  laterMarker,
}) {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    throw new RunError(
      `${label}: no chunk event crossed the runner before the result; the response was buffered`,
    );
  }
  const { metadata, payload } = parseStreamPrelude(chunks[0].data, label);
  const payloads = [];
  if (payload.length > 0) payloads.push(payload);
  for (const chunk of chunks.slice(1)) payloads.push(chunk.data);
  if (payloads.length === 0) {
    throw new RunError(`${label}: the streamed response carried no payload chunk`);
  }
  const firstPayload = payloads[0].toString('utf8');
  if (startMarker && !firstPayload.includes(startMarker)) {
    throw new RunError(`${label}: the first payload chunk does not start the document`);
  }
  if (endMarker && firstPayload.includes(endMarker)) {
    throw new RunError(
      `${label}: the first payload chunk already contains ${endMarker}; the response was fully buffered`,
    );
  }
  const body = Buffer.concat(payloads).toString('utf8');
  if (endMarker && !body.includes(endMarker)) {
    throw new RunError(`${label}: the complete streamed body does not contain ${endMarker}`);
  }
  if (laterMarker) {
    if (firstPayload.includes(laterMarker)) {
      throw new RunError(
        `${label}: the first payload chunk already contains ${laterMarker}; the response was fully buffered`,
      );
    }
    if (!body.includes(laterMarker)) {
      throw new RunError(`${label}: the complete streamed body does not contain ${laterMarker}`);
    }
  }
  return {
    metadata,
    body,
    chunks: chunks.length,
    firstChunkMs: chunks[0].atMs,
  };
}

/**
 * Resolve the local CloudFront control endpoint and distribution from the
 * runner log. The local distribution id is a placeholder derived from the
 * logical id; AppTheory documents the derivation and the invalidation API.
 *
 * https://docs.aws.amazon.com/CloudFront/latest/APIReference/API_CreateInvalidation.html
 */
export function cloudFrontControls(logPath) {
  const log = readLog(logPath) ?? '';
  const api = /cloudfront API at (http:\/\/127\.0\.0\.1:\d+)/.exec(log)?.[1];
  const serving = /serving cloudfront (\S+) at (http:\/\/127\.0\.0\.1:\d+)/.exec(log);
  if (!api) {
    throw new RunError('the runner log does not report its CloudFront invalidation endpoint');
  }
  if (!serving) {
    throw new RunError('the runner log does not report a served CloudFront distribution');
  }
  const logicalId = serving[1];
  const distributionId = `E${createHash('sha256')
    .update(`cloudfront/${logicalId}`)
    .digest('hex')
    .slice(0, 10)
    .toUpperCase()}`;
  return { api, gateway: serving[2], logicalId, distributionId };
}

export async function createInvalidation({ controls, path: invalidationPath, callerReference }) {
  const port = Number(new URL(controls.api).port);
  const body = [
    '<InvalidationBatch xmlns="http://cloudfront.amazonaws.com/doc/2020-05-31/">',
    '<Paths><Quantity>1</Quantity><Items>',
    `<Path>${invalidationPath}</Path>`,
    '</Items></Paths>',
    `<CallerReference>${callerReference}</CallerReference>`,
    '</InvalidationBatch>',
  ].join('');
  const response = await httpRequest({
    port,
    path: `/2020-05-31/distribution/${controls.distributionId}/invalidation`,
    method: 'POST',
    headers: { 'content-type': 'text/xml' },
    body,
  });
  if (response.status !== 201) {
    throw new RunError(
      `CreateInvalidation for ${invalidationPath} answered ${response.status}: ${response.body.slice(0, 500)}`,
    );
  }
  return response;
}
