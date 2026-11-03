import assert from 'node:assert/strict';
import test from 'node:test';

import { S3HtmlStore } from '@theory-cloud/facetheory';

import { createExampleIsrStores } from '../../examples/local-storage.js';

const STACK_ENV = [
  'FACETHEORY_ISR_BUCKET',
  'FACETHEORY_ISR_PREFIX',
  'FACETHEORY_CACHE_TABLE_NAME',
  'APPTHEORY_CACHE_TABLE_NAME',
] as const;

function withStackEnv(
  values: Partial<Record<(typeof STACK_ENV)[number], string>>,
  run: () => void,
): void {
  const saved = new Map<string, string | undefined>();
  for (const name of STACK_ENV) {
    saved.set(name, process.env[name]);
    delete process.env[name];
  }
  for (const [name, value] of Object.entries(values)) {
    process.env[name] = value;
  }
  try {
    run();
  } finally {
    for (const name of STACK_ENV) {
      const value = saved.get(name);
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test('example local storage: no stack environment keeps the in-memory default', () => {
  withStackEnv({}, () => {
    assert.equal(createExampleIsrStores(), null);
  });
});

test('example local storage: stack environment selects S3HtmlStore and the TableTheory ISR store', () => {
  withStackEnv(
    {
      FACETHEORY_ISR_BUCKET: 'ft3-example-bucket',
      FACETHEORY_ISR_PREFIX: 'isr',
      APPTHEORY_CACHE_TABLE_NAME: 'ft3-example-cache',
    },
    () => {
      const stores = createExampleIsrStores();
      assert.ok(stores);
      assert.ok(stores.htmlStore instanceof S3HtmlStore);
      assert.equal(stores.htmlPointerPrefix, '');
      assert.equal(stores.bucket, 'ft3-example-bucket');
      assert.equal(stores.tableName, 'ft3-example-cache');
      assert.equal(typeof stores.metaStore.get, 'function');
      assert.equal(typeof stores.metaStore.tryAcquireLease, 'function');
      assert.equal(typeof stores.metaStore.invalidate, 'function');
    },
  );
});

test('example local storage: the FaceTheory cache table name wins over the AppTheory alias', () => {
  withStackEnv(
    {
      FACETHEORY_ISR_BUCKET: 'ft3-example-bucket',
      FACETHEORY_CACHE_TABLE_NAME: 'ft3-facetheory-cache',
      APPTHEORY_CACHE_TABLE_NAME: 'ft3-apptheory-cache',
    },
    () => {
      assert.equal(createExampleIsrStores()?.tableName, 'ft3-facetheory-cache');
    },
  );
});

test('example local storage: a partial stack environment fails closed', () => {
  withStackEnv({ FACETHEORY_ISR_BUCKET: 'ft3-example-bucket' }, () => {
    assert.throws(
      () => createExampleIsrStores(),
      /needs both FACETHEORY_ISR_BUCKET and FACETHEORY_CACHE_TABLE_NAME/,
    );
  });
});
