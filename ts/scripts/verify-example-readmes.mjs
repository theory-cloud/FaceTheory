import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const tsRoot = fileURLToPath(new URL('..', import.meta.url));
const examplesDir = path.join(tsRoot, 'examples');

const requiredSections = ['Demonstrates', 'Run', 'Backs'];

function hasSection(markdown, section) {
  const pattern = new RegExp(`^##\\s+${section}\\s*$`, 'm');
  return pattern.test(markdown);
}

function sectionBody(markdown, section) {
  const heading = new RegExp(`^##\\s+${section}\\s*$`, 'm');
  const match = heading.exec(markdown);
  if (!match) return '';
  const start = match.index + match[0].length;
  const rest = markdown.slice(start);
  const next = /^##\s+/m.exec(rest);
  return (next ? rest.slice(0, next.index) : rest).trim();
}

const entries = await readdir(examplesDir, { withFileTypes: true });
const exampleDirs = entries
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const failures = [];

for (const exampleName of exampleDirs) {
  const readmePath = path.join(examplesDir, exampleName, 'README.md');
  let markdown;
  try {
    markdown = await readFile(readmePath, 'utf8');
  } catch {
    failures.push(`${exampleName}: missing README.md`);
    continue;
  }

  if (!/^#\s+\S/m.test(markdown)) {
    failures.push(`${exampleName}: missing top-level title`);
  }

  for (const section of requiredSections) {
    if (!hasSection(markdown, section)) {
      failures.push(`${exampleName}: missing ## ${section}`);
      continue;
    }

    if (sectionBody(markdown, section).length === 0) {
      failures.push(`${exampleName}: ## ${section} is empty`);
    }
  }
}

if (failures.length > 0) {
  console.error('Example README completeness check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Verified ${exampleDirs.length} example READMEs under ts/examples.`);
