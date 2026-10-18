import assert from 'node:assert/strict';
import test from 'node:test';

import { JSDOM } from 'jsdom';

import {
  fetchFaceNavigationSnapshot,
  type FaceNavigationSnapshot,
} from '../../src/spa.js';

const STRICT_DESTINATION_CSP = "default-src 'self'; script-src 'self'; style-src 'self'";

interface DestinationPage {
  body?: string;
  bodyAttrs?: string;
  head?: string;
  htmlAttrs?: string;
}

function navigationDocument(page: DestinationPage): string {
  return `<!doctype html>
    <html${page.htmlAttrs ?? ''}>
      <head><title>Next</title>${page.head ?? ''}</head>
      <body${page.bodyAttrs ?? ''}><main data-facetheory-view>${page.body ?? ''}</main></body>
    </html>`;
}

async function fetchDestination(
  page: DestinationPage | string,
  csp = STRICT_DESTINATION_CSP,
): Promise<FaceNavigationSnapshot> {
  const html = typeof page === 'string' ? navigationDocument({ body: page }) : navigationDocument(page);
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/',
  });

  try {
    return await fetchFaceNavigationSnapshot('http://localhost/next', {
      allowedOrigin: 'http://localhost',
      parser: new dom.window.DOMParser(),
      fetcher: async () =>
        new Response(html, {
          status: 200,
          headers: {
            'content-type': 'text/html; charset=utf-8',
            'content-security-policy': csp,
          },
        }),
      loadExternalHydration: false,
    });
  } finally {
    dom.window.close();
  }
}

// The destination parse decodes character references before the snapshot is
// serialized, so the screen has to see the decoded URL the injection would
// create. A raw-text screen misses every one of these.
const executableUrlSlips: ReadonlyArray<readonly [string, string]> = [
  ['decimal character reference', '<a href="javascript&#58;alert(1)">Open</a>'],
  ['hexadecimal character reference', '<a href="javascript&#x3a;alert(1)">Open</a>'],
  ['named character reference', '<a href="javascript&colon;alert(1)">Open</a>'],
  ['mixed-case decoded scheme', '<a href="JaVaScRiPt&#x3A;alert(1)">Open</a>'],
  [
    'hexadecimal data URL in an iframe',
    '<iframe src="data&#58;text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=="></iframe>',
  ],
  [
    'named data URL in an anchor',
    '<a href="data&colon;text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">Open</a>',
  ],
];

for (const [label, body] of executableUrlSlips) {
  test(`spa CSP screen: refuses a ${label} executable URL the destination CSP blocks`, async () => {
    await assert.rejects(
      fetchDestination(body),
      /refused to inject executable URL attribute "(href|src)"/,
    );
  });
}

test('spa CSP screen: refuses a destination srcdoc document', async () => {
  await assert.rejects(
    fetchDestination('<iframe srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"></iframe>'),
    /refused to inject an iframe srcdoc document/,
  );
});

test('spa CSP screen: screens document and body attributes that are set directly', async () => {
  await assert.rejects(
    fetchDestination({ bodyAttrs: ' onload="alert(1)"', body: '<p>Body</p>' }),
    /refused to inject inline event handler attribute "onload"/,
  );
  await assert.rejects(
    fetchDestination({ htmlAttrs: ' onclick="alert(1)"', body: '<p>Body</p>' }),
    /refused to inject inline event handler attribute "onclick"/,
  );
  await assert.rejects(
    fetchDestination({ bodyAttrs: ' style="display:none"', body: '<p>Body</p>' }),
    /refused to inject an inline style attribute/,
  );
});

test('spa CSP screen: accepts a compliant destination page unchanged', async () => {
  const snapshot = await fetchDestination({
    bodyAttrs: ' class="page-shell"',
    body: '<a href="/docs?x=1&amp;y=2">Docs</a><img src="data:image/png;base64,iVBORw0KGgo=">',
  });

  assert.match(snapshot.bodyHtml, /href="\/docs\?x=1&amp;y=2"/);
  assert.match(snapshot.bodyHtml, /src="data:image\/png;base64,iVBORw0KGgo="/);
  assert.equal(snapshot.bodyAttrs.class, 'page-shell');
});

test('spa CSP screen: a literal entity after decoding is not an executable scheme', async () => {
  const snapshot = await fetchDestination(
    '<a href="javascript&amp;colon;alert(1)">Not executable</a>',
  );

  // `&amp;colon;` decodes to the literal text `&colon;`, which is a relative
  // reference rather than a `javascript:` URL.
  assert.match(snapshot.bodyHtml, /href="javascript&amp;colon;alert\(1\)"/);
});

test('spa CSP screen: an event-handler-looking attribute name stays inert', async () => {
  const snapshot = await fetchDestination(
    '<button on&#99;lick="alert(1)">Go</button>',
  );

  // Attribute names are not character-reference decoded by HTML parsers, so
  // this is an attribute named `on&#99;lick`, not an `onclick` handler.
  assert.match(snapshot.bodyHtml, /<button on&#99;lick="alert\(1\)">Go<\/button>/);
});
