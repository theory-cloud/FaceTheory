import assert from 'node:assert/strict';
import test from 'node:test';

import { execFile } from 'node:child_process';
import { readFile, rm, stat } from 'node:fs/promises';
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

test(
  'vite strict CSP svelte example: renders external assets and hydration sidecar metadata',
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

    const body = new TextDecoder().decode(resp.body as Uint8Array);
    assert.ok(body.includes('FaceTheory Strict CSP Svelte'));
    assert.ok(body.includes('Svelte + Vite without inline output'));
    assert.ok(body.includes('Hello from strict external hydration home'));
    assert.ok(body.includes('data-facetheory-view'));
    assert.ok(body.includes('id="__FACETHEORY_DATA_URL__"'));
    assert.ok(
      body.includes('href="/_facetheory/data/strict-csp-svelte-home.json"'),
    );
    assert.ok(body.includes('type="module"'));
    assertStrictCspDocument(body, { url: 'http://localhost/' });

    assert.equal(
      serverMod.strictCspSvelteHydrationJsonForPath('/'),
      JSON.stringify(serverMod.strictCspSvelteDataForPath('/')),
    );

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

    const homeData = serverMod.strictCspSvelteDataForPath('/');
    const nextData = serverMod.strictCspSvelteDataForPath('/next');
    const { fetcher, requests } = createStrictCspFixtureFetch(
      {
        '/_facetheory/data/strict-csp-svelte-home.json': homeData,
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
        'http://localhost/_facetheory/data/strict-csp-svelte-home.json',
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
        '/_facetheory/data/strict-csp-svelte-next.json': nextData,
      },
      importModule: async () => {
        assert.ok(clientModule);
        return clientModule;
      },
    });

    try {
      assert.deepEqual(navigation.fetched, [
        'http://localhost/next',
        'http://localhost/_facetheory/data/strict-csp-svelte-next.json',
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
