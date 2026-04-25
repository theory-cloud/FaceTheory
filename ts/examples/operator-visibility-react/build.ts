import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { faceApp } from './handler.js';
import type { FaceBody } from '../../src/types.js';

async function collectBody(body: FaceBody): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body;

  const chunks: Uint8Array[] = [];
  for await (const chunk of body) chunks.push(chunk);
  const total = chunks.reduce((size, chunk) => size + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export async function buildOperatorVisibilityExample(): Promise<string> {
  const response = await faceApp.handle({ method: 'GET', path: '/' });
  if (response.status !== 200) {
    throw new Error(`operator visibility example returned ${response.status}`);
  }

  const outDir = path.resolve('examples/operator-visibility-react/dist');
  const outPath = path.join(outDir, 'index.html');
  await mkdir(outDir, { recursive: true });
  await writeFile(
    outPath,
    new TextDecoder().decode(await collectBody(response.body)),
    'utf8',
  );
  return outPath;
}

const outPath = await buildOperatorVisibilityExample();
console.log(`operator visibility example built: ${outPath}`);
