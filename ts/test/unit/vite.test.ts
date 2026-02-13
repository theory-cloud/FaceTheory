import assert from 'node:assert/strict';
import test from 'node:test';

import { viteAssetsForEntry, viteHydrationForEntry } from '../../src/vite.js';

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

  const tags = assets.headTags;
  const preloadHrefs = tags
    .filter((t) => t.type === 'link' && t.attrs.rel === 'modulepreload')
    .map((t) => (t.type === 'link' ? String(t.attrs.href) : ''));
  assert.deepEqual(preloadHrefs, ['/assets/shared.ccc.js', '/assets/vendor.bbb.js']);

  const cssHrefs = tags
    .filter((t) => t.type === 'link' && t.attrs.rel === 'stylesheet')
    .map((t) => (t.type === 'link' ? String(t.attrs.href) : ''));
  assert.deepEqual(cssHrefs, ['/assets/vendor.bbb.css', '/assets/entry.aaa.css']);
});

test('vite: hydration helper sets bootstrap module', () => {
  const manifest = {
    'src/entry-client.tsx': { file: 'assets/entry.aaa.js' },
  };

  const hydration = viteHydrationForEntry(manifest, 'src/entry-client.tsx', { ok: true });
  assert.equal(hydration.bootstrapModule, '/assets/entry.aaa.js');
  assert.deepEqual(hydration.data, { ok: true });
});

