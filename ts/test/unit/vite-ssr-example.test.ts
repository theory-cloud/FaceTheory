import assert from 'node:assert/strict';
import test from 'node:test';

import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { rm, readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

import type { ViteManifest } from '../../src/vite.js';

const execFileAsync = promisify(execFile);

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function reservePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    throw new Error('Failed to reserve an ephemeral port for the Vite SSR example');
  }
  const { port } = address;
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  return port;
}

async function startExampleServer(
  cwd: string,
  entryPoint: string,
  port: number,
): Promise<ChildProcess> {
  const tsxBin = path.resolve(cwd, 'node_modules/.bin/tsx');
  const child = spawn(tsxBin, [entryPoint], {
    cwd,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let logs = '';
  const appendLogs = (chunk: string | Buffer) => {
    logs += chunk.toString();
  };

  child.stdout.on('data', appendLogs);
  child.stderr.on('data', appendLogs);

  await new Promise<void>((resolve, reject) => {
    const readyLine = `listening on http://localhost:${port}/`;

    const onData = () => {
      if (logs.includes(readyLine)) {
        child.stdout.off('data', onData);
        child.stderr.off('data', onData);
        child.off('error', onError);
        child.off('exit', onExit);
        resolve();
      }
    };
    const onError = (error: Error) => {
      child.stdout.off('data', onData);
      child.stderr.off('data', onData);
      child.off('exit', onExit);
      reject(error);
    };
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      child.stdout.off('data', onData);
      child.stderr.off('data', onData);
      child.off('error', onError);
      reject(
        new Error(
          `Vite SSR example server exited before listening (code=${code}, signal=${signal})\n${logs}`,
        ),
      );
    };

    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('error', onError);
    child.once('exit', onExit);
  });

  return child;
}

async function stopExampleServer(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;

  child.kill('SIGTERM');
  await Promise.race([
    once(child, 'exit').then(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
  ]);

  if (child.exitCode === null) {
    child.kill('SIGKILL');
    await once(child, 'exit');
  }
}

test('vite SSR example: builds client+server and renders without missing assets', { concurrency: false }, async () => {
  const cwd = path.resolve('.');

  const distDir = path.resolve('examples/vite-ssr-react/dist');
  await rm(distDir, { recursive: true, force: true });

  await execFileAsync('npm', ['run', 'example:vite:ssr:build'], { cwd });

  const manifestPath = path.resolve('examples/vite-ssr-react/dist/client/.vite/manifest.json');
  const manifestRaw = await readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestRaw) as ViteManifest;
  assert.ok(manifest['src/entry-client.tsx']);

  const serverEntryPath = path.resolve('examples/vite-ssr-react/dist/server/entry-server.js');
  assert.ok(await exists(serverEntryPath));

  const serverMod = await import(pathToFileURL(serverEntryPath).href);
  const app = serverMod.createViteSSRExampleApp(manifest);

  const resp = await app.handle({ method: 'GET', path: '/' });
  const body = new TextDecoder().decode(resp.body as Uint8Array);

  assert.ok(body.includes('Hello from server'));
  assert.ok(body.includes('id="__FACETHEORY_DATA__"'));
  assert.ok(body.includes('type="module"'));

  const injectedPaths = new Set<string>();
  for (const match of body.matchAll(/<(?:link|script)\b[^>]*(?:href|src)="([^"]+)"/g)) {
    const candidate = match[1];
    if (!candidate || !candidate.startsWith('/')) continue;
    injectedPaths.add(candidate);
  }

  assert.ok(injectedPaths.size > 0);

  for (const injectedPath of injectedPaths) {
    const builtPath = path.resolve('examples/vite-ssr-react/dist/client', `.${injectedPath}`);
    assert.ok(await exists(builtPath), `missing built asset: ${injectedPath}`);
  }

  const port = await reservePort();
  const server = await startExampleServer(cwd, 'examples/vite-ssr-react/node-server.ts', port);
  try {
    const malformedResp = await fetch(`http://127.0.0.1:${port}/assets/%E0%A4%A`);
    assert.equal(malformedResp.status, 404);
    assert.equal(await malformedResp.text(), 'Not Found');
    assert.equal(server.exitCode, null);

    const healthyResp = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(healthyResp.status, 200);
    assert.match(await healthyResp.text(), /Hello from server/);
  } finally {
    await stopExampleServer(server);
  }
});
