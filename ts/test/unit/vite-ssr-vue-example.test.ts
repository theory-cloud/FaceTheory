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

test('vite SSR vue example: builds client+server and renders without missing assets', { concurrency: false }, async () => {
  const cwd = path.resolve('.');

  const distDir = path.resolve('examples/vite-ssr-vue/dist');
  await rm(distDir, { recursive: true, force: true });

  await execFileAsync('npm', ['run', 'example:vite:vue:build'], { cwd });

  const manifestPath = path.resolve('examples/vite-ssr-vue/dist/client/.vite/manifest.json');
  const manifestRaw = await readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestRaw) as ViteManifest;
  assert.ok(manifest['src/entry-client.ts']);

  const serverEntryPath = path.resolve('examples/vite-ssr-vue/dist/server/entry-server.js');
  assert.ok(await exists(serverEntryPath));

  const serverMod = await import(pathToFileURL(serverEntryPath).href);
  const app = serverMod.createViteVueSSRExampleApp(manifest);

  const resp = await app.handle({ method: 'GET', path: '/' });
  const body = new TextDecoder().decode(resp.body as Uint8Array);

  assert.ok(body.includes('Vue SSR Example'));
  assert.ok(body.includes('Hello from server'));
  assert.ok(body.includes('id="root"'));
  assert.ok(body.includes('id="__FACETHEORY_DATA__"'));
  assert.ok(body.includes('type="module"'));
  assert.ok(body.includes('id="vue-inline-style"'));

  const injectedPaths = new Set<string>();
  for (const match of body.matchAll(/<(?:link|script)\b[^>]*(?:href|src)="([^"]+)"/g)) {
    const candidate = match[1];
    if (!candidate || !candidate.startsWith('/')) continue;
    injectedPaths.add(candidate);
  }
  assert.ok(injectedPaths.size > 0);

  for (const injectedPath of injectedPaths) {
    const builtPath = path.resolve('examples/vite-ssr-vue/dist/client', `.${injectedPath}`);
    assert.ok(await exists(builtPath), `missing built asset: ${injectedPath}`);
  }
});
