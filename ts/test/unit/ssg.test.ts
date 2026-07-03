import assert from 'node:assert/strict';
import test from 'node:test';

import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { buildSsgSite, SsgBuildFailedError } from '../../src/ssg.js';
import { runSsgCli } from '../../src/ssg-cli.js';
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

async function delay(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function trackedSsgFaces(track: {
  active: number;
  maxActive: number;
}): FaceModule[] {
  return ['/alpha', '/beta', '/gamma'].map((route) => ({
    route,
    mode: 'ssg',
    render: async (ctx) => {
      track.active += 1;
      track.maxActive = Math.max(track.maxActive, track.active);
      try {
        await delay(10);
        return {
          html: `<main>${ctx.request.path}</main>`,
        };
      } finally {
        track.active -= 1;
      }
    },
  }));
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

test('ssg: concurrency defaults to serial and can be raised', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'facetheory-ssg-concurrency-'));
  const serialOut = path.resolve(tempRoot, 'serial');
  const parallelOut = path.resolve(tempRoot, 'parallel');
  const serialTrack = { active: 0, maxActive: 0 };
  const parallelTrack = { active: 0, maxActive: 0 };

  try {
    await buildSsgSite({
      faces: trackedSsgFaces(serialTrack),
      outDir: serialOut,
      write404Fallback: false,
    });
    await buildSsgSite({
      faces: trackedSsgFaces(parallelTrack),
      outDir: parallelOut,
      concurrency: 2,
      write404Fallback: false,
    });

    assert.equal(serialTrack.maxActive, 1);
    assert.equal(parallelTrack.maxActive, 2);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('ssg: route failures are reported after successful pages write', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'facetheory-ssg-failures-'));
  const outDir = path.resolve(tempRoot, 'out');

  const faces: FaceModule[] = [
    {
      route: '/alpha',
      mode: 'ssg',
      render: () => ({ html: '<main>alpha</main>' }),
    },
    {
      route: '/beta',
      mode: 'ssg',
      render: () => ({ html: '<main>beta</main>' }),
    },
    {
      route: '/fail',
      mode: 'ssg',
      render: () => ({ status: 500, html: '<main>failed</main>' }),
    },
  ];

  try {
    let caught: unknown;
    try {
      await buildSsgSite({ faces, outDir, concurrency: 2 });
    } catch (error) {
      caught = error;
    }

    assert.ok(caught instanceof SsgBuildFailedError);
    assert.deepEqual(
      caught.failedRoutes.map((route) => ({
        path: route.path,
        routePattern: route.routePattern,
        status: route.status,
      })),
      [{ path: '/fail', routePattern: '/fail', status: 500 }],
    );
    assert.deepEqual(
      caught.result.pages.map((page) => page.path),
      ['/alpha', '/beta'],
    );

    const alphaHtml = await readFile(path.resolve(outDir, 'alpha/index.html'), 'utf8');
    const betaHtml = await readFile(path.resolve(outDir, 'beta/index.html'), 'utf8');
    assert.ok(alphaHtml.includes('<main>alpha</main>'));
    assert.ok(betaHtml.includes('<main>beta</main>'));
    await assert.rejects(
      readFile(path.resolve(outDir, 'fail/index.html'), 'utf8'),
      /ENOENT/,
    );

    const manifestRaw = await readFile(
      path.resolve(outDir, '.facetheory/ssg-manifest.json'),
      'utf8',
    );
    const manifest = JSON.parse(manifestRaw) as {
      pages: Array<{ path: string }>;
    };
    assert.deepEqual(
      manifest.pages.map((page) => page.path),
      ['/alpha', '/beta'],
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('ssg cli: --concurrency reports isolated route failures as non-zero', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'facetheory-ssg-cli-'));
  const entryPath = path.resolve(tempRoot, 'ssg-config.mjs');
  const outDir = path.resolve(tempRoot, 'out');
  const errors: string[] = [];
  const originalError = console.error;

  await writeFile(
    entryPath,
    [
      'export const faces = [',
      '  { route: "/ok", mode: "ssg", render: () => ({ html: "<main>ok</main>" }) },',
      '  { route: "/bad", mode: "ssg", render: () => ({ status: 500, html: "<main>bad</main>" }) },',
      '];',
      '',
    ].join('\n'),
  );

  try {
    console.error = (...args: unknown[]) => {
      errors.push(args.map(String).join(' '));
    };

    const exitCode = await runSsgCli([
      '--entry',
      entryPath,
      '--out',
      outDir,
      '--concurrency',
      '2',
    ]);

    assert.equal(exitCode, 1);
    assert.ok(errors.join('\n').includes('SSG failed: 1 route(s) failed'));
    const okHtml = await readFile(path.resolve(outDir, 'ok/index.html'), 'utf8');
    assert.ok(okHtml.includes('<main>ok</main>'));
  } finally {
    console.error = originalError;
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

test('ssg: rejects dot-segment params that would escape the output root', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'facetheory-ssg-traversal-'));
  const outDir = path.resolve(tempRoot, 'out');
  const escapedCandidate = path.resolve(tempRoot, 'escape', 'index.html');

  const faces: FaceModule[] = [
    {
      route: '/docs/{path+}',
      mode: 'ssg',
      generateStaticParams: async () => [{ path: '../../escape' }],
      render: () => ({ html: '<main>bad</main>' }),
    },
  ];

  try {
    await assert.rejects(
      buildSsgSite({ faces, outDir }),
      /prohibited dot-segment|escapes outDir/i,
    );
    await assert.rejects(readFile(escapedCandidate, 'utf8'), /ENOENT/);
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

test('ssg: strict CSP hydration emits canonical sidecar without inline data', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'facetheory-ssg-strict-'));
  const outDir = path.resolve(tempRoot, 'out');

  const faces: FaceModule[] = [
    {
      route: '/',
      mode: 'ssg',
      render: () => ({
        csp: {
          inlineScripts: false,
          inlineStyles: false,
          rawHead: false,
        },
        head: { title: 'Strict Home' },
        html: '<main>strict</main>',
        hydration: {
          data: {
            message: '</script><script>alert("xss")</script>',
            count: 1,
          },
          bootstrapModule: '/assets/client-entry.js',
        },
      }),
    },
  ];

  try {
    const result = await buildSsgSite({ faces, outDir });

    assert.equal(result.pages.length, 1);
    assert.equal(
      result.pages[0]?.hydrationDataFile,
      '_facetheory/data/index.json',
    );

    const html = await readFile(path.resolve(outDir, 'index.html'), 'utf8');
    assert.ok(html.includes('id="__FACETHEORY_DATA_URL__"'));
    assert.ok(html.includes('href="/_facetheory/data/index.json"'));
    assert.ok(html.includes('src="/assets/client-entry.js"'));
    assert.equal(html.includes('id="__FACETHEORY_DATA__"'), false);
    assert.equal(html.includes('</script><script>alert'), false);

    const hydrationJson = await readFile(
      path.resolve(outDir, '_facetheory/data/index.json'),
      'utf8',
    );
    assert.equal(
      hydrationJson,
      '{"message":"\\u003c/script\\u003e\\u003cscript\\u003ealert(\\"xss\\")\\u003c/script\\u003e","count":1}\n',
    );

    const manifestRaw = await readFile(
      path.resolve(outDir, '.facetheory/ssg-manifest.json'),
      'utf8',
    );
    const manifest = JSON.parse(manifestRaw) as {
      pages: Array<{ path: string; hydrationDataFile?: string }>;
    };
    assert.deepEqual(
      manifest.pages.map((page) => `${page.path} -> ${page.hydrationDataFile}`),
      ['/ -> _facetheory/data/index.json'],
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('ssg: strict CSP preserves caller-managed external hydration sidecars', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'facetheory-ssg-external-'));
  const outDir = path.resolve(tempRoot, 'out');

  const faces: FaceModule[] = [
    {
      route: '/',
      mode: 'ssg',
      render: () => ({
        csp: {
          inlineScripts: false,
          inlineStyles: false,
          rawHead: false,
        },
        html: '<main>external</main>',
        hydration: {
          type: 'external',
          data: { message: 'caller-managed' },
          dataUrl: '/caller/hydration/home.json',
          bootstrapModule: '/assets/client-entry.js',
        },
      }),
    },
  ];

  try {
    const result = await buildSsgSite({ faces, outDir });

    assert.equal(result.pages.length, 1);
    assert.equal(result.pages[0]?.hydrationDataFile, undefined);

    const html = await readFile(path.resolve(outDir, 'index.html'), 'utf8');
    assert.ok(html.includes('id="__FACETHEORY_DATA_URL__"'));
    assert.ok(html.includes('href="/caller/hydration/home.json"'));
    assert.ok(html.includes('src="/assets/client-entry.js"'));
    assert.equal(html.includes('/_facetheory/data/index.json'), false);
    assert.equal(html.includes('id="__FACETHEORY_DATA__"'), false);

    const manifestRaw = await readFile(
      path.resolve(outDir, '.facetheory/ssg-manifest.json'),
      'utf8',
    );
    const manifest = JSON.parse(manifestRaw) as {
      pages: Array<{ path: string; hydrationDataFile?: string }>;
    };
    assert.equal(Object.hasOwn(manifest.pages[0] ?? {}, 'hydrationDataFile'), false);
    assert.deepEqual(
      manifest.pages.map((page) => `${page.path} -> ${page.hydrationDataFile}`),
      ['/ -> undefined'],
    );

    const files = await listFilesRecursively(outDir);
    assert.deepEqual(
      files.filter((file) => file.startsWith('_facetheory/data/')),
      [],
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('ssg: strict CSP external hydration with undefined data does not serialize a sidecar', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'facetheory-ssg-external-undefined-'));
  const outDir = path.resolve(tempRoot, 'out');

  const faces: FaceModule[] = [
    {
      route: '/',
      mode: 'ssg',
      render: () => ({
        csp: {
          inlineScripts: false,
          inlineStyles: false,
          rawHead: false,
        },
        html: '<main>external undefined</main>',
        hydration: {
          type: 'external',
          data: undefined,
          dataUrl: '/caller/hydration/undefined.json',
          bootstrapModule: '/assets/client-entry.js',
        },
      }),
    },
  ];

  try {
    const result = await buildSsgSite({ faces, outDir });

    assert.equal(result.pages.length, 1);
    assert.equal(result.pages[0]?.hydrationDataFile, undefined);

    const html = await readFile(path.resolve(outDir, 'index.html'), 'utf8');
    assert.ok(html.includes('href="/caller/hydration/undefined.json"'));
    assert.equal(html.includes('/_facetheory/data/index.json'), false);

    const files = await listFilesRecursively(outDir);
    assert.deepEqual(
      files.filter((file) => file.startsWith('_facetheory/data/')),
      [],
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('ssg: non-strict hydration sidecars remain opt-in compatibility output', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'facetheory-ssg-compat-'));
  const outDir = path.resolve(tempRoot, 'out');

  const faces: FaceModule[] = [
    {
      route: '/',
      mode: 'ssg',
      render: () => ({
        html: '<main>legacy</main>',
        hydration: {
          data: { message: 'legacy' },
          bootstrapModule: '/assets/client-entry.js',
        },
      }),
    },
  ];

  try {
    const withoutCompatibilitySidecar = await buildSsgSite({
      faces,
      outDir,
    });

    assert.equal(
      withoutCompatibilitySidecar.pages[0]?.hydrationDataFile,
      undefined,
    );
    let html = await readFile(path.resolve(outDir, 'index.html'), 'utf8');
    assert.ok(html.includes('id="__FACETHEORY_DATA__"'));

    const withCompatibilitySidecar = await buildSsgSite({
      faces,
      outDir,
      emitHydrationData: true,
    });

    assert.equal(
      withCompatibilitySidecar.pages[0]?.hydrationDataFile,
      '_facetheory/data/index.json',
    );
    html = await readFile(path.resolve(outDir, 'index.html'), 'utf8');
    assert.ok(html.includes('id="__FACETHEORY_DATA__"'));
    assert.ok(html.includes('{"message":"legacy"}'));

    const hydrationJson = await readFile(
      path.resolve(outDir, '_facetheory/data/index.json'),
      'utf8',
    );
    assert.equal(hydrationJson, '{"message":"legacy"}\n');
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
