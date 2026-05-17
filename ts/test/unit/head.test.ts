import assert from 'node:assert/strict';
import test from 'node:test';

import { renderFaceHead } from '../../src/head.js';
import type { FaceCspPolicy, FaceHydration, FaceRenderResult } from '../../src/types.js';

test('head contracts: strict CSP policy and hydration shapes are additive', () => {
  const strictPolicy = {
    inlineScripts: false,
    inlineStyles: false,
    rawHead: false,
  } satisfies FaceCspPolicy;

  const legacyHydration = {
    data: { page: 'legacy' },
    bootstrapModule: '/assets/legacy.js',
  } satisfies FaceHydration;

  const explicitInlineHydration = {
    type: 'inline',
    data: { page: 'inline' },
    bootstrapModule: '/assets/inline.js',
  } satisfies FaceHydration;

  const externalHydration = {
    type: 'external',
    data: { page: 'external' },
    dataUrl: '/_facetheory/hydration/external.json',
    bootstrapModule: '/assets/external.js',
  } satisfies FaceHydration;

  const renderResult = {
    html: '<main>ok</main>',
    csp: strictPolicy,
    hydration: externalHydration,
  } satisfies FaceRenderResult;

  assert.equal(legacyHydration.bootstrapModule, '/assets/legacy.js');
  assert.equal(explicitInlineHydration.type, 'inline');
  assert.equal(renderResult.csp.inlineScripts, false);
});

test('head: charset meta then title, with dedupe (last wins)', () => {
  const head = renderFaceHead({
    html: '<div>ok</div>',
    headTags: [
      { type: 'meta', attrs: { name: 'description', content: 'a' } },
      { type: 'title', text: 'First' },
      { type: 'meta', attrs: { charset: 'utf-8' } },
      { type: 'meta', attrs: { charset: 'utf-8' } },
      { type: 'title', text: 'Second' },
      { type: 'meta', attrs: { name: 'description', content: 'b' } },
    ],
  });

  assert.ok(
    head.startsWith(
      '<meta charset="utf-8"><title>Second</title><meta content="b" name="description">',
    ),
  );
});

test('head: applies CSP nonce to inline styles and hydration scripts', () => {
  const head = renderFaceHead(
    {
      html: '<div>ok</div>',
      styleTags: [{ cssText: 'body{color:red}' }],
      hydration: {
        data: { a: '<script>&</script>' },
        bootstrapModule: '/assets/entry.js',
      },
    },
    { cspNonce: 'nonce123' },
  );

  assert.ok(head.includes('<style nonce="nonce123">body{color:red}</style>'));

  assert.ok(
    head.includes(
      '<script id="__FACETHEORY_DATA__" nonce="nonce123" type="application/json">',
    ),
  );
  assert.ok(head.includes('\\u003c'));

  assert.ok(
    head.includes(
      '<script nonce="nonce123" src="/assets/entry.js" type="module"></script>',
    ),
  );
});

test('head: escapes legacy head fields and blocks unsafe hydration module URLs', () => {
  const head = renderFaceHead({
    html: '<div>ok</div>',
    head: {
      title: '</title><script>alert("title")</script>',
      html: '<meta name="unsafe" content="</head><script>alert(1)</script>">',
    },
    hydration: {
      data: { safe: true },
      bootstrapModule: 'javascript:alert(1)',
    },
  });

  assert.ok(
    head.includes(
      '<title>&lt;/title&gt;&lt;script&gt;alert(&quot;title&quot;)&lt;/script&gt;</title>',
    ),
  );
  assert.ok(
    head.includes(
      '&lt;meta name=&quot;unsafe&quot; content=&quot;&lt;/head&gt;&lt;script&gt;alert(1)&lt;/script&gt;&quot;&gt;',
    ),
  );
  assert.equal(head.includes('<script>alert("title")</script>'), false);
  assert.equal(head.includes('<script>alert(1)</script>'), false);
  assert.equal(head.includes('javascript:alert(1)'), false);
});
