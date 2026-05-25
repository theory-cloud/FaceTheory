import assert from 'node:assert/strict';
import test from 'node:test';

import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { readFile, rm, stat } from 'node:fs/promises';
import { createConnection, createServer } from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { JSDOM } from 'jsdom';

import type { FaceNavigationBootstrapModule } from '../../src/spa.js';
import type { ViteManifest } from '../../src/vite.js';
import {
  assertStrictCspDocument,
  createStrictCspFixtureFetch,
  exerciseStrictCspExternalNavigation,
  flushStrictCspBrowserTasks,
  installStrictCspBrowserGlobals,
} from '../helpers/strict-csp.js';

const execFileAsync = promisify(execFile);

declare global {
  interface Window {
    __FACETHEORY_STRICT_CSP_SVELTE_DATA__?: unknown;
    __FACETHEORY_STRICT_CSP_SVELTE_HYDRATED__?: number;
    __FACETHEORY_STRICT_CSP_SVELTE_NAVIGATED__?: number;
  }
}

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
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
    throw new Error(
      'Failed to reserve an ephemeral port for the strict CSP Svelte example',
    );
  }
  const { port } = address;
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
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
          `Strict CSP Svelte example server exited before listening (code=${code}, signal=${signal})\n${logs}`,
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

async function sendRawHttpRequest(
  port: number,
  request: string,
): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    const chunks: Buffer[] = [];
    let settled = false;

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(error);
    };

    socket.setTimeout(2_000, () =>
      fail(new Error('Timed out waiting for raw HTTP response')),
    );
    socket.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    socket.once('error', fail);
    socket.once('connect', () => socket.end(request));
    socket.once('close', () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
  });
}

function extractHydrationHref(html: string): string {
  const dom = new JSDOM(html, { url: 'http://localhost/' });
  try {
    const marker = dom.window.document.getElementById(
      '__FACETHEORY_DATA_URL__',
    );
    assert.equal(marker?.tagName.toLowerCase(), 'link');
    const href = marker?.getAttribute('href');
    assert.ok(href, 'expected FaceTheory hydration link href');
    return href;
  } finally {
    dom.window.close();
  }
}

function decodeBody(body: Uint8Array): string {
  return new TextDecoder().decode(body);
}

test(
  'vite strict CSP svelte example: renders external assets and framework SSR hydration sidecars',
  { concurrency: false },
  async () => {
    const cwd = path.resolve('.');

    const distDir = path.resolve('examples/vite-strict-csp-svelte/dist');
    await rm(distDir, { recursive: true, force: true });

    await execFileAsync(
      'npm',
      ['run', 'example:vite:svelte:strict-csp:build'],
      { cwd },
    );

    const manifestPath = path.resolve(
      'examples/vite-strict-csp-svelte/dist/client/.vite/manifest.json',
    );
    const manifestRaw = await readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestRaw) as ViteManifest;
    const entry = manifest['src/entry-client.ts'];
    assert.ok(entry);
    assert.ok(entry.css?.length, 'strict example must emit external CSS');
    assert.ok(entry.assets?.length, 'strict example must emit external assets');

    const serverEntryPath = path.resolve(
      'examples/vite-strict-csp-svelte/dist/server/entry-server.js',
    );
    assert.ok(await exists(serverEntryPath));

    const serverMod = await import(pathToFileURL(serverEntryPath).href);
    const app = serverMod.createViteStrictCspSvelteExampleApp(manifest);

    const resp = await app.handle({ method: 'GET', path: '/' });
    assert.equal(resp.status, 200);
    assert.equal(resp.headers['content-security-policy']?.length, 1);

    const body = decodeBody(resp.body as Uint8Array);
    assert.ok(body.includes('FaceTheory Strict CSP Svelte'));
    assert.ok(body.includes('Svelte + Vite without inline output'));
    assert.ok(body.includes('Hello from strict external hydration home'));
    assert.ok(body.includes('data-facetheory-view'));
    assert.ok(body.includes('id="__FACETHEORY_DATA_URL__"'));
    assert.equal(body.includes('/_facetheory/data/'), false);
    assert.ok(body.includes('type="module"'));
    assertStrictCspDocument(body, { url: 'http://localhost/' });

    const dataUrl = extractHydrationHref(body);
    assert.match(dataUrl, /^\/_facetheory\/ssr-data\//);

    const sidecarResp = await app.handle({ method: 'GET', path: dataUrl });
    assert.equal(sidecarResp.status, 200);
    assert.equal(
      sidecarResp.headers['content-type']?.[0],
      'application/json; charset=utf-8',
    );
    assert.equal(sidecarResp.headers['cache-control']?.[0], 'no-store');
    const sidecarBody = decodeBody(sidecarResp.body as Uint8Array);
    assert.equal(sidecarBody.includes('<!doctype html>'), false);
    assert.deepEqual(
      JSON.parse(sidecarBody),
      serverMod.strictCspSvelteDataForPath('/'),
    );
    assert.equal(serverMod.strictCspSvelteHydrationJsonForPath, undefined);
    assert.equal(serverMod.strictCspSvelteHydrationDataUrl, undefined);

    const injectedPaths = new Set<string>();
    for (const match of body.matchAll(
      /<(?:link|script|img)\b[^>]*(?:href|src)="([^"]+)"/g,
    )) {
      const candidate = match[1];
      if (!candidate || !candidate.startsWith('/assets/')) continue;
      injectedPaths.add(candidate);
    }
    assert.ok(injectedPaths.size > 0);

    for (const injectedPath of injectedPaths) {
      const builtPath = path.resolve(
        'examples/vite-strict-csp-svelte/dist/client',
        `.${injectedPath}`,
      );
      assert.ok(
        await exists(builtPath),
        `missing built asset: ${injectedPath}`,
      );
    }
  },
);

test(
  'vite strict CSP svelte example server: malformed request targets return 400 without exiting',
  { concurrency: false },
  async () => {
    const cwd = path.resolve('.');
    await execFileAsync(
      'npm',
      ['run', 'example:vite:svelte:strict-csp:build'],
      { cwd },
    );
    const serverEntryPath = path.resolve(
      'examples/vite-strict-csp-svelte/dist/server/entry-server.js',
    );
    const serverMod = await import(pathToFileURL(serverEntryPath).href);

    const port = await reservePort();
    const server = await startExampleServer(
      cwd,
      'examples/vite-strict-csp-svelte/node-server.ts',
      port,
    );

    try {
      const malformedResp = await sendRawHttpRequest(
        port,
        [
          'GET http://% HTTP/1.1',
          `Host: 127.0.0.1:${port}`,
          'Connection: close',
          '',
          '',
        ].join('\r\n'),
      );
      assert.match(malformedResp, /^HTTP\/1\.1 400 Bad Request\r\n/);
      assert.ok(malformedResp.includes('Bad Request'));
      assert.equal(server.exitCode, null);

      const healthyResp = await fetch(`http://127.0.0.1:${port}/`);
      assert.equal(healthyResp.status, 200);
      const healthyBody = await healthyResp.text();
      assert.match(healthyBody, /FaceTheory Strict CSP Svelte/);
      assert.equal(healthyBody.includes('/_facetheory/data/'), false);

      const dataUrl = extractHydrationHref(healthyBody);
      assert.match(dataUrl, /^\/_facetheory\/ssr-data\//);
      const dataResp = await fetch(`http://127.0.0.1:${port}${dataUrl}`);
      assert.equal(dataResp.status, 200);
      assert.equal(
        dataResp.headers.get('content-type'),
        'application/json; charset=utf-8',
      );
      assert.equal(dataResp.headers.get('cache-control'), 'no-store');
      const dataText = await dataResp.text();
      assert.equal(dataText.includes('<!doctype html>'), false);
      assert.deepEqual(
        JSON.parse(dataText),
        serverMod.strictCspSvelteDataForPath('/'),
      );

      const oldDataResp = await fetch(
        `http://127.0.0.1:${port}/_facetheory/data/strict-csp-svelte-home.json`,
      );
      assert.equal(oldDataResp.status, 404);

      const assetPath = healthyBody.match(
        /<(?:link|script|img)\b[^>]*(?:href|src)="(\/assets\/[^"]+)"/,
      )?.[1];
      assert.ok(assetPath);
      const assetResp = await fetch(`http://127.0.0.1:${port}${assetPath}`);
      assert.equal(assetResp.status, 200);
      assert.equal(server.exitCode, null);
    } finally {
      await stopExampleServer(server);
    }
  },
);

test(
  'vite strict CSP svelte example: browser harness hydrates and navigates with external data',
  { concurrency: false },
  async () => {
    const cwd = path.resolve('.');
    await execFileAsync(
      'npm',
      ['run', 'example:vite:svelte:strict-csp:build'],
      { cwd },
    );

    const manifestPath = path.resolve(
      'examples/vite-strict-csp-svelte/dist/client/.vite/manifest.json',
    );
    const manifest = JSON.parse(
      await readFile(manifestPath, 'utf8'),
    ) as ViteManifest;
    const serverEntryPath = path.resolve(
      'examples/vite-strict-csp-svelte/dist/server/entry-server.js',
    );
    const serverMod = await import(pathToFileURL(serverEntryPath).href);
    const app = serverMod.createViteStrictCspSvelteExampleApp(manifest);

    const homeResp = await app.handle({ method: 'GET', path: '/' });
    const homeHtml = new TextDecoder().decode(homeResp.body as Uint8Array);
    const nextResp = await app.handle({ method: 'GET', path: '/next' });
    const nextHtml = new TextDecoder().decode(nextResp.body as Uint8Array);

    assertStrictCspDocument(homeHtml, { url: 'http://localhost/' });
    assertStrictCspDocument(nextHtml, { url: 'http://localhost/next' });

    assert.equal(homeHtml.includes('/_facetheory/data/'), false);
    assert.equal(nextHtml.includes('/_facetheory/data/'), false);
    const homeDataUrl = extractHydrationHref(homeHtml);
    const nextDataUrl = extractHydrationHref(nextHtml);
    assert.match(homeDataUrl, /^\/_facetheory\/ssr-data\//);
    assert.match(nextDataUrl, /^\/_facetheory\/ssr-data\//);

    const homeData = serverMod.strictCspSvelteDataForPath('/');
    const nextData = serverMod.strictCspSvelteDataForPath('/next');
    const { fetcher, requests } = createStrictCspFixtureFetch(
      {
        [homeDataUrl]: homeData,
      },
      { baseUrl: 'http://localhost/' },
    );

    const dom = new JSDOM(homeHtml, { url: 'http://localhost/' });
    const restoreGlobals = installStrictCspBrowserGlobals(dom);
    const originalFetch = globalThis.fetch;
    const errors: unknown[][] = [];
    const originalConsoleError = console.error;
    const originalWindowConsoleError = dom.window.console.error;
    let clientModule: FaceNavigationBootstrapModule | null = null;
    globalThis.fetch = fetcher;
    console.error = (...args: unknown[]) => errors.push(args);
    dom.window.console.error = (...args: unknown[]) => errors.push(args);

    try {
      const clientEntry = manifest['src/entry-client.ts'];
      assert.ok(clientEntry?.file);
      const clientEntryPath = path.resolve(
        'examples/vite-strict-csp-svelte/dist/client',
        clientEntry.file,
      );
      clientModule = (await import(
        `${pathToFileURL(clientEntryPath).href}?strictCspHydration=${Date.now()}`
      )) as FaceNavigationBootstrapModule;
      await flushStrictCspBrowserTasks();

      assert.deepEqual(requests, [
        new URL(homeDataUrl, 'http://localhost/').toString(),
      ]);
      assert.deepEqual(
        dom.window.__FACETHEORY_STRICT_CSP_SVELTE_DATA__,
        homeData,
      );
      assert.equal(dom.window.__FACETHEORY_STRICT_CSP_SVELTE_HYDRATED__, 1);
      assert.deepEqual(errors, []);
    } finally {
      console.error = originalConsoleError;
      dom.window.console.error = originalWindowConsoleError;
      globalThis.fetch = originalFetch;
      restoreGlobals();
      dom.window.close();
    }

    const navigation = await exerciseStrictCspExternalNavigation({
      currentHtml: homeHtml,
      currentUrl: 'http://localhost/',
      nextHtml,
      nextUrl: 'http://localhost/next',
      dataByUrl: {
        [nextDataUrl]: nextData,
      },
      importModule: async () => {
        assert.ok(clientModule);
        return clientModule;
      },
    });

    try {
      assert.deepEqual(navigation.fetched, [
        'http://localhost/next',
        new URL(nextDataUrl, 'http://localhost/').toString(),
      ]);
      assert.deepEqual(
        navigation.dom.window.__FACETHEORY_STRICT_CSP_SVELTE_DATA__,
        nextData,
      );
      assert.equal(
        navigation.dom.window.__FACETHEORY_STRICT_CSP_SVELTE_NAVIGATED__,
        1,
      );
      assert.equal(
        navigation.dom.window.document.title,
        'FaceTheory Strict CSP Svelte',
      );
      assert.equal(navigation.dom.window.location.pathname, '/next');
    } finally {
      navigation.dom.window.close();
    }
  },
);
