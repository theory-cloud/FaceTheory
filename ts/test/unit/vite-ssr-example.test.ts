import assert from 'node:assert/strict';
import test from 'node:test';

import { execFile } from 'node:child_process';
import { rm, readFile, stat } from 'node:fs/promises';
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

test('vite SSR example: builds client+server and renders without missing assets', async () => {
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
  assert.ok(body.includes('rel="modulepreload"'));
  assert.ok(body.includes('rel="stylesheet"'));

  const bootstrapModuleMatch = body.match(/<script[^>]*src="([^"]+)"[^>]*type="module"/);
  const bootstrapModule = bootstrapModuleMatch?.[1];
  assert.ok(bootstrapModule);
  assert.ok(bootstrapModule.startsWith('/'));

  const bootstrapFilePath = path.resolve(
    'examples/vite-ssr-react/dist/client',
    `.${bootstrapModule}`,
  );
  assert.ok(await exists(bootstrapFilePath));
});
