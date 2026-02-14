import assert from 'node:assert/strict';
import test from 'node:test';

import { createFaceApp } from '../../src/app.js';
import {
  type CommitIsrGenerationInput,
  defaultIsrCacheKey,
  InMemoryHtmlStore,
  InMemoryIsrMetaStore,
  type IsrMetaRecord,
  type IsrMetaStore,
  type ReleaseIsrLeaseInput,
  type TryAcquireIsrLeaseInput,
  type TryAcquireIsrLeaseResult,
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

class RecordingMetaStore implements IsrMetaStore {
  private readonly inner: IsrMetaStore;
  readonly commits: CommitIsrGenerationInput[] = [];

  constructor(inner: IsrMetaStore) {
    this.inner = inner;
  }

  async get(cacheKey: string): Promise<IsrMetaRecord | null> {
    return await this.inner.get(cacheKey);
  }

  async tryAcquireLease(input: TryAcquireIsrLeaseInput): Promise<TryAcquireIsrLeaseResult> {
    return await this.inner.tryAcquireLease(input);
  }

  async commitGeneration(input: CommitIsrGenerationInput): Promise<void> {
    this.commits.push({ ...input });
    return await this.inner.commitGeneration(input);
  }

  async releaseLease(input: ReleaseIsrLeaseInput): Promise<void> {
    return await this.inner.releaseLease(input);
  }
}

test('isr: metadata commits never include HTML body text', async () => {
  const marker = 'SUPER_SECRET_HTML_PAYLOAD';
  const htmlStore = new InMemoryHtmlStore();
  const recording = new RecordingMetaStore(new InMemoryIsrMetaStore());

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
      metaStore: recording,
    },
  });

  const response = await app.handle({ method: 'GET', path: '/' });
  assert.ok(decodeBody(response.body as Uint8Array).includes(marker));
  assert.ok(recording.commits.length > 0);

  for (const commit of recording.commits) {
    const payload = JSON.stringify(commit);
    assert.equal(payload.includes(marker), false);
    assert.equal(Object.prototype.hasOwnProperty.call(commit, 'html'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(commit, 'body'), false);
  }

  assert.ok(recording.commits.some((commit) => typeof commit.htmlPointer === 'string' && commit.htmlPointer.length > 0));
});
