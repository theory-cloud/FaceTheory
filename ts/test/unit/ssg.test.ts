import assert from 'node:assert/strict';
import test from 'node:test';

import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { buildSsgSite } from '../../src/ssg.js';
import type { FaceModule } from '../../src/types.js';

async function listFilesRecursively(rootDir: string): Promise<string[]> {
  const out: string[] = [];

  async function walk(currentDir: string): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const absolutePath = path.resolve(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }
      out.push(path.relative(rootDir, absolutePath).replaceAll('\\', '/'));
    }
  }

  await walk(rootDir);
  return out;
}

async function readSnapshot(rootDir: string): Promise<Record<string, string>> {
  const files = await listFilesRecursively(rootDir);
  const snapshot: Record<string, string> = {};
  for (const file of files) {
    const content = await readFile(path.resolve(rootDir, file), 'utf8');
    snapshot[file] = content;
  }
  return snapshot;
}

test('ssg: static + param routes produce deterministic files and manifest', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'facetheory-ssg-'));
  const outA = path.resolve(tempRoot, 'out-a');
  const outB = path.resolve(tempRoot, 'out-b');

  const faces: FaceModule[] = [
    {
      route: '/',
      mode: 'ssg',
      render: () => ({
        head: { title: 'Home' },
        html: '<main>home</main>',
      }),
    },
    {
      route: '/about',
      mode: 'ssg',
      render: () => ({
        html: '<main>about</main>',
      }),
    },
    {
      route: '/blog/{slug}',
      mode: 'ssg',
      generateStaticParams: async () => [{ slug: 'second-post' }, { slug: 'first-post' }],
      load: async (ctx) => ({ slug: ctx.params.slug }),
      render: (_ctx, data) => ({
        html: `<main>${(data as { slug: string }).slug}</main>`,
        hydration: {
          data: data as { slug: string },
          bootstrapModule: '/assets/client-entry.js',
        },
      }),
    },
    {
      route: '/404',
      mode: 'ssg',
      render: () => ({
        status: 404,
        html: '<main>custom 404</main>',
      }),
    },
    {
      route: '/runtime-only',
      mode: 'ssr',
      render: () => ({
        html: '<main>runtime only</main>',
      }),
    },
  ];

  try {
    const resultA = await buildSsgSite({
      faces,
      outDir: outA,
      emitHydrationData: true,
      trailingSlash: 'always',
    });
    await buildSsgSite({
      faces,
      outDir: outB,
      emitHydrationData: true,
      trailingSlash: 'always',
    });

    assert.deepEqual(
      resultA.pages.map((page) => `${page.path} -> ${page.file}`),
      [
        '/ -> index.html',
        '/404 -> 404/index.html',
        '/about -> about/index.html',
        '/blog/first-post -> blog/first-post/index.html',
        '/blog/second-post -> blog/second-post/index.html',
      ],
    );
    assert.equal(resultA.manifestFile, '.facetheory/ssg-manifest.json');
    assert.equal(resultA.notFoundFile, '404.html');

    const manifestRaw = await readFile(path.resolve(outA, resultA.manifestFile), 'utf8');
    const manifest = JSON.parse(manifestRaw) as {
      trailingSlash: string;
      notFoundFile?: string;
      pages: Array<{ path: string; file: string }>;
      assetManifest: { format: string; path: string };
    };
    assert.equal(manifest.trailingSlash, 'always');
    assert.equal(manifest.notFoundFile, '404.html');
    assert.deepEqual(manifest.assetManifest, {
      format: 'vite',
      path: '.vite/manifest.json',
    });
    assert.deepEqual(
      manifest.pages.map((page) => `${page.path} -> ${page.file}`),
      resultA.pages.map((page) => `${page.path} -> ${page.file}`),
    );

    const fallback404 = await readFile(path.resolve(outA, '404.html'), 'utf8');
    const route404 = await readFile(path.resolve(outA, '404/index.html'), 'utf8');
    assert.equal(fallback404, route404);

    const snapshotA = await readSnapshot(outA);
    const snapshotB = await readSnapshot(outB);
    assert.deepEqual(snapshotA, snapshotB);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('ssg: denies network fetch by default', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'facetheory-ssg-network-'));
  const outDir = path.resolve(tempRoot, 'out');

  const faces: FaceModule[] = [
    {
      route: '/',
      mode: 'ssg',
      load: async () => {
        await fetch('https://example.com/data.json');
        return null;
      },
      render: () => ({ html: '<main>should-not-render</main>' }),
    },
  ];

  try {
    await assert.rejects(
      buildSsgSite({ faces, outDir }),
      /network access is disabled/i,
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('ssg: allows explicit fetch mock', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'facetheory-ssg-mock-'));
  const outDir = path.resolve(tempRoot, 'out');

  const faces: FaceModule[] = [
    {
      route: '/',
      mode: 'ssg',
      load: async () => {
        const response = await fetch('https://example.com/data.json');
        return response.json();
      },
      render: (_ctx, data) => ({ html: `<main>${(data as { message: string }).message}</main>` }),
    },
  ];

  const calls: string[] = [];
  const mockedFetch: typeof fetch = async (input) => {
    const target =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    calls.push(target);
    return new Response(JSON.stringify({ message: 'from-mock' }), {
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    await buildSsgSite({ faces, outDir, fetch: mockedFetch });
    const indexHtml = await readFile(path.resolve(outDir, 'index.html'), 'utf8');
    assert.ok(indexHtml.includes('from-mock'));
    assert.deepEqual(calls, ['https://example.com/data.json']);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
