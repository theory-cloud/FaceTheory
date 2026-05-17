import assert from 'node:assert/strict';
import test from 'node:test';

import { execFile } from 'node:child_process';
import { readFile, rm, stat } from 'node:fs/promises';
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

function assertNoInlineCspOutput(html: string): void {
  assert.ok(!html.includes('id="__FACETHEORY_DATA__"'));
  assert.ok(!/<script\b(?![^>]*\bsrc=)[^>]*>/i.test(html));
  assert.ok(!/<script\b[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/i.test(html));
  assert.ok(!/<style\b/i.test(html));
  assert.ok(!/\sstyle="/i.test(html));
  assert.ok(!/\son[a-z]+=/i.test(html));
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
    assertNoInlineCspOutput(body);

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
