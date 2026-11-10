#!/usr/bin/env node
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { discoverTree } from './lib/tree.mjs';
import {
  ManifestError,
  loadRows,
  validateLedger,
  validateManifest,
} from './lib/manifest.mjs';
import {
  DEFAULT_TIMEOUT_MS,
  RunError,
  acquireLock,
  assertDockerAvailable,
  assertLocalAwsEndpoints,
  cleanEnvironment,
  cleanupDockerPrefix,
  clearProcess,
  httpRequest,
  isProcessAlive,
  rawHttpChunks,
  logDirectory,
  readLog,
  runCommand,
  startServer,
  stateFile,
  stopProcess,
  stopRecordedProcesses,
  waitForPort,
} from './lib/runtime.mjs';
import { RUNNERS } from './lib/runners.mjs';
import {
  prepareRowStorage,
  stopStorageBackends,
  storageProfile,
} from './lib/storage.mjs';
import {
  FT2_RUNNERS,
  cloudFrontControls,
  dockerPrefixFor,
  ensureApptheoryLocal,
  profilePath,
} from './lib/apptheory.mjs';

const SCRIPT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MANIFEST_PATH = 'scripts/local/examples-local.json';
const LEDGER_PATH = 'scripts/local/examples-local-ledger.json';

function usage() {
  console.log(`FaceTheory local examples harness

Usage:
  node scripts/local/run-examples-local.mjs [options]

Options:
  --only <row-id>   run one classified row (its build and serve steps included)
  --list            list classified rows and exit
  --down            stop every process this checkout's harness started
  --install-runner  install the released apptheory-local pinned in the manifest
  --help            show this help
`);
}

function parseArgs(argv) {
  const options = { only: undefined, list: false, down: false, installRunner: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--list') options.list = true;
    else if (arg === '--down') options.down = true;
    else if (arg === '--install-runner') options.installRunner = true;
    else if (arg === '--only') {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) throw new RunError('--only requires a row id');
      options.only = value;
      index += 1;
    } else {
      throw new RunError(`unknown argument: ${arg}`);
    }
  }
  return options;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function portIsFree(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE') resolve(false);
      else reject(error);
    });
    server.listen({ port, host: '127.0.0.1', exclusive: true }, () => {
      server.close(() => resolve(true));
    });
  });
}

async function preflight({ root, manifest, rows }) {
  const errors = [];
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 24) errors.push(`Node 24 or newer is required; this is ${process.versions.node}`);
  if (!existsSync(path.join(root, 'ts/node_modules'))) {
    errors.push('ts/node_modules is missing; run npm ci in ts/ first');
  }
  if (!existsSync(path.join(root, 'ts/dist/index.js'))) {
    errors.push('ts/dist/index.js is missing; run make ts-build first');
  }
  for (const stack of ['infra/apptheory-ssr-site', 'infra/apptheory-ssg-isr-site']) {
    if (!existsSync(path.join(root, stack, 'node_modules'))) {
      errors.push(`${stack}/node_modules is missing; run make examples-local-infra-deps`);
    }
  }
  if (!(await portIsFree(8299))) {
    errors.push('reserved AWS endpoint port 8299 is already in use');
  }
  const requirements = ['node', 'npm'];
  const serving = rows.filter((row) => row.serve !== undefined && row.pending === undefined);
  const needsRunner = rows.some((row) => FT2_RUNNERS.has(row.runner));
  if (needsRunner) requirements.push('go');
  if (storageProfile(manifest) || needsRunner) requirements.push('docker');
  for (const name of requirements) {
    const probe = await runCommand({ command: 'sh', args: ['-c', `command -v ${name}`], cwd: root, env: process.env, timeoutMs: 10_000 }).catch(() => null);
    if (!probe) errors.push(`${name} is not on PATH`);
  }
  const env = cleanEnvironment();
  try {
    assertLocalAwsEndpoints(env);
  } catch (error) {
    errors.push(error.message);
  }

  const state = stateFile(root);
  if (existsSync(state)) {
    try {
      const parsed = JSON.parse(readFileSync(state, 'utf8'));
      const live = (parsed.processes ?? []).filter((entry) => Number.isInteger(entry.pid) && isProcessAlive(entry.pid));
      if (live.length > 0) {
        errors.push(
          `this checkout still has ${live.length} recorded harness process(es); run make examples-local-down`,
        );
      }
    } catch {
      errors.push(`state file ${state} is unreadable; run make examples-local-down`);
    }
  }

  for (const row of serving) {
    if (!Number.isInteger(row.port)) continue;
    if (!(await portIsFree(row.port))) {
      errors.push(`port ${row.port} for ${row.id} is already in use`);
    }
  }

  const storage = storageProfile(manifest);
  if (storage && serving.some((row) => row.storage !== undefined)) {
    for (const [name, port] of Object.entries(storage.ports ?? {})) {
      if (!(await portIsFree(port))) {
        errors.push(
          `FT3 storage port ${port} (${name}) is already in use; run make examples-local-down`,
        );
      }
    }
  }

  const first = manifest.profile?.ports?.first;
  const last = manifest.profile?.ports?.last;
  if (Number.isInteger(first) && Number.isInteger(last)) {
    console.log(`profile: ${manifest.profile.name ?? 'facetheory-examples-local'}; example ports ${first}-${last}; no AWS`);
  }
  return errors;
}

function npmCommand({ cwd, script, args = [] }) {
  return {
    command: 'npm',
    args: ['--prefix', cwd, 'run', script, '--', ...args],
    cwd: SCRIPT_ROOT,
  };
}

async function runBuilds({ root, row, env }) {
  for (const build of row.build ?? []) {
    const cwd = path.resolve(root, build.cwd);
    const command = npmCommand({ cwd: build.cwd, script: build.script, args: build.args ?? [] });
    await runCommand({
      ...command,
      env,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      label: `${row.id} build (npm run ${build.script} in ${build.cwd})`,
    });
  }
}

function serveCommand({ root, row, port, apptheory }) {
  const serve = row.serve;
  if (!serve) return null;
  if (serve.kind === 'node') {
    return {
      command: process.execPath,
      args: ['--import', 'tsx', ...(serve.args ?? [])],
      cwd: path.resolve(root, serve.cwd ?? 'ts'),
    };
  }
  if (serve.kind === 'npm') {
    const cwd = path.resolve(root, serve.cwd);
    const args = ['--port', String(port), ...(serve.args ?? [])];
    return npmCommand({ cwd: serve.cwd, script: serve.script, args });
  }
  if (serve.kind === 'apptheory-local') {
    if (!apptheory) throw new RunError(`${row.id}: the apptheory-local serve recipe has no resolved runner`);
    const app = path.resolve(root, serve.app);
    const prefix = dockerPrefixFor(row);
    const args = [
      'run',
      '--app',
      app,
      '--profile',
      apptheory.profile,
      '--name-prefix',
      prefix,
      '--port-base',
      String(port),
    ];
    for (const backend of serve.backends ?? []) args.push('--backend', backend);
    return {
      command: apptheory.binary,
      args,
      cwd: root,
      binary: apptheory.binary,
      dockerPrefix: prefix,
      stopTimeoutMs: 30_000,
    };
  }
  throw new RunError(`${row.id}: unknown serve.kind ${String(serve.kind)}`);
}

/**
 * The runner assigns each public surface its own port. Since v7.1.0 the
 * Function URL takes the port base and CloudFront follows, and the AWS_IAM
 * Function URL refuses unsigned viewer requests, so a gateway row must talk to
 * the listener the runner reports rather than assume the row port is CloudFront.
 */
async function publicSurfacePort({ row, logPath }) {
  if (row.serve?.publicSurface !== 'cloudfront') return row.port;
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      return Number(new URL(cloudFrontControls(logPath).gateway).port);
    } catch (error) {
      if (!(error instanceof RunError)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new RunError(`${row.id}: the runner log does not report a served CloudFront distribution`);
}

async function prepareApptheoryRow({ root, row, manifest }) {
  if (!FT2_RUNNERS.has(row.runner)) return null;
  try {
    assertDockerAvailable();
  } catch (error) {
    throw new RunError(
      `${row.id}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const profile = profilePath(root);
  if (!existsSync(profile)) {
    throw new RunError(`${row.id}: ${path.relative(root, profile)} is missing`);
  }
  return await ensureApptheoryLocal(root, manifest);
}

async function stopRow({ child, root, dockerPrefix, timeoutMs }) {
  if (child) {
    await stopProcess(child, { timeoutMs: timeoutMs ?? 5000 });
    clearProcess(root, child.pid);
  }
  if (dockerPrefix) return await cleanupDockerPrefix(dockerPrefix);
  return [];
}

function statusLabel(status) {
  return status.toUpperCase();
}

function printReport({ rows, results, errors, warnings }) {
  console.log('');
  console.log('FaceTheory local examples');
  console.log('row'.padEnd(46), 'class'.padEnd(6), 'port'.padEnd(5), 'status'.padEnd(8), 'detail');
  for (const row of rows) {
    const result = results.get(row.id);
    console.log(
      row.id.padEnd(46),
      String(row.class).padEnd(6),
      String(row.port ?? '-').padEnd(5),
      statusLabel(result?.status ?? 'not-run').padEnd(8),
      result?.detail ?? '',
    );
  }

  const counts = { L1: 0, L2: 0, L3: 0, I: 0 };
  for (const row of rows) counts[row.class] = (counts[row.class] ?? 0) + 1;
  const passed = rows.filter((row) => results.get(row.id)?.status === 'passed').length;
  const failed = rows.filter((row) => results.get(row.id)?.status === 'failed').length;
  const pending = rows.filter((row) => results.get(row.id)?.status === 'pending');
  const pendingByMilestone = {};
  for (const row of pending) {
    const milestone = results.get(row.id)?.milestone ?? 'unknown';
    pendingByMilestone[milestone] = (pendingByMilestone[milestone] ?? 0) + 1;
  }

  console.log('');
  console.log(
    `class counts: L1=${counts.L1} L2=${counts.L2} L3=${counts.L3} I=${counts.I}; passed=${passed} failed=${failed} pending=${pending.length}`,
  );
  const milestones = Object.entries(pendingByMilestone)
    .map(([milestone, count]) => `${milestone}=${count}`)
    .join(' ');
  if (milestones) console.log(`pending milestones: ${milestones}`);
  if (warnings.length > 0) {
    console.log('warnings:');
    for (const warning of warnings) console.log(`  - ${warning}`);
  }
  if (errors.length > 0) {
    console.log('');
    console.log('failures:');
    for (const error of errors) {
      console.log(`  - ${error.message}`);
      if (error.output) {
        const lines = error.output.trim().split('\n').slice(-40);
        for (const line of lines) console.log(`      ${line}`);
      }
    }
  }
  console.log('');
  console.log(errors.length === 0 && failed === 0 ? 'RESULT: PASS' : 'RESULT: FAIL');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  const root = SCRIPT_ROOT;
  const manifest = await readJson(path.join(root, MANIFEST_PATH));
  if (options.installRunner) {
    const runner = await ensureApptheoryLocal(root, manifest);
    console.log(`apptheory-local ${runner.version} verified at ${runner.binary}`);
    return;
  }
  if (options.down) {
    const results = await stopRecordedProcesses(root);
    if (results.length === 0) {
      console.log('examples-local-down: no recorded processes for this checkout');
    } else {
      for (const result of results) {
        console.log(
          `examples-local-down: ${result.stopped ? 'stopped' : 'left'} pid ${result.pid}${result.row ? ` (${result.row})` : ''}: ${result.reason}`,
        );
      }
      const leftovers = results.filter((result) => !result.stopped && result.reason !== 'already exited');
      if (leftovers.length > 0) {
        console.log(`examples-local-down: ${leftovers.length} process(es) were not ours and were left running`);
      }
    }
    const storageResults = await stopStorageBackends({ root, manifest });
    if (storageResults.length === 0) {
      console.log('examples-local-down: no FT3 storage backends for this checkout');
    } else {
      for (const result of storageResults) {
        console.log(
          `examples-local-down: ${result.stopped ? 'removed' : 'left'} ${result.name}: ${result.reason}`,
        );
      }
    }
    return;
  }

  const ledger = await readJson(path.join(root, LEDGER_PATH));
  const tree = await discoverTree(root);
  const validation = validateManifest(root, manifest, tree);
  const rows = validation.rows.length > 0 ? validation.rows : loadRows(manifest);
  const ordered = [...rows].sort((left, right) => {
    const leftHost = left.runner === 'via-host' ? 1 : 0;
    const rightHost = right.runner === 'via-host' ? 1 : 0;
    return leftHost - rightHost;
  });

  if (options.list) {
    console.log('id\tclass\tport\tentrypoints');
    for (const row of ordered) {
      console.log(`${row.id}\t${row.class}\t${row.port ?? '-'}\t${row.entrypoints.join(',')}`);
    }
    return;
  }

  let selected = ordered;
  if (options.only) {
    selected = ordered.filter((row) => row.id === options.only);
    if (selected.length === 0) throw new RunError(`--only row not found: ${options.only}`);
  }

  const ledgerCheck = validateLedger(ledger, rows);
  const errors = [...validation.errors.map((message) => new RunError(message)), ...ledgerCheck.errors.map((message) => new RunError(message))];
  const preflightErrors = await preflight({ root, manifest, rows: selected });
  errors.push(...preflightErrors.map((message) => new RunError(message)));

  if (errors.length > 0) {
    const failedRows = new Map(
      ledgerCheck.failures.map((failure) => [failure.row, failure.message]),
    );
    const early = new Map();
    for (const row of selected) {
      if (failedRows.has(row.id)) {
        early.set(row.id, { status: 'failed', detail: failedRows.get(row.id) });
      }
    }
    printReport({
      rows: selected,
      results: early,
      errors,
      warnings: validation.warnings,
    });
    process.exitCode = 1;
    return;
  }

  const releaseLock = acquireLock(root);
  const env = cleanEnvironment();
  const results = new Map();
  const failures = [];
  let current = null;

  const shutdown = async () => {
    if (current) {
      try {
        await stopRow({
          child: current.child,
          root,
          dockerPrefix: current.dockerPrefix,
          timeoutMs: current.stopTimeoutMs,
        });
      } catch {
        // The down command performs the same scoped cleanup from the state file.
      }
      current = null;
    }
    for (const entry of results.values()) {
      if (entry.child) {
        await stopProcess(entry.child);
        clearProcess(root, entry.child.pid);
      }
    }
    await stopStorageBackends({ root, manifest }).catch(() => {});
  };
  process.once('SIGINT', () => {
    void shutdown().finally(() => {
      releaseLock();
      process.exit(130);
    });
  });
  process.once('SIGTERM', () => {
    void shutdown().finally(() => {
      releaseLock();
      process.exit(143);
    });
  });

  try {
    for (const row of selected) {
      if (row.pending !== undefined) {
        results.set(row.id, { status: 'pending', milestone: row.pending, detail: `${row.pending}: ${row.gap}` });
        console.log(`PENDING ${row.id} (${row.pending}): ${row.gap}`);
        continue;
      }

      if (!RUNNERS[row.runner] || row.runner === 'pending') {
        failures.push(new RunError(`${row.id}: unknown runner ${String(row.runner)}`));
        results.set(row.id, { status: 'failed', detail: `unknown runner ${String(row.runner)}` });
        continue;
      }

      console.log(`RUN ${row.id} (${row.class}${row.port ? ` :${row.port}` : ''})`);
      let child;
      let logPath;
      let command;
      let storage;
      let rowEnv = env;
      try {
        const apptheory = await prepareApptheoryRow({ root, row, manifest });
        await runBuilds({ root, row, env });
        command = serveCommand({ root, row, port: row.port, apptheory });
        if (row.storage !== undefined) {
          storage = await prepareRowStorage({ root, manifest, row });
          rowEnv = { ...env, ...storage.env };
        }
        let request;
        if (command) {
          const started = startServer({
            ...command,
            env: rowEnv,
            root,
            row: row.id,
            port: row.port,
          });
          current = {
            ...started,
            dockerPrefix: command.dockerPrefix,
            stopTimeoutMs: command.stopTimeoutMs,
          };
          child = started.child;
          logPath = started.logPath;
          await waitForPort({ port: row.port, child, logPath });
          const requestPort = await publicSurfacePort({ row, logPath });
          request = (requestPath, requestOptions) =>
            httpRequest({ port: requestPort, path: requestPath, ...requestOptions });
          request.rawChunks = (requestPath) => rawHttpChunks({ port: requestPort, path: requestPath });
        }
        const outcome = await RUNNERS[row.runner]({
          row,
          root,
          request,
          results,
          logPath,
          apptheory,
          env: rowEnv,
          storage,
        });
        if (child) {
          await stopRow({
            child,
            root,
            dockerPrefix: command?.dockerPrefix,
            timeoutMs: command?.stopTimeoutMs,
          });
          child = null;
          current = null;
        }
        results.set(row.id, { status: 'passed', detail: outcome?.detail ?? '', library: outcome?.library === true });
        console.log(`PASS ${row.id}: ${outcome?.detail ?? 'ok'}`);
      } catch (error) {
        const failure =
          error instanceof RunError || error instanceof ManifestError
            ? error
            : new RunError(`${row.id}: ${error instanceof Error ? error.message : String(error)}`);
        failures.push(failure);
        results.set(row.id, { status: 'failed', detail: failure.message, child });
        console.log(`FAIL ${row.id}: ${failure.message}`);
        if (logPath) {
          const tail = readLog(logPath);
          if (tail) console.log(tail.split('\n').slice(-20).map((line) => `  ${line}`).join('\n'));
        }
      } finally {
        if (child) {
          try {
            await stopRow({
              child,
              root,
              dockerPrefix: command?.dockerPrefix,
              timeoutMs: command?.stopTimeoutMs,
            });
          } catch (cleanupError) {
            const failure =
              cleanupError instanceof RunError
                ? cleanupError
                : new RunError(
                    `${row.id}: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
                  );
            failures.push(failure);
            results.set(row.id, { status: 'failed', detail: failure.message });
            console.log(`FAIL ${row.id}: ${failure.message}`);
          }
        }
        current = null;
      }
    }
  } finally {
    try {
      const cleanup = await stopStorageBackends({ root, manifest });
      for (const result of cleanup) {
        if (!result.stopped) {
          failures.push(
            new RunError(`storage cleanup left ${result.name}: ${result.reason}`),
          );
        }
      }
    } catch (error) {
      failures.push(
        new RunError(
          `storage cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
    releaseLock();
  }

  if (failures.length === 0) {
    rmSync(logDirectory(root), { recursive: true, force: true });
  }
  printReport({
    rows: selected,
    results,
    errors: failures,
    warnings: validation.warnings,
  });
  if (failures.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`examples-local: ${error instanceof Error ? error.message : String(error)}`);
  if (error?.output) console.error(error.output);
  process.exitCode = 1;
});
