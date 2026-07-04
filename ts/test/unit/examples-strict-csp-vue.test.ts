import assert from 'node:assert/strict';
import test from 'node:test';

import { execFile } from 'node:child_process';
import { readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { JSDOM } from 'jsdom';

import type { ViteManifest } from '../../src/vite.js';
import { assertStrictCspDocument } from '../helpers/strict-csp.js';

const execFileAsync = promisify(execFile);

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function decodeBody(body: Uint8Array): string {
  return new TextDecoder().decode(body);
}

function extractHydrationHref(html: string): string {
  const dom = new JSDOM(html, { url: 'http://localhost/' });
  try {
    const marker = dom.window.document.getElementById('__FACETHEORY_DATA_URL__');
    assert.equal(marker?.tagName.toLowerCase(), 'link');
    const href = marker?.getAttribute('href');
    assert.ok(href, 'expected FaceTheory hydration link href');
    return href;
  } finally {
    dom.window.close();
  }
}

test(
  'vite strict CSP vue example: renders external assets and framework SSR hydration sidecars',
  { concurrency: false },
  async () => {
    const cwd = path.resolve('.');

    const distDir = path.resolve('examples/vite-strict-csp-vue/dist');
    await rm(distDir, { recursive: true, force: true });

    await execFileAsync('npm', ['run', 'example:vite:vue:strict-csp:build'], {
      cwd,
    });

    const manifestPath = path.resolve(
      'examples/vite-strict-csp-vue/dist/client/.vite/manifest.json',
    );
    const manifest = JSON.parse(
      await readFile(manifestPath, 'utf8'),
    ) as ViteManifest;
    const entry = manifest['src/entry-client.ts'];
    assert.ok(entry);
    assert.ok(entry.css?.length, 'strict example must emit external CSS');
    assert.ok(entry.assets?.length, 'strict example must emit external assets');

    const serverEntryPath = path.resolve(
      'examples/vite-strict-csp-vue/dist/server/entry-server.js',
    );
    assert.ok(await exists(serverEntryPath));

    const serverMod = await import(pathToFileURL(serverEntryPath).href);
    const app = serverMod.createViteStrictCspVueExampleApp(manifest);

    const resp = await app.handle({ method: 'GET', path: '/' });
    assert.equal(resp.status, 200);
    assert.equal(resp.headers['content-security-policy']?.length, 1);

    const body = decodeBody(resp.body as Uint8Array);
    assert.ok(body.includes('FaceTheory Strict CSP Vue'));
    assert.ok(body.includes('Vue + Vite without inline output'));
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
      serverMod.strictCspVueDataForPath('/'),
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
        'examples/vite-strict-csp-vue/dist/client',
        `.${injectedPath}`,
      );
      assert.ok(await exists(builtPath), `missing built asset: ${injectedPath}`);
    }
  },
);
