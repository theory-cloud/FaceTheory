import assert from 'node:assert/strict';
import test from 'node:test';

import { escapeHTML, renderHTMLDocument, safeJson } from '../../src/html.js';

test('escapeHTML escapes basic characters', () => {
  assert.equal(escapeHTML(`a&b<c>d"e'f`), 'a&amp;b&lt;c&gt;d&quot;e&#39;f');
});

test('safeJson escapes HTML-significant characters', () => {
  const s = safeJson({ a: '<script>&</script>' });
  assert.ok(!s.includes('<script>'));
  assert.ok(s.includes('\\u003c'));
});

test('renderHTMLDocument emits doctype', () => {
  const html = renderHTMLDocument({ body: 'ok' });
  assert.ok(html.startsWith('<!doctype html>'));
});

