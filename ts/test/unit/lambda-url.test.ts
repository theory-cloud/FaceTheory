import assert from 'node:assert/strict';
import test from 'node:test';

import { createFaceApp } from '../../src/app.js';
import { streamFromString, utf8 } from '../../src/bytes.js';
import {
  createLambdaUrlStreamingHandler,
  faceResponseToLambdaUrlResult,
  handleLambdaUrlEvent,
  lambdaUrlEventToFaceRequest,
  writeFaceResponseToLambdaWriter,
  type AwsLambdaGlobalLike,
  type LambdaUrlEvent,
  type LambdaResponseWriter,
  type LambdaUrlResponseMetadata,
  type LambdaWritableStream,
} from '../../src/lambda-url.js';
import type {
  HtmlStore,
  HtmlStoreReadResult,
  HtmlStoreWriteInput,
  HtmlStoreWriteResult,
} from '../../src/isr.js';
import type { FaceResponse } from '../../src/types.js';

const SIDECAR_SIGNING_SECRET =
  'synthetic lambda sidecar signing secret with enough entropy';

class RecordingHtmlStore implements HtmlStore {
  readonly writes: HtmlStoreWriteInput[] = [];
  readonly objects = new Map<string, Uint8Array>();

  async read(key: string): Promise<HtmlStoreReadResult | null> {
    const body = this.objects.get(key);
    if (!body) return null;
    return { body: Uint8Array.from(body) };
  }

  async write(input: HtmlStoreWriteInput): Promise<HtmlStoreWriteResult> {
    this.writes.push({
      ...input,
      body: Uint8Array.from(input.body),
      ...(input.metadata ? { metadata: { ...input.metadata } } : {}),
    });
    this.objects.set(input.key, Uint8Array.from(input.body));
    return { etag: `lambda-test-etag-${String(this.writes.length)}` };
  }
}

function extractHydrationHref(html: string): string {
  const tag = /<link\b[^>]*rel="facetheory-hydration"[^>]*>/i.exec(html)?.[0];
  assert.ok(tag, 'expected FaceTheory hydration link');
  const href = /\bhref="([^"]+)"/i.exec(tag)?.[1];
  assert.ok(href, 'expected FaceTheory hydration href');
  return href;
}

test('lambdaUrlEventToFaceRequest: maps Lambda URL event shape deterministically', () => {
  const event: LambdaUrlEvent = {
    rawPath: '/products/list',
    rawQueryString: 'a=1&b=2&a=3',
    headers: {
      Host: 'example.com',
      'CloudFront-Viewer-Address': '198.51.100.1:443',
      'X-Forwarded-For': '10.0.0.1, 10.0.0.2',
      'X-CSV': 'one,two,three',
    },
    cookies: ['session=abc123', 'theme=light'],
    body: Buffer.from('hello world').toString('base64'),
    isBase64Encoded: true,
    requestContext: { http: { method: 'post' } },
  };

  const request = lambdaUrlEventToFaceRequest(event);
  const headers = request.headers ?? {};
  assert.equal(request.method, 'POST');
  assert.equal(request.path, '/products/list');
  assert.deepEqual(request.query, { a: ['1', '3'], b: ['2'] });
  assert.deepEqual(headers.Host, ['example.com']);
  assert.deepEqual(headers['CloudFront-Viewer-Address'], ['198.51.100.1:443']);
  assert.deepEqual(headers['X-Forwarded-For'], ['10.0.0.1, 10.0.0.2']);
  assert.deepEqual(headers['X-CSV'], ['one,two,three']);
  assert.deepEqual(headers.cookie, ['session=abc123', 'theme=light']);
  assert.deepEqual(request.cookies, {
    session: 'abc123',
    theme: 'light',
  });
  assert.equal(new TextDecoder().decode(request.body), 'hello world');
  assert.equal(request.isBase64, true);
  assert.match(request.cspNonce ?? '', /^[A-Za-z0-9+/]+={0,2}$/);
});

test('faceResponseToLambdaUrlResult: preserves set-cookie as separate values', async () => {
  const response: FaceResponse = {
    status: 201,
    headers: {
      'content-type': ['text/html; charset=utf-8'],
      vary: ['accept-encoding', 'origin'],
      'set-cookie': ['a=1; Path=/'],
    },
    cookies: ['b=2; Path=/; HttpOnly'],
    body: utf8('<h1>ok</h1>'),
    isBase64: false,
  };

  const result = await faceResponseToLambdaUrlResult(response);
  assert.deepEqual(result, {
    statusCode: 201,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      vary: 'accept-encoding, origin',
    },
    cookies: ['a=1; Path=/', 'b=2; Path=/; HttpOnly'],
    body: '<h1>ok</h1>',
    isBase64Encoded: false,
  });
});

test('faceResponseToLambdaUrlResult: does not duplicate cookies when set-cookie is mirrored', async () => {
  const response: FaceResponse = {
    status: 200,
    headers: {
      'content-type': ['text/plain; charset=utf-8'],
      'set-cookie': ['a=1; Path=/'],
    },
    cookies: ['a=1; Path=/'],
    body: utf8('ok'),
    isBase64: false,
  };

  const result = await faceResponseToLambdaUrlResult(response);
  assert.deepEqual(result.cookies, ['a=1; Path=/']);
});

test('faceResponseToLambdaUrlResult: base64-encodes binary payloads when requested', async () => {
  const body = new Uint8Array([0, 127, 128, 255]);
  const response: FaceResponse = {
    status: 200,
    headers: {
      'content-type': ['application/octet-stream'],
    },
    cookies: [],
    body,
    isBase64: true,
  };

  const result = await faceResponseToLambdaUrlResult(response);
  assert.equal(result.isBase64Encoded, true);
  assert.equal(result.body, Buffer.from(body).toString('base64'));
  assert.deepEqual(result.headers, {
    'content-type': 'application/octet-stream',
  });
});

test('writeFaceResponseToLambdaWriter: writes head once before first body bytes', async () => {
  const app = createFaceApp({
    faces: [
      {
        route: '/',
        mode: 'ssr',
        render: () => ({
          head: { title: 'Lambda Stream' },
          html: streamFromString('<main>streamed</main>'),
        }),
      },
    ],
  });

  const response = await app.handle({ method: 'GET', path: '/' });

  const events: string[] = [];
  const metadataWrites: LambdaUrlResponseMetadata[] = [];
  const chunks: Uint8Array[] = [];
  const writer: LambdaResponseWriter = {
    writeHead: (metadata) => {
      events.push('head');
      metadataWrites.push(metadata);
    },
    write: (chunk) => {
      events.push('chunk');
      chunks.push(chunk);
    },
    end: () => {
      events.push('end');
    },
  };

  await writeFaceResponseToLambdaWriter(response, writer);
  assert.equal(metadataWrites.length, 1);
  assert.equal(events[0], 'head');
  assert.equal(events.filter((entry) => entry === 'head').length, 1);
  assert.equal(events.at(-1), 'end');
  assert.ok(chunks.length > 0);

  const firstChunk = new TextDecoder().decode(chunks[0]);
  assert.ok(firstChunk.startsWith('<!doctype html>'));
  assert.ok(firstChunk.includes('</head><body>'));
});

test('handleLambdaUrlEvent: serves emitted SSR hydration sidecar URL as raw JSON without rerendering', async () => {
  const htmlStore = new RecordingHtmlStore();
  let loadCount = 0;
  let renderCount = 0;
  const hydrationPayload = {
    page: 'issue-250-lambda',
    requestScoped: {
      token: 'render-time-only',
      html: '<span>escaped</span>&safe',
    },
  };

  const app = createFaceApp({
    faces: [
      {
        route: '/lambda-sidecar',
        mode: 'ssr',
        load: async () => {
          loadCount += 1;
          return hydrationPayload;
        },
        render: (_ctx, data) => {
          renderCount += 1;
          return {
            csp: {
              inlineScripts: false,
              inlineStyles: true,
              rawHead: false,
            },
            hydration: {
              data,
              bootstrapModule: '/assets/lambda-sidecar.js',
            },
            html: '<main>lambda sidecar</main>',
          };
        },
      },
    ],
    ssrHydrationSidecars: {
      htmlStore,
      signingSecret: SIDECAR_SIGNING_SECRET,
      now: () => 20_000,
    },
  });

  const page = await handleLambdaUrlEvent(app, {
    rawPath: '/lambda-sidecar',
    requestContext: { http: { method: 'GET' }, requestId: 'req-page' },
  });
  assert.equal(page.statusCode, 200);
  assert.equal(page.headers?.['content-type'], 'text/html; charset=utf-8');
  assert.equal(loadCount, 1);
  assert.equal(renderCount, 1);
  assert.equal(htmlStore.writes.length, 1);

  const dataUrl = extractHydrationHref(page.body);
  assert.match(dataUrl, /^\/_facetheory\/ssr-data\//);
  assert.equal(page.body.includes('__FACETHEORY_DATA__'), false);

  const sidecar = await handleLambdaUrlEvent(app, {
    rawPath: dataUrl,
    requestContext: { http: { method: 'GET' }, requestId: 'req-sidecar' },
  });

  assert.equal(sidecar.statusCode, 200);
  assert.equal(
    sidecar.headers?.['content-type'],
    'application/json; charset=utf-8',
  );
  assert.equal(sidecar.headers?.['cache-control'], 'no-store');
  assert.equal(sidecar.isBase64Encoded, false);
  assert.deepEqual(JSON.parse(sidecar.body), hydrationPayload);
  assert.equal(sidecar.body.includes('<!doctype html>'), false);
  assert.equal(sidecar.body.includes('<html'), false);
  assert.equal(sidecar.body.includes('<body'), false);
  assert.equal(sidecar.body.includes('<main>lambda sidecar</main>'), false);
  assert.equal(loadCount, 1);
  assert.equal(renderCount, 1);
});

test('createLambdaUrlStreamingHandler: applies headers once before streaming bytes', async () => {
  const app = createFaceApp({
    faces: [
      {
        route: '/',
        mode: 'ssr',
        render: () => ({
          head: { title: 'Streaming Handler' },
          html: streamFromString('<main>hello</main>'),
        }),
      },
    ],
  });

  const events: string[] = [];
  const chunks: Uint8Array[] = [];
  let metadataWriteCount = 0;

  const rawStream: LambdaWritableStream = {
    write: (chunk) => {
      events.push('chunk');
      chunks.push(typeof chunk === 'string' ? utf8(chunk) : chunk);
    },
    end: () => {
      events.push('end');
    },
  };

  const awslambda: AwsLambdaGlobalLike = {
    streamifyResponse: (impl) => {
      return async (event, context) => {
        await impl(event, rawStream, context);
      };
    },
    HttpResponseStream: {
      from: (stream, metadata) => {
        void metadata;
        metadataWriteCount += 1;
        events.push('head');
        return stream;
      },
    },
  };

  const handler = createLambdaUrlStreamingHandler({ app, awslambda });
  await handler(
    {
      rawPath: '/',
      requestContext: { http: { method: 'GET' } },
    },
    {},
  );

  assert.equal(metadataWriteCount, 1);
  assert.equal(events[0], 'head');
  assert.equal(events.filter((entry) => entry === 'head').length, 1);
  assert.equal(events.at(-1), 'end');
  assert.ok(chunks.length > 0);

  const firstChunk = new TextDecoder().decode(chunks[0]);
  assert.ok(firstChunk.startsWith('<!doctype html>'));
  assert.ok(firstChunk.includes('</head><body>'));
});

test('createLambdaUrlStreamingHandler: writes strict CSP nonce metadata before streaming bytes', async () => {
  const app = createFaceApp({
    faces: [
      {
        route: '/',
        mode: 'ssr',
        render: () => ({
          csp: { inlineScripts: false, inlineStyles: false, rawHead: false },
          hydration: {
            type: 'external',
            data: { lambda: 'strict-stream' },
            dataUrl: '/_facetheory/hydration/lambda-strict-stream.json',
            bootstrapModule: '/assets/lambda-strict-stream.js',
          },
          html: streamFromString('<main>strict lambda stream</main>'),
        }),
      },
    ],
  });

  const events: string[] = [];
  const chunks: Uint8Array[] = [];
  let metadata: LambdaUrlResponseMetadata | null = null;

  const rawStream: LambdaWritableStream = {
    write: (chunk) => {
      events.push('chunk');
      chunks.push(typeof chunk === 'string' ? utf8(chunk) : chunk);
    },
    end: () => {
      events.push('end');
    },
  };

  const awslambda: AwsLambdaGlobalLike = {
    streamifyResponse: (impl) => {
      return async (event, context) => {
        await impl(event, rawStream, context);
      };
    },
    HttpResponseStream: {
      from: (stream, nextMetadata) => {
        metadata = nextMetadata;
        events.push('head');
        return stream;
      },
    },
  };

  const handler = createLambdaUrlStreamingHandler({ app, awslambda });
  await handler(
    {
      rawPath: '/',
      requestContext: { http: { method: 'GET' }, requestId: 'req-strict' },
    },
    {},
  );

  assert.equal(events[0], 'head');
  assert.ok(chunks.length > 0);
  const writtenMetadata = metadata as LambdaUrlResponseMetadata | null;
  assert.ok(writtenMetadata);
  const csp = writtenMetadata.headers?.['content-security-policy'] ?? '';
  const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
  assert.ok(nonce, csp);
  assert.equal(
    writtenMetadata.headers?.['content-type'],
    'text/html; charset=utf-8',
  );

  const firstChunk = new TextDecoder().decode(chunks[0]);
  assert.ok(firstChunk.startsWith('<!doctype html>'));
  assert.ok(firstChunk.includes(`nonce="${nonce}"`), firstChunk);
  assert.ok(firstChunk.includes('src="/assets/lambda-strict-stream.js"'));
});
