import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildLambdaFunctionURLRequest,
  createTestEnv,
} from '@theory-cloud/apptheory';

import { handler as isrBlockingHandler } from '../../examples/isr-blocking/handler.js';

type AppTheoryStreamingExampleModule = typeof import('../../examples/apptheory-lambda-url-streaming/handler.js');

type LambdaFunctionUrlStreamingHandler = (
  event: ReturnType<typeof buildLambdaFunctionURLRequest>,
  ctx?: unknown,
) => Promise<unknown>;

type StreamifyResponse = (
  handler: (
    event: ReturnType<typeof buildLambdaFunctionURLRequest>,
    responseStream: CapturedResponseStream,
    ctx?: unknown,
  ) => Promise<unknown> | unknown,
) => LambdaFunctionUrlStreamingHandler;

interface AwsLambdaShim {
  streamifyResponse: StreamifyResponse;
}

class CapturedResponseStream {
  statusCode = 0;
  headers: Record<string, string> = {};
  cookies: string[] = [];
  chunks: Uint8Array[] = [];
  ended = false;

  init(meta: {
    statusCode?: number;
    headers?: Record<string, string>;
    cookies?: string[];
  }): void {
    this.statusCode = Number(meta.statusCode ?? 0);
    this.headers = { ...(meta.headers ?? {}) };
    this.cookies = [...(meta.cookies ?? [])];
  }

  write(chunk: Uint8Array): true {
    this.chunks.push(Uint8Array.from(chunk));
    return true;
  }

  end(chunk?: Uint8Array): void {
    if (chunk !== undefined) this.write(chunk);
    this.ended = true;
  }

  body(): Uint8Array {
    const total = this.chunks.reduce((size, chunk) => size + chunk.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }
}

async function importAppTheoryStreamingExample(
  captured: { stream: CapturedResponseStream | null },
): Promise<AppTheoryStreamingExampleModule> {
  const globalWithLambda = globalThis as typeof globalThis & {
    awslambda?: AwsLambdaShim;
  };
  const previous = globalWithLambda.awslambda;

  globalWithLambda.awslambda = {
    streamifyResponse: (streamingHandler) => async (event, ctx) => {
      const stream = new CapturedResponseStream();
      captured.stream = stream;
      return streamingHandler(event, stream, ctx);
    },
  };

  try {
    return (await import(
      '../../examples/apptheory-lambda-url-streaming/handler.js'
    )) as AppTheoryStreamingExampleModule;
  } finally {
    if (previous === undefined) {
      delete globalWithLambda.awslambda;
    } else {
      globalWithLambda.awslambda = previous;
    }
  }
}

test('examples integrity: blocking ISR handler executes and serves cache hits', async () => {
  const event = {
    rawPath: '/news/m14-smoke',
    requestContext: {
      http: { method: 'GET', path: '/news/m14-smoke' },
      requestId: 'm14-isr-smoke-1',
    },
  };

  const miss = await isrBlockingHandler(event);
  const hit = await isrBlockingHandler({
    ...event,
    requestContext: {
      ...event.requestContext,
      requestId: 'm14-isr-smoke-2',
    },
  });

  assert.equal(miss.statusCode, 200);
  assert.equal(hit.statusCode, 200);
  assert.equal(miss.headers?.['x-facetheory-isr'], 'miss');
  assert.equal(hit.headers?.['x-facetheory-isr'], 'hit');
  assert.ok(miss.body.includes('<h1>m14-smoke</h1>'));
  assert.ok(miss.body.includes('revision 1'));
  assert.equal(hit.body, miss.body);
});

test('examples integrity: AppTheory Lambda URL streaming example handler executes', async () => {
  const event = buildLambdaFunctionURLRequest('GET', '/', {
    headers: { 'x-request-id': 'm14-apptheory-handler' },
  });
  const captured = { stream: null as CapturedResponseStream | null };
  const { appTheoryApp, handler } = await importAppTheoryStreamingExample(
    captured,
  );

  const streamErrorCode = await handler(event);
  const handlerStream = captured.stream;

  assert.equal(streamErrorCode, '');
  assert.ok(handlerStream);
  assert.equal(handlerStream.statusCode, 200);
  assert.equal(handlerStream.headers['content-type'], 'text/html; charset=utf-8');
  assert.equal(handlerStream.ended, true);
  assert.ok(handlerStream.chunks.length >= 2);

  const handlerFirstChunk = new TextDecoder().decode(handlerStream.chunks[0]);
  assert.ok(handlerFirstChunk.startsWith('<!doctype html>'));
  assert.ok(
    handlerFirstChunk.includes('<title>FaceTheory (AppTheory)</title>'),
  );
  assert.ok(!handlerFirstChunk.includes('<h1>hello (streaming)</h1>'));

  const handlerHtml = new TextDecoder().decode(handlerStream.body());
  assert.ok(handlerHtml.includes('<h1>hello (streaming)</h1>'));
  assert.ok(handlerHtml.endsWith('</body></html>'));

  const env = createTestEnv();
  const streamed = await env.invokeLambdaFunctionURLStreaming(
    appTheoryApp,
    event,
  );

  assert.equal(streamed.stream_error_code, '');
  assert.equal(streamed.status, 200);
  assert.equal(streamed.headers['content-type']?.[0], 'text/html; charset=utf-8');
  assert.ok(streamed.chunks.length >= 2);

  const fullHtml = new TextDecoder().decode(streamed.body);
  assert.ok(fullHtml.includes('<h1>hello (streaming)</h1>'));
  assert.ok(fullHtml.endsWith('</body></html>'));
});
