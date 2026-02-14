import assert from 'node:assert/strict';
import test from 'node:test';

import { renderFaceHead } from '../../src/head.js';

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

