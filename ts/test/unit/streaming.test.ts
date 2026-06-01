import assert from 'node:assert/strict';
import test from 'node:test';

import { css, jsx } from '@emotion/react';
import { Button } from 'antd';
import * as React from 'react';

import { assertDocumentTagNonces } from '../helpers/csp.js';

import { streamFromString, utf8 } from '../../src/bytes.js';
import {
  createFaceApp,
  DEFAULT_STRICT_CSP_STREAMING_BODY_LIMIT_BYTES,
} from '../../src/app.js';
import { createReactStreamFace } from '../../src/adapters/react.js';
import { InMemoryHtmlStore } from '../../src/isr.js';
import { createAntdEmotionTokenIntegration } from '../../src/react/antd-emotion.js';
import { createAntdIntegration } from '../../src/react/antd.js';
import { createEmotionIntegration } from '../../src/react/emotion.js';
import type { FaceBody } from '../../src/types.js';

async function collectBodyChunks(
  body: FaceBody,
): Promise<{ chunks: string[]; full: string }> {
  const decoder = new TextDecoder();
  if (body instanceof Uint8Array) {
    const full = decoder.decode(body);
    return { chunks: [full], full };
  }

  const chunks: string[] = [];
  for await (const chunk of body) {
    chunks.push(decoder.decode(chunk, { stream: true }));
  }
  chunks.push(decoder.decode());
  return { chunks, full: chunks.join('') };
}

function extractScriptTags(html: string): string[] {
  const tags: string[] = [];
  const lower = html.toLowerCase();
  let cursor = 0;

  for (;;) {
    const start = lower.indexOf('<script', cursor);
    if (start === -1) break;
    const nameEnd = start + '<script'.length;
    if (!isHtmlTagBoundary(lower, nameEnd)) {
      cursor = nameEnd;
      continue;
    }

    const startTagEnd = findHtmlTagEnd(html, nameEnd);
    if (startTagEnd === -1) break;
    const endStart = findScriptEndTagStart(lower, startTagEnd + 1);
    if (endStart === -1) break;
    const endTagEnd = findHtmlTagEnd(html, endStart + '</script'.length);
    if (endTagEnd === -1) break;

    tags.push(html.slice(start, endTagEnd + 1));
    cursor = endTagEnd + 1;
  }

  return tags;
}

function findScriptEndTagStart(lowerHtml: string, from: number): number {
  let cursor = from;
  for (;;) {
    const start = lowerHtml.indexOf('</script', cursor);
    if (start === -1) return -1;
    const nameEnd = start + '</script'.length;
    if (isHtmlTagBoundary(lowerHtml, nameEnd)) return start;
    cursor = nameEnd;
  }
}

function findHtmlTagEnd(html: string, from: number): number {
  let quote: '"' | "'" | null = null;
  for (let index = from; index < html.length; index += 1) {
    const char = html[index];
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '>') return index;
  }
  return -1;
}

function isHtmlTagBoundary(html: string, index: number): boolean {
  if (index >= html.length) return false;
  const code = html.charCodeAt(index);
  return code === 47 || code === 62 || isHtmlWhitespace(code);
}

function isHtmlWhitespace(code: number): boolean {
  return code === 9 || code === 10 || code === 12 || code === 13 || code === 32;
}

function extractHydrationHref(html: string): string {
  const tag = /<link\b[^>]*rel="facetheory-hydration"[^>]*>/i.exec(html)?.[0];
  assert.ok(tag, 'expected FaceTheory hydration link');
  const href = /\bhref="([^"]+)"/i.exec(tag)?.[1];
  assert.ok(href, 'expected FaceTheory hydration href');
  return href;
}

async function collectBody(body: FaceBody): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body;
  const chunks: Uint8Array[] = [];
  for await (const chunk of body) chunks.push(chunk);
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createLateStylesTree(delayMs: number): React.ReactElement {
  const LazyPanel = React.lazy(async () => {
    await delay(delayMs);
    return {
      default: function LazyPanelComponent() {
        return React.createElement(
          'section',
          null,
          React.createElement(Button, { type: 'primary' }, 'Late AntD'),
          jsx(
            'div',
            {
              css: css`
                color: #123abc;
              `,
            },
            'Late Emotion',
          ),
        );
      },
    };
  });

  return React.createElement(
    React.Suspense,
    { fallback: React.createElement('p', null, 'Loading late styles') },
    React.createElement(LazyPanel),
  );
}

test('FaceApp: wraps streaming HTML in full document with head first', async () => {
  const app = createFaceApp({
    faces: [
      {
        route: '/',
        mode: 'ssr',
        render: () => ({
          headTags: [{ type: 'title', text: 'Stream' }],
          html: streamFromString('<div>streamed</div>'),
        }),
      },
    ],
  });

  const resp = await app.handle({ method: 'GET', path: '/' });
  assert.equal(resp.status, 200);

  assert.ok(!(resp.body instanceof Uint8Array));

  const firstChunk = await (resp.body as AsyncIterable<Uint8Array>)
    [Symbol.asyncIterator]()
    .next();
  assert.equal(firstChunk.done, false);
  const first = new TextDecoder().decode(firstChunk.value);
  assert.ok(first.startsWith('<!doctype html>'));
  assert.ok(first.includes('<title>Stream</title>'));
  assert.ok(!first.includes('streamed'));

  const full = new TextDecoder().decode(await collectBody(resp.body));
  assert.ok(full.includes('<div>streamed</div>'));
});

test('FaceApp: streaming + CSP nonce applies to hydration scripts', async () => {
  const app = createFaceApp({
    faces: [
      {
        route: '/',
        mode: 'ssr',
        render: () => ({
          html: (async function* () {
            yield utf8('<main>ok</main>');
          })(),
          hydration: { data: { a: 1 }, bootstrapModule: '/assets/entry.js' },
        }),
      },
    ],
  });

  const resp = await app.handle({
    method: 'GET',
    path: '/',
    cspNonce: 'nonce-stream',
  });
  const full = new TextDecoder().decode(await collectBody(resp.body));
  assert.ok(full.includes('id="__FACETHEORY_DATA__"'));
  assert.ok(full.includes('nonce="nonce-stream"'));
  assert.ok(full.includes('src="/assets/entry.js"'));
});

test('FaceApp: streaming emits document shell attrs before the body stream', async () => {
  const app = createFaceApp({
    faces: [
      {
        route: '/',
        mode: 'ssr',
        render: () => ({
          lang: 'fa',
          htmlAttrs: { dir: 'rtl', 'data-theme': 'sand' },
          bodyAttrs: { class: 'stream-shell' },
          html: streamFromString('<div>streamed</div>'),
        }),
      },
    ],
  });

  const resp = await app.handle({ method: 'GET', path: '/' });
  assert.ok(!(resp.body instanceof Uint8Array));

  const firstChunk = await (resp.body as AsyncIterable<Uint8Array>)
    [Symbol.asyncIterator]()
    .next();
  assert.equal(firstChunk.done, false);
  const first = new TextDecoder().decode(firstChunk.value);
  assert.ok(
    first.includes('<html data-theme="sand" dir="rtl" lang="fa">'),
    first,
  );
  assert.ok(first.includes('<body class="stream-shell">'), first);
  assert.ok(!first.includes('streamed'));
});

test('FaceApp: non-strict streaming preflights without buffering the full body', async () => {
  let streamChunksRead = 0;
  const app = createFaceApp({
    faces: [
      {
        route: '/',
        mode: 'ssr',
        render: () => ({
          html: (async function* () {
            streamChunksRead += 1;
            yield utf8('<main>first</main>');
            streamChunksRead += 1;
            yield utf8('<footer>second</footer>');
          })(),
        }),
      },
    ],
  });

  const resp = await app.handle({ method: 'GET', path: '/' });
  assert.equal(resp.status, 200);
  assert.ok(!(resp.body instanceof Uint8Array));
  assert.equal(streamChunksRead, 1);

  const full = new TextDecoder().decode(await collectBody(resp.body));
  assert.ok(full.includes('<main>first</main>'));
  assert.ok(full.includes('<footer>second</footer>'));
  assert.equal(streamChunksRead, 2);
});

test('FaceApp: strict CSP streaming responses are coerced to validated buffered HTML', async () => {
  const app = createFaceApp({
    faces: [
      {
        route: '/',
        mode: 'ssr',
        render: () => ({
          csp: {
            inlineScripts: false,
            inlineStyles: false,
            rawHead: false,
          },
          hydration: {
            type: 'external',
            data: { page: 'strict-stream' },
            dataUrl: '/_facetheory/hydration/strict-stream.json',
            bootstrapModule: '/assets/entry.js',
          },
          html: streamFromString('<main>strict streamed</main>'),
        }),
      },
    ],
  });

  const resp = await app.handle({ method: 'GET', path: '/' });
  assert.equal(resp.status, 200);
  assert.ok(resp.body instanceof Uint8Array);

  const full = new TextDecoder().decode(resp.body);
  assert.ok(full.includes('<main>strict streamed</main>'));
  assert.ok(full.includes('rel="facetheory-hydration"'));
  assert.equal(full.includes('__FACETHEORY_DATA__'), false);
});

test('FaceApp: strict CSP streaming with nonce validates the head and preserves streaming', async () => {
  let streamChunksRead = 0;
  const metrics: Array<{ name: string; tags?: Record<string, string> }> = [];
  const logs: Array<{ isStream?: boolean }> = [];
  const app = createFaceApp({
    observability: {
      metric: (entry) => metrics.push(entry),
      log: (entry) => logs.push(entry),
    },
    faces: [
      {
        route: '/',
        mode: 'ssr',
        render: () => ({
          csp: {
            inlineScripts: false,
            inlineStyles: false,
            rawHead: false,
          },
          headTags: [
            { type: 'title', text: 'Old title' },
            { type: 'meta', attrs: { name: 'description', content: 'old' } },
            {
              type: 'link',
              attrs: { rel: 'stylesheet', href: '/assets/app.css' },
            },
            { type: 'meta', attrs: { charset: 'utf-8' } },
            { type: 'title', text: 'Strict streamed title' },
            { type: 'meta', attrs: { name: 'description', content: 'new' } },
          ],
          hydration: {
            type: 'external',
            data: { page: 'strict-stream' },
            dataUrl: '/_facetheory/hydration/strict-stream.json',
            bootstrapModule: '/assets/entry.js',
          },
          html: (async function* () {
            streamChunksRead += 1;
            yield utf8('<main>strict streamed first</main>');
            streamChunksRead += 1;
            yield utf8('<footer>strict streamed second</footer>');
          })(),
        }),
      },
    ],
  });

  const resp = await app.handle({
    method: 'GET',
    path: '/',
    cspNonce: 'nonce-strict-stream',
  });
  assert.equal(resp.status, 200);
  assert.ok(!(resp.body instanceof Uint8Array));
  assert.equal(streamChunksRead, 1);
  assert.match(
    resp.headers['content-security-policy']?.[0] ?? '',
    /script-src 'self' 'nonce-nonce-strict-stream'/,
  );
  assert.match(
    resp.headers['content-security-policy']?.[0] ?? '',
    /style-src 'self' 'nonce-nonce-strict-stream'/,
  );

  const requestMetric = metrics.find(
    (entry) => entry.name === 'facetheory.request',
  );
  assert.equal(requestMetric?.tags?.is_stream, '1');
  assert.equal(logs.at(-1)?.isStream, true);

  const iterator = (resp.body as AsyncIterable<Uint8Array>)[
    Symbol.asyncIterator
  ]();
  const firstChunk = await iterator.next();
  assert.equal(firstChunk.done, false);
  const first = new TextDecoder().decode(firstChunk.value);
  assert.ok(first.startsWith('<!doctype html>'));
  assert.match(
    first,
    /<head><meta charset="utf-8"><title>Strict streamed title<\/title><link href="\/assets\/app.css" rel="stylesheet"><meta content="new" name="description"><link href="\/_facetheory\/hydration\/strict-stream\.json" id="__FACETHEORY_DATA_URL__" rel="facetheory-hydration" type="application\/json"><script nonce="nonce-strict-stream" src="\/assets\/entry\.js" type="module"><\/script><\/head>/,
  );
  assert.equal(first.includes('Old title'), false);
  assert.equal(first.includes('content="old"'), false);
  assert.equal(first.includes('strict streamed first'), false);

  const rest: Uint8Array[] = [];
  for (;;) {
    const next = await iterator.next();
    if (next.done) break;
    rest.push(next.value);
  }
  const full =
    first +
    new TextDecoder().decode(
      await collectBody(
        (async function* () {
          for (const chunk of rest) yield chunk;
        })(),
      ),
    );
  assert.ok(full.includes('<main>strict streamed first</main>'));
  assert.ok(full.includes('<footer>strict streamed second</footer>'));
  assert.equal(streamChunksRead, 2);
});

test('FaceApp: strict CSP streaming uses a default bounded collector', async () => {
  const oversized = new Uint8Array(
    DEFAULT_STRICT_CSP_STREAMING_BODY_LIMIT_BYTES + 1,
  );
  oversized.fill('a'.charCodeAt(0));

  const app = createFaceApp({
    faces: [
      {
        route: '/',
        mode: 'ssr',
        render: () => ({
          csp: {
            inlineScripts: false,
            inlineStyles: false,
            rawHead: false,
          },
          html: (async function* () {
            yield oversized;
          })(),
        }),
      },
    ],
  });

  const resp = await app.handle({ method: 'GET', path: '/' });
  assert.equal(resp.status, 413);
  assert.ok(resp.body instanceof Uint8Array);

  const full = new TextDecoder().decode(resp.body);
  assert.ok(full.includes('<h1>Payload Too Large</h1>'));
  assert.ok(full.includes('strict-csp-stream-body-too-large'));
  assert.equal(full.includes('<main>'), false);
  assert.ok(resp.body.byteLength < 512);
});

test('FaceApp: strict CSP streaming limit counts raw bytes and fails closed', async () => {
  let streamChunksRead = 0;
  const app = createFaceApp({
    strictCsp: { maxStreamingBodyBytes: 4 },
    faces: [
      {
        route: '/',
        mode: 'ssr',
        render: () => ({
          csp: {
            inlineScripts: false,
            inlineStyles: false,
            rawHead: false,
          },
          html: (async function* () {
            streamChunksRead += 1;
            yield utf8('ab');
            streamChunksRead += 1;
            yield utf8('€');
            streamChunksRead += 1;
            yield utf8('<button onclick="bad()">unsafe</button>');
          })(),
        }),
      },
    ],
  });

  const resp = await app.handle({ method: 'GET', path: '/' });
  assert.equal(resp.status, 413);
  assert.ok(resp.body instanceof Uint8Array);
  assert.equal(streamChunksRead, 2);

  const full = new TextDecoder().decode(resp.body);
  assert.ok(full.includes('<h1>Payload Too Large</h1>'));
  assert.equal(full.includes('ab'), false);
  assert.equal(full.includes('€'), false);
  assert.equal(full.includes('onclick'), false);
});

test('FaceApp: strict CSP streaming violations fail before bytes flush', async () => {
  const app = createFaceApp({
    faces: [
      {
        route: '/',
        mode: 'ssr',
        render: () => ({
          csp: {
            inlineScripts: false,
            inlineStyles: false,
            rawHead: false,
          },
          hydration: {
            type: 'external',
            data: { page: 'strict-stream' },
            dataUrl: '/_facetheory/hydration/strict-stream.json',
            bootstrapModule: '/assets/entry.js',
          },
          html: (async function* () {
            yield utf8('<main>first chunk</main>');
            yield utf8('<button onclick="bad()">unsafe</button>');
          })(),
        }),
      },
    ],
  });

  const resp = await app.handle({ method: 'GET', path: '/' });
  assert.equal(resp.status, 500);
  assert.ok(resp.body instanceof Uint8Array);

  const full = new TextDecoder().decode(resp.body);
  assert.ok(full.includes('<h1>Internal Server Error</h1>'));
  assert.equal(full.includes('first chunk'), false);
  assert.equal(full.includes('onclick'), false);
});

test('FaceApp: strict React stream externalizes hydration sidecar and keeps bootstrap module external', async () => {
  const htmlStore = new InMemoryHtmlStore();
  const app = createFaceApp({
    ssrHydrationSidecars: {
      htmlStore,
      signingSecret: 'strict streaming sidecar signing secret',
      now: () => 123_000,
    },
    faces: [
      createReactStreamFace({
        route: '/',
        mode: 'ssr',
        render: () =>
          React.createElement('main', null, 'Strict stream sidecar'),
        renderOptions: {
          styleStrategy: 'shell',
          csp: { inlineScripts: false, inlineStyles: false, rawHead: false },
          hydration: {
            data: { page: 'strict-stream-sidecar' },
            bootstrapModule: '/assets/strict-stream-entry.js',
          },
        },
      }),
    ],
  });

  const resp = await app.handle({
    method: 'GET',
    path: '/',
    cspNonce: 'nonce-sidecar-stream',
  });
  assert.equal(resp.status, 200);
  assert.ok(!(resp.body instanceof Uint8Array));

  const { full } = await collectBodyChunks(resp.body);
  assert.ok(full.includes('Strict stream sidecar'));
  assert.ok(full.includes('id="__FACETHEORY_DATA_URL__"'));
  assert.ok(full.includes('rel="facetheory-hydration"'));
  assert.ok(
    full.includes(
      '<script nonce="nonce-sidecar-stream" src="/assets/strict-stream-entry.js" type="module"></script>',
    ),
  );
  assert.equal(full.includes('id="__FACETHEORY_DATA__"'), false);

  const dataUrl = extractHydrationHref(full);
  const sidecarResp = await app.handle({
    method: 'GET',
    path: dataUrl,
    cspNonce: 'nonce-sidecar-resource',
  });
  assert.equal(sidecarResp.status, 200);
  assert.ok(sidecarResp.body instanceof Uint8Array);
  assert.deepEqual(JSON.parse(new TextDecoder().decode(sidecarResp.body)), {
    page: 'strict-stream-sidecar',
  });
});

test('react adapter: React 19 shell stream nonces bootstrap and Suspense reveal scripts', async () => {
  const nonce = 'nonce-react19-midstream';
  const LazyPanel = React.lazy(async () => {
    await delay(40);
    return {
      default: function LazyPanelComponent() {
        return React.createElement('section', null, 'Late control-plane data');
      },
    };
  });

  const app = createFaceApp({
    faces: [
      createReactStreamFace({
        route: '/',
        mode: 'ssr',
        render: () =>
          React.createElement(
            'main',
            null,
            React.createElement('h1', null, 'Control plane shell'),
            React.createElement(
              React.Suspense,
              { fallback: React.createElement('p', null, 'Loading data') },
              React.createElement(LazyPanel),
            ),
          ),
        renderOptions: {
          styleStrategy: 'shell',
          csp: { inlineScripts: false, inlineStyles: false, rawHead: false },
          hydration: {
            type: 'external',
            data: { page: 'control-plane-stream' },
            dataUrl: '/_facetheory/hydration/control-plane-stream.json',
            bootstrapModule: '/assets/control-plane-entry.js',
          },
        },
      }),
    ],
  });

  const resp = await app.handle({ method: 'GET', path: '/', cspNonce: nonce });
  assert.equal(resp.status, 200);
  assert.ok(!(resp.body instanceof Uint8Array));

  const { chunks, full } = await collectBodyChunks(resp.body);
  assert.ok(
    chunks.length >= 4,
    `expected streamed chunks, received ${String(chunks.length)}`,
  );
  assert.ok(full.includes('Control plane shell'));
  assert.ok(full.includes('Loading data'));
  assert.ok(full.includes('Late control-plane data'));

  const scriptTags = extractScriptTags(full);
  assert.ok(scriptTags.length >= 3, scriptTags.join('\n'));
  assert.ok(
    scriptTags.some((tag) =>
      tag.includes('src="/assets/control-plane-entry.js"'),
    ),
    scriptTags.join('\n'),
  );
  assert.ok(
    scriptTags.some((tag) => tag.includes('$RT=performance.now()')),
    scriptTags.join('\n'),
  );
  assert.ok(
    scriptTags.some((tag) => tag.includes('$RC(')),
    scriptTags.join('\n'),
  );

  for (const tag of scriptTags) {
    assert.ok(tag.includes(`nonce="${nonce}"`), tag);
  }

  const reactScriptChunks = chunks.filter(
    (chunk) =>
      chunk.includes('<script') &&
      (chunk.includes('$RT=') || chunk.includes('$RC(')),
  );
  assert.ok(reactScriptChunks.length >= 2, reactScriptChunks.join('\n'));
  assert.ok(
    reactScriptChunks.every((chunk) => chunk.includes(`nonce="${nonce}"`)),
  );
});

test('react adapter: streaming includes AntD + Emotion styles in head before body', async () => {
  function EmotionBox() {
    return jsx(
      'div',
      {
        css: css`
          color: rgb(1, 2, 3);
        `,
      },
      'Emotion',
    );
  }

  const app = createFaceApp({
    faces: [
      createReactStreamFace({
        route: '/',
        mode: 'ssr',
        render: () =>
          React.createElement(
            'div',
            null,
            React.createElement(Button, { type: 'primary' }, 'OK'),
            jsx(EmotionBox, {}),
          ),
        renderOptions: {
          headTags: [{ type: 'title', text: 'Stream Styles' }],
          integrations: [
            createAntdEmotionTokenIntegration(),
            createAntdIntegration({ hashed: false }),
            createEmotionIntegration(),
          ],
        },
      }),
    ],
  });

  const resp = await app.handle({
    method: 'GET',
    path: '/',
    cspNonce: 'nonce-stream-styles',
  });
  assert.ok(!(resp.body instanceof Uint8Array));

  const it = (resp.body as AsyncIterable<Uint8Array>)[Symbol.asyncIterator]();
  const firstChunk = await it.next();
  assert.equal(firstChunk.done, false);

  const dec = new TextDecoder();
  const first = dec.decode(firstChunk.value);

  assert.ok(first.startsWith('<!doctype html>'));
  assert.ok(first.includes('<title>Stream Styles</title>'));
  assert.ok(first.includes('data-emotion='));
  assert.ok(first.includes('nonce="nonce-stream-styles"'));
  assert.ok(
    first.includes('data-rc-order=') || first.includes('data-rc-priority='),
  );
  assert.ok(!first.includes('Emotion'));
  assert.ok(!first.includes('OK'));

  const parts: string[] = [first];
  for (;;) {
    const next = await it.next();
    if (next.done) break;
    parts.push(dec.decode(next.value, { stream: true }));
  }
  parts.push(dec.decode());

  const full = parts.join('');
  assert.ok(full.includes('Emotion'));
  assert.ok(full.includes('OK'));
});

test('react adapter: default all-ready style strategy captures late Suspense styles in first chunk', async () => {
  const app = createFaceApp({
    faces: [
      createReactStreamFace({
        route: '/',
        mode: 'ssr',
        render: () => createLateStylesTree(20),
        renderOptions: {
          headTags: [{ type: 'title', text: 'Late Styles' }],
          integrations: [
            createAntdIntegration({ hashed: false }),
            createEmotionIntegration(),
          ],
        },
      }),
    ],
  });

  const resp = await app.handle({
    method: 'GET',
    path: '/',
    cspNonce: 'nonce-r5-all-ready',
  });
  assert.ok(!(resp.body instanceof Uint8Array));

  const iterator = (resp.body as AsyncIterable<Uint8Array>)[
    Symbol.asyncIterator
  ]();
  const firstChunk = await iterator.next();
  assert.equal(firstChunk.done, false);

  const decoder = new TextDecoder();
  const first = decoder.decode(firstChunk.value);
  assert.ok(first.includes('<title>Late Styles</title>'));
  assert.ok(first.includes('data-emotion='));
  assert.ok(first.includes('#123abc'));
  assert.ok(first.includes('ant-btn'));
  assert.ok(first.includes('nonce="nonce-r5-all-ready"'));
  assert.ok(!first.includes('Late Emotion'));

  const chunks: string[] = [first];
  for (;;) {
    const next = await iterator.next();
    if (next.done) break;
    chunks.push(decoder.decode(next.value, { stream: true }));
  }
  chunks.push(decoder.decode());

  const full = chunks.join('');
  assert.ok(full.includes('Late Emotion'));
  assert.ok(full.includes('Late AntD'));
  assert.ok(!full.includes('Loading late styles'));
});

test('react adapter: shell strategy is configurable and does not include late styles in head', async () => {
  const app = createFaceApp({
    faces: [
      createReactStreamFace({
        route: '/',
        mode: 'ssr',
        render: () => createLateStylesTree(20),
        renderOptions: {
          styleStrategy: 'shell',
          integrations: [
            createAntdIntegration({ hashed: false }),
            createEmotionIntegration(),
          ],
        },
      }),
    ],
  });

  const resp = await app.handle({ method: 'GET', path: '/' });
  assert.ok(!(resp.body instanceof Uint8Array));

  const iterator = (resp.body as AsyncIterable<Uint8Array>)[
    Symbol.asyncIterator
  ]();
  const firstChunk = await iterator.next();
  assert.equal(firstChunk.done, false);

  const decoder = new TextDecoder();
  const first = decoder.decode(firstChunk.value);
  assert.ok(!first.includes('data-emotion='));
  assert.ok(!first.includes('#123abc'));
  assert.ok(!first.includes('ant-btn'));
});

test('react adapter: integrations receive isolated per-render state across the render lifecycle', async () => {
  let nextStateId = 0;
  const app = createFaceApp({
    faces: [
      createReactStreamFace({
        route: '/',
        mode: 'ssr',
        render: () => React.createElement('main', { className: 'from-int' }, 'Request state'),
        renderOptions: {
          integrations: [
            {
              name: 'react-request-state',
              createState: () => ({ id: ++nextStateId }),
              wrapTree: (tree, _ctx, state) =>
                React.createElement(
                  'section',
                  { className: `wrapped-${String((state as { id: number }).id)}` },
                  tree,
                ),
              contribute: (_ctx, state) => ({
                headTags: [
                  {
                    type: 'meta',
                    attrs: {
                      name: 'request-state',
                      content: String((state as { id: number }).id),
                    },
                  },
                ],
                styleTags: [
                  {
                    cssText: `.from-int-${String((state as { id: number }).id)}{color:rgb(4,5,6);}`,
                    attrs: { id: `style-state-${String((state as { id: number }).id)}` },
                  },
                ],
              }),
              finalize: (out, _ctx, state) => ({
                ...out,
                headTags: [
                  ...(out.headTags ?? []),
                  {
                    type: 'meta',
                    attrs: {
                      name: 'request-state-final',
                      content: String((state as { id: number }).id),
                    },
                  },
                ],
              }),
            },
          ],
        },
      }),
    ],
  });

  const first = new TextDecoder().decode(
    await collectBody((await app.handle({ method: 'GET', path: '/' })).body),
  );
  assert.ok(first.includes('class="wrapped-1"'));
  assert.match(
    first,
    /<meta[^>]*(?:name="request-state"[^>]*content="1"|content="1"[^>]*name="request-state")[^>]*>/,
  );
  assert.match(
    first,
    /<meta[^>]*(?:name="request-state-final"[^>]*content="1"|content="1"[^>]*name="request-state-final")[^>]*>/,
  );
  assert.ok(first.includes('id="style-state-1"'));

  const second = new TextDecoder().decode(
    await collectBody((await app.handle({ method: 'GET', path: '/' })).body),
  );
  assert.ok(second.includes('class="wrapped-2"'));
  assert.match(
    second,
    /<meta[^>]*(?:name="request-state"[^>]*content="2"|content="2"[^>]*name="request-state")[^>]*>/,
  );
  assert.match(
    second,
    /<meta[^>]*(?:name="request-state-final"[^>]*content="2"|content="2"[^>]*name="request-state-final")[^>]*>/,
  );
  assert.ok(second.includes('id="style-state-2"'));
});

test('react adapter: shell strategy drains late readiness failures without unhandled rejections', async () => {
  const lateFailure = new Error('late shell failure');
  const LazyFailure = React.lazy(async () => {
    await delay(20);
    throw lateFailure;
  });

  const app = createFaceApp({
    faces: [
      createReactStreamFace({
        route: '/',
        mode: 'ssr',
        render: () =>
          React.createElement(
            React.Suspense,
            { fallback: React.createElement('p', null, 'Loading shell') },
            React.createElement(LazyFailure),
          ),
        renderOptions: {
          styleStrategy: 'shell',
        },
      }),
    ],
  });

  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => {
    unhandled.push(reason);
  };
  process.on('unhandledRejection', onUnhandled);

  try {
    const response = await app.handle({ method: 'GET', path: '/' });
    const full = new TextDecoder().decode(await collectBody(response.body));

    assert.ok(full.startsWith('<!doctype html>'));

    await delay(50);
    assert.deepEqual(unhandled, []);
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
});

test('react adapter: streaming applies CSP nonce to all inline style/script tags', async () => {
  const nonce = 'nonce-r5-inline';
  const app = createFaceApp({
    faces: [
      createReactStreamFace({
        route: '/',
        mode: 'ssr',
        render: () => createLateStylesTree(20),
        renderOptions: {
          styleStrategy: 'shell',
          hydration: {
            data: { hello: 'world' },
            bootstrapModule: '/assets/entry-client.js',
          },
          integrations: [
            createAntdIntegration({ hashed: false }),
            createEmotionIntegration(),
          ],
        },
      }),
    ],
  });

  const response = await app.handle({
    method: 'GET',
    path: '/',
    cspNonce: nonce,
  });
  const full = new TextDecoder().decode(await collectBody(response.body));

  assertDocumentTagNonces(full, nonce, 1, 1);
});

test('FaceApp: streaming body error emits marker and closes document', async () => {
  const app = createFaceApp({
    faces: [
      {
        route: '/',
        mode: 'ssr',
        render: () => ({
          headTags: [{ type: 'title', text: 'Err' }],
          html: (async function* () {
            yield utf8('<main>ok</main>');
            throw new Error('boom');
          })(),
        }),
      },
    ],
  });

  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const resp = await app.handle({ method: 'GET', path: '/' });
    assert.ok(!(resp.body instanceof Uint8Array));

    const full = new TextDecoder().decode(await collectBody(resp.body));
    assert.ok(full.includes('<main>ok</main>'));
    assert.ok(full.includes('data-facetheory-stream-error="true"'));
    assert.ok(full.endsWith('</body></html>'));
  } finally {
    console.error = originalConsoleError;
  }
});
