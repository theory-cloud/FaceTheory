// Example-local real-storage seam.
//
// The ISR and strict-CSP examples default to the in-memory stores their unit
// tests use. The same example code selects real storage when the stack's own
// environment is present:
//
//   FACETHEORY_ISR_BUCKET        S3 bucket for rendered HTML and sidecars
//   FACETHEORY_ISR_PREFIX        optional S3 key prefix
//   FACETHEORY_CACHE_TABLE_NAME  TableTheory ISR metadata/lease table
//                                (`APPTHEORY_CACHE_TABLE_NAME` is the alias)
//
// This is not a deploy knob: a deployed AppTheorySsrSite sets these variables,
// and the local harness sets the same names against its emulators. Endpoints
// come from the standard AWS SDK endpoint variables, so the harness only points
// `AWS_ENDPOINT_URL_S3` and `AWS_ENDPOINT_URL_DYNAMODB` at loopback.
//
// The S3 store owns the bucket prefix, so metadata pointers stay relative
// (`htmlPointerPrefix: ''`) exactly as `infra/apptheory-ssg-isr-site` wires it.

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';

import {
  S3HtmlStore,
  type HtmlStore,
  type IsrMetaStore,
} from '@theory-cloud/facetheory';
import { createAwsSdkS3HtmlStoreClient } from '@theory-cloud/facetheory/aws-s3';
import { createTableTheoryIsrMetaStore } from '@theory-cloud/facetheory/tabletheory';

export interface ExampleIsrStores {
  htmlStore: HtmlStore;
  metaStore: IsrMetaStore;
  htmlPointerPrefix: string;
  bucket: string;
  tableName: string;
}

function readEnv(name: string): string {
  return String(process.env[name] ?? '').trim();
}

/**
 * Returns the real stores when the stack environment is configured, or `null`
 * so the example keeps its in-memory default. A partial configuration fails
 * closed instead of silently reverting to in-memory storage.
 */
export function createExampleIsrStores(): ExampleIsrStores | null {
  const bucket = readEnv('FACETHEORY_ISR_BUCKET');
  const tableName =
    readEnv('FACETHEORY_CACHE_TABLE_NAME') ||
    readEnv('APPTHEORY_CACHE_TABLE_NAME');
  if (!bucket && !tableName) return null;
  if (!bucket || !tableName) {
    throw new Error(
      'example real storage needs both FACETHEORY_ISR_BUCKET and FACETHEORY_CACHE_TABLE_NAME (or APPTHEORY_CACHE_TABLE_NAME)',
    );
  }

  const keyPrefix = readEnv('FACETHEORY_ISR_PREFIX');
  const s3 = new S3Client({});
  const ddb = new DynamoDBClient({});

  return {
    htmlStore: new S3HtmlStore({
      client: createAwsSdkS3HtmlStoreClient({ s3 }),
      bucket,
      ...(keyPrefix ? { keyPrefix } : {}),
    }),
    metaStore: createTableTheoryIsrMetaStore({
      config: { ddb, tableName },
    }),
    htmlPointerPrefix: '',
    bucket,
    tableName,
  };
}
