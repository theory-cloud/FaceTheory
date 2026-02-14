import assert from 'node:assert/strict';
import test from 'node:test';

import { TableTheoryIsrMetaStoreAdapter } from '../../src/tabletheory/index.js';

test('tabletheory adapter: get returns null when missing', async () => {
  const adapter = new TableTheoryIsrMetaStoreAdapter({
    get: async () => null,
    tryAcquireLease: async () => null,
    commitGeneration: async () => {},
    releaseLease: async () => {},
  } as any);

  const out = await adapter.get('k');
  assert.equal(out, null);
});

test('tabletheory adapter: get maps metadata into IsrMetaRecord with defaults', async () => {
  const adapter = new TableTheoryIsrMetaStoreAdapter({
    get: async () => ({
      htmlPointer: 's3/key.html',
      generatedAtMs: 123,
      revalidateSeconds: 9,
      etag: '"e"',
    }),
    tryAcquireLease: async () => null,
    commitGeneration: async () => {},
    releaseLease: async () => {},
  } as any);

  const out = await adapter.get('cache');
  assert.ok(out);
  assert.equal(out.cacheKey, 'cache');
  assert.equal(out.htmlPointer, 's3/key.html');
  assert.equal(out.generatedAt, 123);
  assert.equal(out.revalidateSeconds, 9);
  assert.equal(out.status, 200);
  assert.equal(out.contentType, 'text/html; charset=utf-8');
  assert.equal(out.etag, '"e"');
  assert.equal(out.leaseOwner, null);
  assert.equal(out.leaseToken, null);
  assert.equal(out.leaseExpiresAt, 0);
});

test('tabletheory adapter: tryAcquireLease returns acquired:false with fallback record when missing', async () => {
  const adapter = new TableTheoryIsrMetaStoreAdapter({
    get: async () => null,
    tryAcquireLease: async () => null,
    commitGeneration: async () => {},
    releaseLease: async () => {},
  } as any);

  const out = await adapter.tryAcquireLease({
    cacheKey: 'k',
    leaseOwner: 'owner',
    nowMs: 100,
    leaseDurationMs: 1000,
    fallbackRevalidateSeconds: 7,
  });

  assert.equal(out.acquired, false);
  assert.equal(out.leaseToken, null);
  assert.equal(out.record.cacheKey, 'k');
  assert.equal(out.record.htmlPointer, null);
  assert.equal(out.record.revalidateSeconds, 7);
});

test('tabletheory adapter: tryAcquireLease returns acquired:true with lease fields', async () => {
  const adapter = new TableTheoryIsrMetaStoreAdapter({
    get: async () => ({
      htmlPointer: 's3/key.html',
      generatedAtMs: 50,
      revalidateSeconds: 10,
    }),
    tryAcquireLease: async () => ({
      leaseToken: 'tok',
      leaseExpiresAtMs: 999,
    }),
    commitGeneration: async () => {},
    releaseLease: async () => {},
  } as any);

  const out = await adapter.tryAcquireLease({
    cacheKey: 'k',
    leaseOwner: 'owner',
    nowMs: 100,
    leaseDurationMs: 1000,
    fallbackRevalidateSeconds: 7,
  });

  assert.equal(out.acquired, true);
  assert.equal(out.leaseToken, 'tok');
  assert.equal(out.record.leaseOwner, 'owner');
  assert.equal(out.record.leaseToken, 'tok');
  assert.equal(out.record.leaseExpiresAt, 999);
  assert.equal(out.record.htmlPointer, 's3/key.html');
});

test('tabletheory adapter: commitGeneration rejects revalidateSeconds <= 0', async () => {
  const adapter = new TableTheoryIsrMetaStoreAdapter({
    get: async () => null,
    tryAcquireLease: async () => null,
    commitGeneration: async () => {},
    releaseLease: async () => {},
  } as any);

  await assert.rejects(
    () =>
      adapter.commitGeneration({
        cacheKey: 'k',
        leaseOwner: 'owner',
        leaseToken: 'tok',
        htmlPointer: 'p',
        generatedAt: 1,
        revalidateSeconds: 0,
        status: 200,
        contentType: 'text/html; charset=utf-8',
      }),
    /requires revalidateSeconds > 0/i,
  );
});

test('tabletheory adapter: commitGeneration maps args to TableTheory store', async () => {
  let seen: any = null;

  const adapter = new TableTheoryIsrMetaStoreAdapter({
    get: async () => null,
    tryAcquireLease: async () => null,
    commitGeneration: async (args: any) => {
      seen = args;
    },
    releaseLease: async () => {},
  } as any);

  await adapter.commitGeneration({
    cacheKey: 'k',
    leaseOwner: 'owner',
    leaseToken: 'tok',
    htmlPointer: 'ptr',
    generatedAt: 1234,
    revalidateSeconds: 5,
    status: 200,
    contentType: 'text/html; charset=utf-8',
    etag: '"e"',
  });

  assert.ok(seen);
  assert.equal(seen.cacheKey, 'k');
  assert.equal(seen.leaseOwner, 'owner');
  assert.equal(seen.leaseToken, 'tok');
  assert.equal(seen.htmlPointer, 'ptr');
  assert.equal(seen.generatedAtMs, 1234);
  assert.equal(seen.revalidateSeconds, 5);
  assert.equal(seen.etag, '"e"');
});

