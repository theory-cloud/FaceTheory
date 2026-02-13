import assert from 'node:assert/strict';
import test from 'node:test';

import { createFaceApp } from '../../src/app.js';
import {
  defaultIsrCacheKey,
  DynamoDbIsrMetaStore,
  InMemoryHtmlStore,
  InMemoryIsrMetaStore,
  type DynamoDbIsrMetaClient,
  type DynamoDbIsrMetaItem,
} from '../../src/isr.js';

function decodeBody(body: Uint8Array): string {
  return new TextDecoder().decode(body);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(input: Promise<T>, timeoutMs: number): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs);
    input.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

class FakeDynamoMetaClient implements DynamoDbIsrMetaClient {
  private readonly items = new Map<string, DynamoDbIsrMetaItem>();
  readonly writes: DynamoDbIsrMetaItem[] = [];

  async getItem(input: { tableName: string; cacheKey: string }): Promise<DynamoDbIsrMetaItem | null> {
    const item = this.items.get(input.cacheKey);
    return item ? { ...item } : null;
  }

  async putItemIfLeaseAvailable(input: {
    tableName: string;
    item: DynamoDbIsrMetaItem;
    nowMs: number;
  }): Promise<boolean> {
    const existing = this.items.get(input.item.cacheKey);
    const hasActiveLease =
      existing !== undefined &&
      existing.leaseOwner !== null &&
      existing.leaseToken !== null &&
      existing.leaseExpiresAt > input.nowMs &&
      existing.leaseOwner !== input.item.leaseOwner;

    if (hasActiveLease) return false;

    const next = { ...input.item };
    this.items.set(next.cacheKey, next);
    this.writes.push({ ...next });
    return true;
  }

  async updateItemIfLeaseMatches(input: {
    tableName: string;
    cacheKey: string;
    leaseOwner: string;
    leaseToken: string;
    item: DynamoDbIsrMetaItem;
  }): Promise<boolean> {
    const existing = this.items.get(input.cacheKey);
    if (!existing) return false;
    if (existing.leaseOwner !== input.leaseOwner || existing.leaseToken !== input.leaseToken) {
      return false;
    }

    const next = { ...input.item };
    this.items.set(input.cacheKey, next);
    this.writes.push({ ...next });
    return true;
  }

  async clearLeaseIfMatches(input: {
    tableName: string;
    cacheKey: string;
    leaseOwner: string;
    leaseToken: string;
  }): Promise<void> {
    const existing = this.items.get(input.cacheKey);
    if (!existing) return;
    if (existing.leaseOwner !== input.leaseOwner || existing.leaseToken !== input.leaseToken) {
      return;
    }

    this.items.set(input.cacheKey, {
      ...existing,
      leaseOwner: null,
      leaseToken: null,
      leaseExpiresAt: 0,
    });
  }
}

test('isr: stale burst triggers one regeneration and waiters share result', async () => {
  const htmlStore = new InMemoryHtmlStore();
  const metaStore = new InMemoryIsrMetaStore();

  let nowMs = 1_000;
  let renderCount = 0;

  const app = createFaceApp({
    faces: [
      {
        route: '/posts/{slug}',
        mode: 'isr',
        revalidateSeconds: 1,
        render: async () => {
          const seq = ++renderCount;
          await delay(25);
          return { html: `<main>render-${seq}</main>` };
        },
      },
    ],
    isr: {
      htmlStore,
      metaStore,
      now: () => nowMs,
      leaseDurationMs: 2_000,
      regenerationWaitTimeoutMs: 1_000,
      regenerationPollIntervalMs: 5,
    },
  });

  const warm = await app.handle({ method: 'GET', path: '/posts/a' });
  assert.ok(decodeBody(warm.body as Uint8Array).includes('render-1'));
  assert.equal(warm.headers['x-facetheory-isr']?.[0], 'miss');

  nowMs = 2_000;
  const responses = await Promise.all(
    Array.from({ length: 8 }, () => app.handle({ method: 'GET', path: '/posts/a' })),
  );

  assert.equal(renderCount, 2);
  for (const response of responses) {
    const html = decodeBody(response.body as Uint8Array);
    assert.ok(html.includes('render-2'));
    assert.ok(['miss', 'wait-hit'].includes(response.headers['x-facetheory-isr']?.[0] ?? ''));
  }
});

test('isr: regeneration failure serves stale and keeps pointer intact', async () => {
  const htmlStore = new InMemoryHtmlStore();
  const metaStore = new InMemoryIsrMetaStore();

  let nowMs = 10_000;
  let renderCount = 0;
  let failNextRegeneration = false;

  const app = createFaceApp({
    faces: [
      {
        route: '/faces/{id}',
        mode: 'isr',
        revalidateSeconds: 1,
        render: async () => {
          const seq = ++renderCount;
          if (failNextRegeneration) {
            throw new Error(`boom-${seq}`);
          }
          return { html: `<main>v${seq}</main>` };
        },
      },
    ],
    isr: {
      htmlStore,
      metaStore,
      now: () => nowMs,
    },
  });

  const warm = await app.handle({ method: 'GET', path: '/faces/42' });
  assert.ok(decodeBody(warm.body as Uint8Array).includes('v1'));

  const cacheKey = defaultIsrCacheKey({
    tenant: 'default',
    routePattern: '/faces/{id}',
    params: { id: '42' },
  });
  const beforeFailure = await metaStore.get(cacheKey);
  assert.ok(beforeFailure?.htmlPointer);

  nowMs = 11_000;
  failNextRegeneration = true;
  const staleAfterFailure = await app.handle({ method: 'GET', path: '/faces/42' });
  assert.ok(decodeBody(staleAfterFailure.body as Uint8Array).includes('v1'));

  const afterFailure = await metaStore.get(cacheKey);
  assert.equal(afterFailure?.htmlPointer, beforeFailure?.htmlPointer);

  failNextRegeneration = false;
  nowMs = 11_001;
  const recovered = await app.handle({ method: 'GET', path: '/faces/42' });
  assert.ok(decodeBody(recovered.body as Uint8Array).includes('v3'));
  assert.equal(renderCount, 3);

  const afterRecovery = await metaStore.get(cacheKey);
  assert.notEqual(afterRecovery?.htmlPointer, beforeFailure?.htmlPointer);
});

test('isr: expired lease does not deadlock regeneration', async () => {
  const htmlStore = new InMemoryHtmlStore();
  const metaStore = new InMemoryIsrMetaStore();

  const startedAt = Date.now();
  let offsetMs = 0;
  let renderCount = 0;

  const app = createFaceApp({
    faces: [
      {
        route: '/lock',
        mode: 'isr',
        revalidateSeconds: 30,
        render: async () => {
          const seq = ++renderCount;
          if (seq === 2) {
            await delay(80);
            return { html: '<main>slow-regen</main>' };
          }
          if (seq === 3) {
            return { html: '<main>fast-regen</main>' };
          }
          return { html: '<main>warm</main>' };
        },
      },
    ],
    isr: {
      htmlStore,
      metaStore,
      now: () => Date.now() - startedAt + offsetMs,
      leaseDurationMs: 20,
      regenerationWaitTimeoutMs: 40,
      regenerationPollIntervalMs: 5,
      failurePolicy: 'serve-stale',
    },
  });

  await app.handle({ method: 'GET', path: '/lock' });
  offsetMs = 31_000;

  const first = withTimeout(app.handle({ method: 'GET', path: '/lock' }), 2_000);
  const second = withTimeout(app.handle({ method: 'GET', path: '/lock' }), 2_000);
  const [left, right] = await Promise.all([first, second]);

  const leftHtml = decodeBody(left.body as Uint8Array);
  const rightHtml = decodeBody(right.body as Uint8Array);
  assert.ok(leftHtml.includes('fast-regen') || rightHtml.includes('fast-regen'));

  const followup = await app.handle({ method: 'GET', path: '/lock' });
  assert.ok(decodeBody(followup.body as Uint8Array).includes('fast-regen'));
  assert.equal(renderCount, 3);
});

test('isr: tenant partitioning keeps cache entries isolated', async () => {
  const htmlStore = new InMemoryHtmlStore();
  const metaStore = new InMemoryIsrMetaStore();
  let renderCount = 0;

  const app = createFaceApp({
    faces: [
      {
        route: '/tenant/{slug}',
        mode: 'isr',
        revalidateSeconds: 60,
        render: async () => {
          const seq = ++renderCount;
          return { html: `<main>tenant-${seq}</main>` };
        },
      },
    ],
    isr: {
      htmlStore,
      metaStore,
    },
  });

  const tenantAFirst = await app.handle({
    method: 'GET',
    path: '/tenant/home',
    headers: { 'x-facetheory-tenant': ['tenant-a'] },
  });
  const tenantBFirst = await app.handle({
    method: 'GET',
    path: '/tenant/home',
    headers: { 'x-facetheory-tenant': ['tenant-b'] },
  });
  const tenantASecond = await app.handle({
    method: 'GET',
    path: '/tenant/home',
    headers: { 'x-facetheory-tenant': ['tenant-a'] },
  });

  assert.ok(decodeBody(tenantAFirst.body as Uint8Array).includes('tenant-1'));
  assert.ok(decodeBody(tenantBFirst.body as Uint8Array).includes('tenant-2'));
  assert.ok(decodeBody(tenantASecond.body as Uint8Array).includes('tenant-1'));
  assert.equal(renderCount, 2);

  const cacheKeys = metaStore.debugSnapshot().map((record) => record.cacheKey);
  assert.equal(cacheKeys.length, 2);
});

test('isr: dynamodb metadata writes never include HTML body text', async () => {
  const marker = 'SUPER_SECRET_HTML_PAYLOAD';
  const htmlStore = new InMemoryHtmlStore();
  const client = new FakeDynamoMetaClient();
  const metaStore = new DynamoDbIsrMetaStore({
    client,
    tableName: 'facetheory-isr',
  });

  const app = createFaceApp({
    faces: [
      {
        route: '/',
        mode: 'isr',
        revalidateSeconds: 60,
        render: () => ({
          html: `<main>${marker}</main>`,
        }),
      },
    ],
    isr: {
      htmlStore,
      metaStore,
    },
  });

  const response = await app.handle({ method: 'GET', path: '/' });
  assert.ok(decodeBody(response.body as Uint8Array).includes(marker));
  assert.ok(client.writes.length > 0);

  for (const item of client.writes) {
    const payload = JSON.stringify(item);
    assert.equal(payload.includes(marker), false);
    assert.equal(Object.prototype.hasOwnProperty.call(item, 'html'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(item, 'body'), false);
  }

  assert.ok(client.writes.some((item) => typeof item.htmlPointer === 'string' && item.htmlPointer.length > 0));
});
