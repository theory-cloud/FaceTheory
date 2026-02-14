import assert from 'node:assert/strict';
import test from 'node:test';

import { createFaceApp } from '../../src/app.js';
import { streamFromString, utf8 } from '../../src/bytes.js';
import {
  createLambdaUrlStreamingHandler,
  faceResponseToLambdaUrlResult,
  lambdaUrlEventToFaceRequest,
  writeFaceResponseToLambdaWriter,
  type AwsLambdaGlobalLike,
  type LambdaUrlEvent,
  type LambdaResponseWriter,
  type LambdaUrlResponseMetadata,
  type LambdaWritableStream,
} from '../../src/lambda-url.js';
import type { FaceResponse } from '../../src/types.js';

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
