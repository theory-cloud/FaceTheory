import assert from 'node:assert/strict';
import test from 'node:test';

import {
  externalHydrationForEntry,
  viteAssetsForEntry,
  viteDynamicImportPolicy,
  viteHydrationForEntry,
} from '../../src/vite.js';

function linkTags(headTags: Array<{ type: string; attrs: Record<string, unknown> }>) {
  return headTags.filter(
    (tag): tag is { type: 'link'; attrs: Record<string, unknown> } => tag.type === 'link',
  );
}

function hrefsByRel(headTags: Array<{ type: string; attrs: Record<string, unknown> }>, rel: string) {
  return linkTags(headTags)
    .filter((tag) => tag.attrs.rel === rel)
    .map((tag) => String(tag.attrs.href));
}

test('vite: resolves bootstrap module + injects preload + css links', () => {
  const manifest = {
    'src/entry-client.tsx': {
      file: 'assets/entry.aaa.js',
      css: ['assets/entry.aaa.css'],
      imports: ['_vendor.bbb.js'],
      isEntry: true,
    },
    '_vendor.bbb.js': {
      file: 'assets/vendor.bbb.js',
      css: ['assets/vendor.bbb.css'],
      imports: ['_shared.ccc.js'],
    },
    '_shared.ccc.js': {
      file: 'assets/shared.ccc.js',
    },
  } as const;

  const assets = viteAssetsForEntry(manifest, 'src/entry-client.tsx');
  assert.equal(assets.bootstrapModule, '/assets/entry.aaa.js');

  const tags = assets.headTags as Array<{ type: string; attrs: Record<string, unknown> }>;
  const preloadHrefs = hrefsByRel(tags, 'modulepreload');
  assert.deepEqual(preloadHrefs, ['/assets/shared.ccc.js', '/assets/vendor.bbb.js']);

  const cssHrefs = hrefsByRel(tags, 'stylesheet');
  assert.deepEqual(cssHrefs, ['/assets/vendor.bbb.css', '/assets/entry.aaa.css']);
});

test('vite: includeAssets emits deterministic asset hints and ignores dynamic imports', () => {
  const manifest = {
    'src/entry-client.tsx': {
      file: 'assets/entry.aaa.js',
      css: ['assets/entry.aaa.css'],
      assets: ['assets/logo.ddd.svg', 'assets/font.zzz.woff2'],
      imports: ['_vendor.bbb.js'],
      dynamicImports: ['_lazy.eee.js'],
      isEntry: true,
    },
    '_vendor.bbb.js': {
      file: 'assets/vendor.bbb.js',
      css: ['assets/vendor.bbb.css'],
      assets: ['assets/logo.ddd.svg', 'assets/vendor.bbb.js'],
      imports: ['_shared.ccc.js'],
    },
    '_shared.ccc.js': {
      file: 'assets/shared.ccc.js',
      assets: ['assets/font.zzz.woff2'],
    },
    '_lazy.eee.js': {
      file: 'assets/lazy.eee.js',
      assets: ['assets/lazy.eee.svg'],
    },
  } as const;

  const assets = viteAssetsForEntry(manifest, 'src/entry-client.tsx', {
    includeAssets: true,
  });

  const tags = assets.headTags as Array<{ type: string; attrs: Record<string, unknown> }>;
  const orderedHrefs = linkTags(tags).map((tag) => String(tag.attrs.href));
  assert.deepEqual(orderedHrefs, [
    '/assets/shared.ccc.js',
    '/assets/vendor.bbb.js',
    '/assets/vendor.bbb.css',
    '/assets/entry.aaa.css',
    '/assets/font.zzz.woff2',
    '/assets/logo.ddd.svg',
  ]);

  const fontTag = linkTags(tags).find((tag) => tag.attrs.href === '/assets/font.zzz.woff2');
  assert.equal(fontTag?.attrs.rel, 'preload');
  assert.equal(fontTag?.attrs.as, 'font');
  assert.equal(fontTag?.attrs.type, 'font/woff2');
  assert.equal(fontTag?.attrs.crossorigin, true);

  const imageTag = linkTags(tags).find((tag) => tag.attrs.href === '/assets/logo.ddd.svg');
  assert.equal(imageTag?.attrs.rel, 'preload');
  assert.equal(imageTag?.attrs.as, 'image');

  assert.ok(!orderedHrefs.includes('/assets/lazy.eee.svg'));
});

test('vite: base works for root, subpath, and absolute CDN base', () => {
  const manifest = {
    'src/entry-client.tsx': {
      file: 'assets/entry.aaa.js',
      css: ['assets/entry.aaa.css'],
      assets: ['assets/logo.ddd.svg'],
      imports: ['_vendor.bbb.js'],
      isEntry: true,
    },
    '_vendor.bbb.js': {
      file: 'assets/vendor.bbb.js',
    },
  } as const;

  const cases = [
    {
      base: '/',
      expectedPrefix: '/',
    },
    {
      base: '/portal/',
      expectedPrefix: '/portal/',
    },
    {
      base: 'https://cdn.example.com/portal/',
      expectedPrefix: 'https://cdn.example.com/portal/',
    },
  ] as const;

  for (const testCase of cases) {
    const assets = viteAssetsForEntry(manifest, 'src/entry-client.tsx', {
      base: testCase.base,
      includeAssets: true,
    });

    assert.equal(assets.bootstrapModule, `${testCase.expectedPrefix}assets/entry.aaa.js`);
    const hrefs = linkTags(
      assets.headTags as Array<{ type: string; attrs: Record<string, unknown> }>,
    ).map((tag) => String(tag.attrs.href));
    assert.deepEqual(hrefs, [
      `${testCase.expectedPrefix}assets/vendor.bbb.js`,
      `${testCase.expectedPrefix}assets/entry.aaa.css`,
      `${testCase.expectedPrefix}assets/logo.ddd.svg`,
    ]);
  }
});

test('vite: hydration helper sets bootstrap module', () => {
  const manifest = {
    'src/entry-client.tsx': { file: 'assets/entry.aaa.js' },
  };

  const hydration = viteHydrationForEntry(manifest, 'src/entry-client.tsx', { ok: true });
  assert.equal(hydration.bootstrapModule, '/assets/entry.aaa.js');
  assert.deepEqual(hydration.data, { ok: true });
});

test('vite: external hydration helper preserves dataUrl and bootstrap metadata', () => {
  const manifest = {
    'src/entry-client.tsx': { file: 'assets/entry.aaa.js' },
  };

  const hydration = externalHydrationForEntry(
    manifest,
    'src/entry-client.tsx',
    { ok: true },
    {
      base: '/portal/',
      dataUrl: '/portal/_facetheory/hydration/page.json',
    },
  );

  assert.deepEqual(hydration, {
    type: 'external',
    data: { ok: true },
    dataUrl: '/portal/_facetheory/hydration/page.json',
    bootstrapModule: '/portal/assets/entry.aaa.js',
  });
});

test('vite: external hydration helper accepts same-origin absolute dataUrl', () => {
  const manifest = {
    'src/entry-client.tsx': { file: 'assets/entry.aaa.js' },
  };

  const hydration = externalHydrationForEntry(
    manifest,
    'src/entry-client.tsx',
    { ok: true },
    {
      base: 'https://app.example/assets-base/',
      allowedOrigin: 'https://app.example',
      dataUrl: 'https://app.example/_facetheory/hydration/page.json',
    },
  );

  assert.equal(
    hydration.bootstrapModule,
    'https://app.example/assets-base/assets/entry.aaa.js',
  );
  assert.equal(
    hydration.dataUrl,
    'https://app.example/_facetheory/hydration/page.json',
  );
});

test('vite: external hydration helper accepts same-origin relative dataUrl with allowed origin', () => {
  const manifest = {
    'src/entry-client.tsx': { file: 'assets/entry.aaa.js' },
  };

  const hydration = externalHydrationForEntry(
    manifest,
    'src/entry-client.tsx',
    { ok: true },
    {
      allowedOrigin: 'https://app.example',
      dataUrl: '/_facetheory/hydration\\page.json',
    },
  );

  assert.equal(hydration.dataUrl, '/_facetheory/hydration\\page.json');
});

test('vite: external hydration helper rejects unsafe and cross-origin dataUrl', () => {
  const manifest = {
    'src/entry-client.tsx': { file: 'assets/entry.aaa.js' },
  };

  assert.throws(
    () =>
      externalHydrationForEntry(manifest, 'src/entry-client.tsx', {}, {
        dataUrl: 'javascript:alert(1)',
      }),
    /dataUrl must be http\(s\) or same-origin/,
  );

  assert.throws(
    () =>
      externalHydrationForEntry(manifest, 'src/entry-client.tsx', {}, {
        allowedOrigin: 'https://app.example',
        dataUrl: 'https://evil.example/page.json',
      }),
    /dataUrl resolved cross-origin/,
  );

  assert.throws(
    () =>
      externalHydrationForEntry(manifest, 'src/entry-client.tsx', {}, {
        dataUrl: 'https://app.example/page.json',
      }),
    /dataUrl must be same-origin or relative/,
  );
});

test('vite: external hydration helper rejects backslash-prefixed network-path dataUrl', () => {
  const manifest = {
    'src/entry-client.tsx': { file: 'assets/entry.aaa.js' },
  };

  for (const dataUrl of [
    '/\\evil.example/page.json',
    '/\\\\evil.example/page.json',
    '\\\\evil.example/page.json',
    '\\\\\\\\evil.example/page.json',
    'https:\\\\evil.example/page.json',
  ]) {
    assert.throws(
      () =>
        externalHydrationForEntry(manifest, 'src/entry-client.tsx', {}, {
          allowedOrigin: 'https://app.example',
          dataUrl,
        }),
      /dataUrl resolved cross-origin: expected https:\/\/app\.example, received https:\/\/evil\.example/,
    );
  }
});

test('vite: external hydration helper rejects backslash-prefixed network-path dataUrl without allowed origin', () => {
  const manifest = {
    'src/entry-client.tsx': { file: 'assets/entry.aaa.js' },
  };

  for (const dataUrl of [
    '/\\evil.example/page.json',
    '/\\\\evil.example/page.json',
    '\\\\evil.example/page.json',
    '\\\\\\\\evil.example/page.json',
  ]) {
    assert.throws(
      () =>
        externalHydrationForEntry(manifest, 'src/entry-client.tsx', {}, {
          dataUrl,
        }),
      /dataUrl must be same-origin or relative/,
    );
  }
});

test('vite: dynamic import policy is ignore', () => {
  assert.equal(viteDynamicImportPolicy(), 'ignore');
});
