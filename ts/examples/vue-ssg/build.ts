import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { buildSsgSite, type ViteManifest } from '@theory-cloud/facetheory';

import { createVueSsgFaces } from './src/entry-server.js';

const manifestPath = path.resolve(
  'examples/vue-ssg/dist/client/.vite/manifest.json',
);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as ViteManifest;

const outDir = path.resolve('examples/vue-ssg/dist-static');

const result = await buildSsgSite({
  faces: createVueSsgFaces(manifest),
  outDir,
  trailingSlash: 'always',
  emitHydrationData: false,
});

console.log(`Vue SSG build wrote ${result.pages.length} page(s) to ${result.outDir}`);
