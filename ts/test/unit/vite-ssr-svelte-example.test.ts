import assert from 'node:assert/strict';
import test from 'node:test';

import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { readFile, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

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
    throw new Error('Failed to reserve an ephemeral port for the Vite SSR svelte example');
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
          `Vite SSR svelte example server exited before listening (code=${code}, signal=${signal})\n${logs}`,
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

test(
  'vite SSR svelte example: builds client+server and renders without missing assets',
  { concurrency: false },
  async () => {
    const cwd = path.resolve('.');

    const distDir = path.resolve('examples/vite-ssr-svelte/dist');
    await rm(distDir, { recursive: true, force: true });

    await execFileAsync('npm', ['run', 'example:vite:svelte:build'], { cwd });

    const manifestPath = path.resolve(
      'examples/vite-ssr-svelte/dist/client/.vite/manifest.json',
    );
    const manifestRaw = await readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestRaw) as ViteManifest;
    assert.ok(manifest['src/entry-client.ts']);

    const serverEntryPath = path.resolve(
      'examples/vite-ssr-svelte/dist/server/entry-server.js',
    );
    assert.ok(await exists(serverEntryPath));

    const serverMod = await import(pathToFileURL(serverEntryPath).href);
    const app = serverMod.createViteSvelteSSRExampleApp(manifest);

    const resp = await app.handle({ method: 'GET', path: '/' });
    const body = new TextDecoder().decode(resp.body as Uint8Array);

    assert.ok(
      body.includes('Svelte SSR Example'),
      `unexpected html: ${body.slice(0, 220)}`,
    );
    assert.ok(
      body.includes('Hello from server'),
      `unexpected html: ${body.slice(0, 220)}`,
    );
    assert.ok(body.includes('facetheory-stitch-shell'));
    assert.ok(body.includes('href="/"'));
    assert.ok(body.includes('href="/dashboard"'));
    assert.ok(body.includes('href="/partners"'));
    // Regression guard for the Svelte Shell slot-forwarding pattern. The
    // example App.svelte does not pass topbarLogo or topbarSurfaceLabel, so
    // the Topbar must not render the logo / surface-label wrapper chrome
    // (which would otherwise contribute phantom empty flex children and the
    // 12px left-edge gap).
    assert.ok(
      !body.includes('facetheory-stitch-topbar-logo'),
      'unexpected topbar logo wrapper when no topbarLogo slot was provided',
    );
    assert.ok(
      !body.includes('facetheory-stitch-topbar-surface-label'),
      'unexpected topbar surface-label wrapper when no topbarSurfaceLabel slot was provided',
    );

    // Positive path: the /brand face renders App.svelte with
    // topbarLogo / topbarSurfaceLabel slots filled. The Shell must forward
    // them and Topbar must render the wrapper chrome around the caller
    // content.
    const brandResp = await app.handle({ method: 'GET', path: '/brand' });
    const brandBody = new TextDecoder().decode(brandResp.body as Uint8Array);
    assert.ok(
      brandBody.includes('facetheory-stitch-topbar-logo'),
      'expected topbar logo wrapper when topbarLogo slot was provided',
    );
    assert.ok(
      brandBody.includes('facetheory-stitch-topbar-surface-label'),
      'expected topbar surface-label wrapper when topbarSurfaceLabel slot was provided',
    );
    assert.ok(brandBody.includes('[Auth]'));
    assert.ok(body.includes('facetheory-stitch-auth-card'));
    assert.ok(body.includes('facetheory-stitch-callout-warning'));
    assert.ok(body.includes('facetheory-stitch-tabs'));
    assert.ok(body.includes('facetheory-stitch-filter-chip-group'));
    assert.ok(body.includes('facetheory-stitch-data-table'));
    assert.ok(body.includes('facetheory-stitch-inline-key-value-list'));
    assert.ok(body.includes('facetheory-stitch-copyable-code'));
    assert.ok(body.includes('facetheory-stitch-destructive-confirm'));
    assert.ok(body.includes('facetheory-stitch-log-stream-terminal'));
    assert.ok(body.includes('id="__FACETHEORY_DATA__"'));
    assert.ok(body.includes('type="module"'));
    assert.ok(body.includes('id="svelte-inline-style"'));

    const injectedPaths = new Set<string>();
    for (const match of body.matchAll(
      /<(?:link|script)\b[^>]*(?:href|src)="([^"]+)"/g,
    )) {
      const candidate = match[1];
      if (!candidate || !candidate.startsWith('/')) continue;
      injectedPaths.add(candidate);
    }
    assert.ok(injectedPaths.size > 0);

    for (const injectedPath of injectedPaths) {
      const builtPath = path.resolve(
        'examples/vite-ssr-svelte/dist/client',
        `.${injectedPath}`,
      );
      assert.ok(
        await exists(builtPath),
        `missing built asset: ${injectedPath}`,
      );
    }

    const port = await reservePort();
    const server = await startExampleServer(
      cwd,
      'examples/vite-ssr-svelte/node-server.ts',
      port,
    );
    try {
      // Malformed percent-decoding must return 400 without terminating the process.
      const malformedResp = await fetch(`http://127.0.0.1:${port}/assets/%E0%A4%A`);
      assert.equal(malformedResp.status, 400);
      assert.equal(await malformedResp.text(), 'Bad Request');
      assert.equal(server.exitCode, null);

      // Ordinary pages and their built assets keep serving.
      const pageResp = await fetch(`http://127.0.0.1:${port}/`);
      assert.equal(pageResp.status, 200);
      assert.match(await pageResp.text(), /Hello from server/);

      const assetPath = [...injectedPaths][0];
      assert.ok(assetPath, 'expected at least one injected asset path');
      const assetResp = await fetch(`http://127.0.0.1:${port}${assetPath}`);
      assert.equal(assetResp.status, 200);
    } finally {
      await stopExampleServer(server);
    }
  },
);
