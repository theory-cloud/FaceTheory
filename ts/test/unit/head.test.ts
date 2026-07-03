import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canonical,
  jsonLd,
  metaTag,
  openGraph,
  renderFaceHead,
  titleTag,
  twitterCard,
} from '../../src/head.js';
import { renderHTMLDocument } from '../../src/html.js';
import { validateStrictCspDocument } from '../../src/security.js';
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

test('head helpers: emit typed tags through deterministic primitive ordering', () => {
  const head = renderFaceHead({
    html: '<main>ok</main>',
    headTags: [
      metaTag('description', 'Helper-first page'),
      ...openGraph({
        title: 'Open Graph title',
        type: 'article',
        url: 'https://app.example/articles/1',
        image: '/assets/card.png',
        additional: { 'image:alt': 'Alt text' },
      }),
      ...twitterCard({
        card: 'summary_large_image',
        title: 'Twitter title',
        description: 'Twitter description',
        image: '/assets/twitter.png',
      }),
      canonical('/articles/1'),
      titleTag('Article', { template: '%s · FaceTheory' }),
    ],
  });

  assert.ok(head.startsWith('<title>Article · FaceTheory</title>'));
  assert.match(head, /<meta content="Helper-first page" name="description">/);
  assert.match(head, /<meta content="Open Graph title" property="og:title">/);
  assert.match(head, /<meta content="article" property="og:type">/);
  assert.match(head, /<meta content="\/assets\/card.png" property="og:image">/);
  assert.match(head, /<meta content="Alt text" property="og:image:alt">/);
  assert.match(head, /<meta content="summary_large_image" name="twitter:card">/);
  assert.match(head, /<meta content="Twitter title" name="twitter:title">/);
  assert.match(head, /<link href="\/articles\/1" rel="canonical">/);
});

test('head helpers: title template requires an explicit placeholder', () => {
  assert.throws(
    () => titleTag('Article', { template: 'FaceTheory' }),
    /title template must include a %s placeholder/,
  );
});

test('head helpers: JSON-LD carries request nonce through strict CSP', () => {
  const strictCsp = {
    inlineScripts: false,
    inlineStyles: false,
    rawHead: false,
  } as const;
  const head = renderFaceHead(
    {
      html: '<main>jsonld</main>',
      csp: strictCsp,
      headTags: [
        jsonLd({ '@context': 'https://schema.org', name: '</script><b>safe</b>' }),
      ],
    },
    { cspNonce: 'nonce-jsonld' },
  );

  assert.ok(
    head.includes(
      '<script nonce="nonce-jsonld" type="application/ld+json">',
    ),
  );
  assert.ok(head.includes('\\u003c/script\\u003e'));
  assert.equal(head.includes('</script><b>safe</b>'), false);

  const documentHtml = renderHTMLDocument({
    head,
    body: '<main>jsonld</main>',
  });
  assert.doesNotThrow(() =>
    validateStrictCspDocument(documentHtml, {
      policy: strictCsp,
      cspNonce: 'nonce-jsonld',
    }),
  );
});

test('head helpers: strict JSON-LD fails closed without matching request nonce', () => {
  const strictCsp = {
    inlineScripts: false,
    inlineStyles: false,
    rawHead: false,
  } as const;

  assert.throws(
    () =>
      renderFaceHead({
        html: '<main>jsonld</main>',
        csp: strictCsp,
        headTags: [jsonLd({ name: 'missing nonce' })],
      }),
    /strict CSP rejects inline script tags/,
  );

  assert.throws(
    () =>
      renderFaceHead(
        {
          html: '<main>jsonld</main>',
          csp: strictCsp,
          headTags: [jsonLd({ name: 'wrong nonce' }, { nonce: 'nonce-a' })],
        },
        { cspNonce: 'nonce-b' },
      ),
    /strict CSP rejects inline script tags/,
  );
});

test('head helpers: keyless JSON-LD tags remain dedup exempt', () => {
  const firstJsonLd = jsonLd({ '@type': 'BreadcrumbList', position: 1 });
  const head = renderFaceHead({
    html: '<main>jsonld</main>',
    headTags: [
      firstJsonLd,
      jsonLd({ '@type': 'NewsArticle', headline: 'Two' }),
    ],
  });

  assert.equal((firstJsonLd as { body?: string }).body, undefined);
  assert.equal(
    (head.match(/type="application\/ld\+json"/g) ?? []).length,
    2,
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

test('head: external hydration emits metadata without inline JSON', () => {
  const head = renderFaceHead({
    html: '<div>ok</div>',
    hydration: {
      type: 'external',
      data: { a: '<script>&</script>' },
      dataUrl: '/_facetheory/hydration/page.json',
      bootstrapModule: '/assets/entry.js',
    },
  });

  assert.ok(
    head.includes(
      '<link href="/_facetheory/hydration/page.json" id="__FACETHEORY_DATA_URL__" rel="facetheory-hydration" type="application/json">',
    ),
  );
  assert.ok(head.includes('<script src="/assets/entry.js" type="module"></script>'));
  assert.equal(head.includes('__FACETHEORY_DATA__'), false);
  assert.equal(head.includes('\\u003cscript'), false);
});

test('head: strict CSP rejects inline script, style, raw head, and unsafe attributes', () => {
  const csp = {
    inlineScripts: false,
    inlineStyles: false,
    rawHead: false,
  } as const;

  assert.throws(
    () =>
      renderFaceHead({
        html: '<div>ok</div>',
        csp,
        hydration: { data: { page: 'inline' }, bootstrapModule: '/assets/entry.js' },
      }),
    /strict CSP rejects inline script tags/,
  );

  assert.throws(
    () =>
      renderFaceHead({
        html: '<div>ok</div>',
        csp,
        styleTags: [{ cssText: 'body{color:red}' }],
      }),
    /strict CSP rejects inline style tags/,
  );

  assert.throws(
    () =>
      renderFaceHead({
        html: '<div>ok</div>',
        csp,
        headTags: [{ type: 'raw', html: '<meta name="unsafe" content="1">' }],
      }),
    /strict CSP rejects raw head HTML/,
  );

  assert.throws(
    () =>
      renderFaceHead({
        html: '<div>ok</div>',
        csp,
        headTags: [{ type: 'meta', attrs: { onclick: 'alert(1)' } }],
      }),
    /inline event handler attribute/,
  );

  assert.throws(
    () =>
      renderFaceHead({
        html: '<div>ok</div>',
        csp,
        headTags: [{ type: 'meta', attrs: { style: 'color:red' } }],
      }),
    /inline style attributes/,
  );
});

test('head: strict CSP allows external hydration with same-origin URLs', () => {
  const head = renderFaceHead(
    {
      html: '<div>ok</div>',
      csp: {
        inlineScripts: false,
        inlineStyles: false,
        rawHead: false,
      },
      head: {
        title: 'Strict',
        html: '<meta name="escaped">',
      },
      headTags: [{ type: 'link', attrs: { rel: 'stylesheet', href: '/assets/app.css' } }],
      hydration: {
        type: 'external',
        data: { page: 'strict' },
        dataUrl: '/_facetheory/hydration/strict.json',
        bootstrapModule: '/assets/entry.js',
      },
    },
    { allowedOrigin: 'https://app.example' },
  );

  assert.ok(head.includes('<title>Strict</title>'));
  assert.ok(head.includes('&lt;meta name=&quot;escaped&quot;&gt;'));
  assert.ok(head.includes('href="/_facetheory/hydration/strict.json"'));
  assert.equal(head.includes('__FACETHEORY_DATA__'), false);
});

test('head: strict CSP rejects cross-origin bootstrap and data URLs', () => {
  const csp = {
    inlineScripts: false,
    inlineStyles: false,
    rawHead: false,
  } as const;

  assert.throws(
    () =>
      renderFaceHead(
        {
          html: '<div>ok</div>',
          csp,
          hydration: {
            type: 'external',
            data: { page: 'strict' },
            dataUrl: '/_facetheory/hydration/strict.json',
            bootstrapModule: 'https://evil.example/entry.js',
          },
        },
        { allowedOrigin: 'https://app.example' },
      ),
    /script src URL resolved cross-origin/,
  );

  assert.throws(
    () =>
      renderFaceHead(
        {
          html: '<div>ok</div>',
          csp,
          hydration: {
            type: 'external',
            data: { page: 'strict' },
            dataUrl: 'https://evil.example/data.json',
            bootstrapModule: '/assets/entry.js',
          },
        },
        { allowedOrigin: 'https://app.example' },
      ),
    /link href URL resolved cross-origin/,
  );
});

test('head: strict CSP allows same-origin relative and absolute script src/link href URLs', () => {
  const csp = {
    inlineScripts: false,
    inlineStyles: false,
    rawHead: false,
  } as const;

  const relativeHead = renderFaceHead({
    html: '<div>ok</div>',
    csp,
    headTags: [
      { type: 'script', attrs: { type: 'module', src: '/assets/entry.js' } },
      { type: 'link', attrs: { rel: 'stylesheet', href: 'assets/app.css' } },
    ],
  });

  assert.ok(relativeHead.includes('src="/assets/entry.js"'));
  assert.ok(relativeHead.includes('href="assets/app.css"'));

  const absoluteHead = renderFaceHead(
    {
      html: '<div>ok</div>',
      csp,
      headTags: [
        {
          type: 'script',
          attrs: { type: 'module', src: 'https://app.example/assets/entry.js' },
        },
        {
          type: 'link',
          attrs: { rel: 'stylesheet', href: 'https://app.example/assets/app.css' },
        },
      ],
    },
    { allowedOrigin: 'https://app.example' },
  );

  assert.ok(absoluteHead.includes('src="https://app.example/assets/entry.js"'));
  assert.ok(absoluteHead.includes('href="https://app.example/assets/app.css"'));
});

test('head: strict CSP rejects unsafe and canonical cross-origin script src/link href URLs', () => {
  const csp = {
    inlineScripts: false,
    inlineStyles: false,
    rawHead: false,
  } as const;

  assert.throws(
    () =>
      renderFaceHead(
        {
          html: '<div>ok</div>',
          csp,
          headTags: [
            { type: 'script', attrs: { type: 'module', src: 'javascript:alert(1)' } },
          ],
        },
        { allowedOrigin: 'https://app.example' },
      ),
    /script src URL must be http\(s\) or same-origin/,
  );

  assert.throws(
    () =>
      renderFaceHead(
        {
          html: '<div>ok</div>',
          csp,
          headTags: [
            { type: 'link', attrs: { rel: 'stylesheet', href: '//evil.example/app.css' } },
          ],
        },
        { allowedOrigin: 'https://app.example' },
      ),
    /link href URL resolved cross-origin/,
  );

  assert.throws(
    () =>
      renderFaceHead({
        html: '<div>ok</div>',
        csp,
        headTags: [
          {
            type: 'script',
            attrs: { type: 'module', src: 'https://app.example/assets/entry.js' },
          },
        ],
      }),
    /script src URL must be same-origin or relative/,
  );
});

test('head: strict CSP rejects backslash and control-normalized cross-origin head URLs', () => {
  const csp = {
    inlineScripts: false,
    inlineStyles: false,
    rawHead: false,
  } as const;

  for (const src of [
    '/\\evil.example/entry.js',
    '/\\\\evil.example/entry.js',
    '/\t/evil.example/entry.js',
  ]) {
    assert.throws(
      () =>
        renderFaceHead(
          {
            html: '<div>ok</div>',
            csp,
            headTags: [{ type: 'script', attrs: { type: 'module', src } }],
          },
          { allowedOrigin: 'https://app.example' },
        ),
      /script src URL resolved cross-origin/,
    );
  }

  for (const href of [
    '/\\evil.example/app.css',
    '/\\\\evil.example/app.css',
    '/\n/evil.example/app.css',
  ]) {
    assert.throws(
      () =>
        renderFaceHead(
          {
            html: '<div>ok</div>',
            csp,
            headTags: [{ type: 'link', attrs: { rel: 'stylesheet', href } }],
          },
          { allowedOrigin: 'https://app.example' },
        ),
      /link href URL resolved cross-origin/,
    );
  }
});

test('head: strict CSP fails closed for browser-cross-origin URLs without allowed origin', () => {
  const csp = {
    inlineScripts: false,
    inlineStyles: false,
    rawHead: false,
  } as const;

  assert.throws(
    () =>
      renderFaceHead({
        html: '<div>ok</div>',
        csp,
        headTags: [
          { type: 'script', attrs: { type: 'module', src: '/\\evil.example/entry.js' } },
        ],
      }),
    /script src URL must be same-origin or relative/,
  );

  assert.throws(
    () =>
      renderFaceHead({
        html: '<div>ok</div>',
        csp,
        headTags: [
          { type: 'link', attrs: { rel: 'stylesheet', href: '/\t/evil.example/app.css' } },
        ],
      }),
    /link href URL must be same-origin or relative/,
  );
});

test('head: strict CSP rejects backslash-normalized external hydration URLs', () => {
  const csp = {
    inlineScripts: false,
    inlineStyles: false,
    rawHead: false,
  } as const;

  assert.throws(
    () =>
      renderFaceHead(
        {
          html: '<div>ok</div>',
          csp,
          hydration: {
            type: 'external',
            data: { page: 'strict' },
            dataUrl: '/_facetheory/hydration/strict.json',
            bootstrapModule: '/\\evil.example/entry.js',
          },
        },
        { allowedOrigin: 'https://app.example' },
      ),
    /script src URL resolved cross-origin/,
  );

  assert.throws(
    () =>
      renderFaceHead(
        {
          html: '<div>ok</div>',
          csp,
          hydration: {
            type: 'external',
            data: { page: 'strict' },
            dataUrl: '/\t/evil.example/data.json',
            bootstrapModule: '/assets/entry.js',
          },
        },
        { allowedOrigin: 'https://app.example' },
      ),
    /link href URL resolved cross-origin/,
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
