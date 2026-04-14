import { copyFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const sourceRoot = path.resolve(root, 'src/svelte');
const distRoot = path.resolve(root, 'dist/svelte');

async function copyRecursive(sourceDir, destDir) {
  await mkdir(destDir, { recursive: true });
  const entries = await readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      await copyRecursive(sourcePath, destPath);
      continue;
    }

    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.svelte') && !entry.name.endsWith('.d.ts'))
      continue;

    await mkdir(path.dirname(destPath), { recursive: true });
    await copyFile(sourcePath, destPath);
  }
}

await copyRecursive(sourceRoot, distRoot);
