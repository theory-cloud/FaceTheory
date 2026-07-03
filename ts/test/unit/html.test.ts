import assert from 'node:assert/strict';
import test from 'node:test';

import {
  escapeHTML,
  renderAttributes,
  renderHTMLDocument,
  safeJson,
} from '../../src/html.js';
import {
  buildStrictCspHeader,
  validateStrictCspDocument,
} from '../../src/security.js';

test('escapeHTML escapes basic characters', () => {
  assert.equal(escapeHTML(`a&b<c>d"e'f`), 'a&amp;b&lt;c&gt;d&quot;e&#39;f');
});

test('safeJson escapes HTML-significant characters', () => {
  const s = safeJson({ a: '<script>&</script>' });
  assert.ok(!s.includes('<script>'));
  assert.ok(s.includes('\\u003c'));
});

test('renderAttributes sorts, escapes, and omits falsey attrs', () => {
  assert.equal(
    renderAttributes({
      disabled: true,
      'data-label': 'a&b<c>d"e',
      hidden: false,
      title: null,
    }),
    ' data-label="a&amp;b&lt;c&gt;d&quot;e" disabled',
  );
});

test('renderHTMLDocument emits doctype', () => {
  const html = renderHTMLDocument({ body: 'ok' });
  assert.ok(html.startsWith('<!doctype html>'));
});

test('renderHTMLDocument merges document shell attrs deterministically', () => {
  const html = renderHTMLDocument({
    lang: 'fr',
    htmlAttrs: {
      class: 'shell',
      'data-theme': 'light',
      lang: 'ignored-by-explicit-lang',
    },
    bodyAttrs: {
      class: 'page',
      hidden: true,
      'data-label': '<unsafe>',
    },
    body: 'ok',
  });

  assert.ok(
    html.includes('<html class="shell" data-theme="light" lang="fr">'),
    html,
  );
  assert.ok(
    html.includes('<body class="page" data-label="&lt;unsafe&gt;" hidden>ok</body>'),
    html,
  );
});


test('security: strict CSP header uses deterministic same-origin no-inline defaults', () => {
  const header = buildStrictCspHeader();

  assert.equal(
    header,
    "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; form-action 'self'",
  );
  assert.equal(header.includes("'unsafe-inline'"), false);
  assert.equal(header.includes("'unsafe-eval'"), false);
});

test('security: strict CSP header can include a deterministic nonce', () => {
  const header = buildStrictCspHeader({ cspNonce: 'abc123' });

  assert.ok(header.includes("script-src 'self' 'nonce-abc123'"));
  assert.ok(header.includes("style-src 'self' 'nonce-abc123'"));
  assert.equal(header.includes("'unsafe-inline'"), false);
  assert.throws(
    () => buildStrictCspHeader({ cspNonce: "bad; nonce" }),
    /nonce contains unsafe characters/,
  );
});

test('security: strict CSP document validator rejects inline document scripts and styles', () => {
  const policy = { inlineScripts: false, inlineStyles: false, rawHead: false } as const;

  assert.throws(
    () =>
      validateStrictCspDocument('<!doctype html><html><body><script>bad()</script></body></html>', {
        policy,
      }),
    /inline script tags in document/,
  );
  assert.throws(
    () =>
      validateStrictCspDocument('<!doctype html><html><body><script type="application/json">{}</script></body></html>', {
        policy,
      }),
    /inline script tags in document/,
  );
  assert.throws(
    () =>
      validateStrictCspDocument('<!doctype html><html><body><style>body{color:red}</style></body></html>', {
        policy,
      }),
    /inline style tags in document/,
  );
  assert.doesNotThrow(() =>
    validateStrictCspDocument('<!doctype html><html><body><script src="/assets/app.js"></script></body></html>', {
      policy,
    }),
  );
});

test('security: strict CSP document validator rejects malformed script end tag bodies', () => {
  const policy = { inlineScripts: false, rawHead: false } as const;

  assert.throws(
    () =>
      validateStrictCspDocument(
        '<!doctype html><html><body><script src="/app.js"></script=not-end>alert(1)</script></body></html>',
        { policy },
      ),
    /inline script tags in document/,
  );
  assert.throws(
    () =>
      validateStrictCspDocument(
        '<!doctype html><html><body><script src="/app.js"></script-foo>alert(1)</script></body></html>',
        { policy },
      ),
    /inline script tags in document/,
  );
});

test('security: strict CSP document validator accepts only empty external script bodies', () => {
  const policy = { inlineScripts: false, rawHead: false } as const;

  assert.doesNotThrow(() =>
    validateStrictCspDocument(
      '<!doctype html><html><body><script src="/app.js"></script></body></html>',
      { policy },
    ),
  );
  assert.doesNotThrow(() =>
    validateStrictCspDocument(
      '<!doctype html><html><body><script src="/app.js"></script data-ignored="yes" ></body></html>',
      { policy },
    ),
  );
  assert.doesNotThrow(() =>
    validateStrictCspDocument(
      '<!doctype html><html><body><script src="/app.js"></SCRIPT \t data-ignored=yes></body></html>',
      { policy },
    ),
  );
  assert.throws(
    () =>
      validateStrictCspDocument(
        '<!doctype html><html><body><script src="/app.js">alert(1)</script data-ignored="yes"></body></html>',
        { policy },
      ),
    /inline script tags in document/,
  );
});

test('security: strict CSP document validator rejects inline body attributes', () => {
  const policy = { inlineScripts: false, inlineStyles: false, rawHead: false } as const;

  assert.throws(
    () =>
      validateStrictCspDocument('<!doctype html><html><body><button onclick="bad()">x</button></body></html>', {
        policy,
      }),
    /inline event handler attribute "onclick" in document/,
  );
  assert.throws(
    () =>
      validateStrictCspDocument('<!doctype html><html><body><main style="color:red">x</main></body></html>', {
        policy,
      }),
    /inline style attributes in document/,
  );
  assert.doesNotThrow(() =>
    validateStrictCspDocument('<!doctype html><html><body><main class="safe">x</main></body></html>', {
      policy,
    }),
  );
});

test('security: strict CSP document validator rejects slash-separated unsafe attributes', () => {
  const scriptsOnlyPolicy = { inlineScripts: false, rawHead: false } as const;
  const stylesOnlyPolicy = { inlineStyles: false, rawHead: false } as const;
  const fullPolicy = { inlineScripts: false, inlineStyles: false, rawHead: false } as const;

  assert.throws(
    () =>
      validateStrictCspDocument('<!doctype html><html><body><button/onclick=alert(1)>x</button></body></html>', {
        policy: scriptsOnlyPolicy,
      }),
    /inline event handler attribute "onclick" in document/,
  );
  assert.throws(
    () =>
      validateStrictCspDocument('<!doctype html><html><body><main/style=color:red>x</main></body></html>', {
        policy: stylesOnlyPolicy,
      }),
    /inline style attributes in document/,
  );
  assert.throws(
    () =>
      validateStrictCspDocument('<!doctype html><html><body><style/x>body{color:red}</style></body></html>', {
        policy: stylesOnlyPolicy,
      }),
    /inline style tags in document/,
  );
  assert.doesNotThrow(() =>
    validateStrictCspDocument(
      '<!doctype html><html><body><main><br/><img src="/logo.png" alt="safe" /><a href=/style=color:red>safe</a></main></body></html>',
      {
        policy: fullPolicy,
      },
    ),
  );
});
