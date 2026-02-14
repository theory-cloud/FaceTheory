import assert from 'node:assert/strict';
import test from 'node:test';

import {
  type S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';

import { createAwsSdkS3HtmlStoreClient } from '../../src/aws-s3/index.js';

async function collectBody(
  body: Uint8Array | string | AsyncIterable<Uint8Array>,
): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body;
  if (typeof body === 'string') return new TextEncoder().encode(body);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of body) {
    chunks.push(chunk);
    total += chunk.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

test('aws-s3: getObject returns null on not-found errors', async () => {
  const s3 = {
    send: async () => {
      const err = new Error('NoSuchKey');
      (err as any).name = 'NoSuchKey';
      (err as any).$metadata = { httpStatusCode: 404 };
      throw err;
    },
  } as unknown as S3Client;

  const client = createAwsSdkS3HtmlStoreClient({ s3 });
  const out = await client.getObject({ bucket: 'b', key: 'k' });
  assert.equal(out, null);
});

test('aws-s3: getObject forwards body and etag', async () => {
  const s3 = {
    send: async (cmd: unknown) => {
      assert.ok(cmd instanceof GetObjectCommand);
      const input = (cmd as GetObjectCommand).input;
      assert.equal(input.Bucket, 'b');
      assert.equal(input.Key, 'k');

      return {
        Body: (async function* () {
          yield new TextEncoder().encode('hello');
        })(),
        ETag: '"etag"',
      };
    },
  } as unknown as S3Client;

  const client = createAwsSdkS3HtmlStoreClient({ s3 });
  const out = await client.getObject({ bucket: 'b', key: 'k' });
  assert.ok(out !== null);
  assert.equal(out.etag, '"etag"');
  const body = await collectBody(out.body ?? new Uint8Array());
  assert.equal(new TextDecoder().decode(body), 'hello');
});

test('aws-s3: putObject maps bucket/key/body/contentType/cacheControl/metadata', async () => {
  let seen: any = null;

  const s3 = {
    send: async (cmd: unknown) => {
      assert.ok(cmd instanceof PutObjectCommand);
      seen = (cmd as PutObjectCommand).input;
      return { ETag: '"put-etag"' };
    },
  } as unknown as S3Client;

  const client = createAwsSdkS3HtmlStoreClient({ s3 });
  const body = new TextEncoder().encode('<html/>');
  const out = await client.putObject({
    bucket: 'bucket',
    key: 'key',
    body,
    contentType: 'text/html; charset=utf-8',
    cacheControl: 'public,max-age=0',
    metadata: { a: '1' },
  });

  assert.equal(out.etag, '"put-etag"');
  assert.ok(seen);
  assert.equal(seen.Bucket, 'bucket');
  assert.equal(seen.Key, 'key');
  assert.deepEqual(seen.Body, body);
  assert.equal(seen.ContentType, 'text/html; charset=utf-8');
  assert.equal(seen.CacheControl, 'public,max-age=0');
  assert.deepEqual(seen.Metadata, { a: '1' });
});

