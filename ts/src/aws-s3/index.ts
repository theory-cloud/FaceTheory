import { GetObjectCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';

import type { S3HtmlStoreClient } from '../isr.js';

function isAsyncIterable(value: unknown): value is AsyncIterable<Uint8Array> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Symbol.asyncIterator in (value as Record<string | symbol, unknown>) &&
    typeof (value as Record<string | symbol, unknown>)[Symbol.asyncIterator] === 'function'
  );
}

function isUint8Array(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array;
}

function hasTransformToByteArray(
  value: unknown,
): value is { transformToByteArray: () => Promise<Uint8Array> } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { transformToByteArray?: unknown }).transformToByteArray === 'function'
  );
}

function hasArrayBuffer(value: unknown): value is { arrayBuffer: () => Promise<ArrayBuffer> } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { arrayBuffer?: unknown }).arrayBuffer === 'function'
  );
}

async function normalizeGetObjectBody(
  body: unknown,
): Promise<Uint8Array | string | AsyncIterable<Uint8Array> | null> {
  if (body === null || body === undefined) return null;
  if (isUint8Array(body)) return body;
  if (typeof body === 'string') return body;
  if (isAsyncIterable(body)) return body;
  if (hasTransformToByteArray(body)) return await body.transformToByteArray();
  if (hasArrayBuffer(body)) return new Uint8Array(await body.arrayBuffer());
  throw new TypeError('S3 getObject body type is not supported by FaceTheory S3HtmlStoreClient');
}

function isNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const anyErr = err as {
    name?: unknown;
    Code?: unknown;
    code?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  const status = anyErr.$metadata?.httpStatusCode;
  const name = anyErr.name ?? anyErr.Code ?? anyErr.code;
  return status === 404 || name === 'NoSuchKey' || name === 'NotFound';
}

export interface AwsSdkS3HtmlStoreClientOptions {
  s3: S3Client;
}

export function createAwsSdkS3HtmlStoreClient(
  options: AwsSdkS3HtmlStoreClientOptions,
): S3HtmlStoreClient {
  return {
    getObject: async (input) => {
      try {
        const out = await options.s3.send(
          new GetObjectCommand({
            Bucket: input.bucket,
            Key: input.key,
          }),
        );

        const body = await normalizeGetObjectBody(out.Body);
        if (body === null) return null;

        return {
          body,
          ...(out.ETag !== undefined ? { etag: out.ETag ?? null } : {}),
        };
      } catch (err) {
        if (isNotFoundError(err)) return null;
        throw err;
      }
    },
    putObject: async (input) => {
      const out = await options.s3.send(
        new PutObjectCommand({
          Bucket: input.bucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType,
          ...(input.cacheControl !== undefined ? { CacheControl: input.cacheControl } : {}),
          ...(input.metadata ? { Metadata: { ...input.metadata } } : {}),
        }),
      );

      return {
        ...(out.ETag !== undefined ? { etag: out.ETag ?? null } : {}),
      };
    },
  };
}

