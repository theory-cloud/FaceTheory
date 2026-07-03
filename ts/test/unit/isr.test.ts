import assert from 'node:assert/strict';
import test from 'node:test';

import { createFaceApp } from '../../src/app.js';
import {
  type CommitIsrGenerationInput,
  createIsrRuntime,
  defaultIsrCacheKey,
  type FaceIsrOptions,
  type HtmlStoreWriteInput,
  type HtmlStoreWriteResult,
  InMemoryHtmlStore,
  InMemoryIsrMetaStore,
  type IsrMetaRecord,
  type IsrMetaStore,
  type ReleaseIsrLeaseInput,
  tenantKeyFromTrustedHeader,
  type TryAcquireIsrLeaseInput,
  type TryAcquireIsrLeaseResult,
} from '../../src/isr.js';

function decodeBody(body: Uint8Array): string {
  return new TextDecoder().decode(body);
}

function encodeBody(body: string): Uint8Array {
  return new TextEncoder().encode(body);
}

function externalHydrationHref(html: string): string {
  const tag = /<link\b[^>]*__FACETHEORY_DATA_URL__[^>]*>/i.exec(html)?.[0];
  assert.ok(tag, 'expected external hydration link tag');
  const href = /\bhref="([^"]+)"/i.exec(tag)?.[1];
  assert.ok(href, 'expected external hydration href');
  return href.replace(/&amp;/g, '&');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(
  input: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
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
  const metrics: Array<Record<string, unknown>> = [];

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
    observability: {
      metric: (record) =>
        metrics.push(record as unknown as Record<string, unknown>),
    },
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
    Array.from({ length: 8 }, () =>
      app.handle({ method: 'GET', path: '/posts/a' }),
    ),
  );

  assert.equal(renderCount, 2);
  for (const response of responses) {
    const html = decodeBody(response.body as Uint8Array);
    assert.ok(html.includes('render-2'));
    assert.ok(
      ['miss', 'wait-hit'].includes(
        response.headers['x-facetheory-isr']?.[0] ?? '',
      ),
    );
  }

  const leaseContentionMetrics = metrics.filter(
    (metric) => metric.name === 'facetheory.isr.lease_contention',
  );
  assert.ok(leaseContentionMetrics.length >= 1);
  assert.ok(
    leaseContentionMetrics.every(
      (metric) =>
        (metric.tags as Record<string, string>).route_pattern ===
        '/posts/{slug}',
    ),
  );
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
    query: {},
    headers: {},
    cookies: {},
  });
  const beforeFailure = await metaStore.get(cacheKey);
  assert.ok(beforeFailure?.htmlPointer);

  nowMs = 11_000;
  failNextRegeneration = true;
  const staleAfterFailure = await app.handle({
    method: 'GET',
    path: '/faces/42',
  });
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

  const first = withTimeout(
    app.handle({ method: 'GET', path: '/lock' }),
    2_000,
  );
  const second = withTimeout(
    app.handle({ method: 'GET', path: '/lock' }),
    2_000,
  );
  const [left, right] = await Promise.all([first, second]);

  const leftHtml = decodeBody(left.body as Uint8Array);
  const rightHtml = decodeBody(right.body as Uint8Array);
  assert.ok(
    leftHtml.includes('fast-regen') || rightHtml.includes('fast-regen'),
  );

  const followup = await app.handle({ method: 'GET', path: '/lock' });
  assert.ok(decodeBody(followup.body as Uint8Array).includes('fast-regen'));
  assert.equal(renderCount, 3);
});

test('isr: default cache key partitions by query strings', async () => {
  const htmlStore = new InMemoryHtmlStore();
  const metaStore = new InMemoryIsrMetaStore();
  let renderCount = 0;

  const app = createFaceApp({
    faces: [
      {
        route: '/search',
        mode: 'isr',
        revalidateSeconds: 60,
        render: async () => {
          const seq = ++renderCount;
          return { html: `<main>search-${seq}</main>` };
        },
      },
    ],
    isr: {
      htmlStore,
      metaStore,
    },
  });

  const first = await app.handle({
    method: 'GET',
    path: '/search?view=table&sort=asc',
  });
  const sameQueryDifferentOrder = await app.handle({
    method: 'GET',
    path: '/search?sort=asc&view=table',
  });
  const differentQuery = await app.handle({
    method: 'GET',
    path: '/search?view=grid&sort=asc',
  });

  assert.ok(decodeBody(first.body as Uint8Array).includes('search-1'));
  assert.ok(
    decodeBody(sameQueryDifferentOrder.body as Uint8Array).includes('search-1'),
  );
  assert.ok(decodeBody(differentQuery.body as Uint8Array).includes('search-2'));
  assert.equal(renderCount, 2);

  const cacheKeys = metaStore.debugSnapshot().map((record) => record.cacheKey);
  assert.equal(cacheKeys.length, 2);
});

test('isr: default tenant partition fails closed on tenant boundary headers', async () => {
  const htmlStore = new InMemoryHtmlStore();
  const metaStore = new InMemoryIsrMetaStore();
  let renderCount = 0;

  const app = createFaceApp({
    faces: [
      {
        route: '/tenant/{slug}',
        mode: 'isr',
        revalidateSeconds: 60,
        render: async (ctx) => {
          const seq = ++renderCount;
          const tenant = ctx.request.headers['x-tenant-id']?.[0] ?? 'missing';
          return { html: `<main>${tenant}-${seq}</main>` };
        },
      },
    ],
    isr: {
      htmlStore,
      metaStore,
    },
  });

  const tenantAHeader = await app.handle({
    method: 'GET',
    path: '/tenant/home',
    headers: {
      'x-tenant-id': ['TENANT_SECRET_A'],
      'x-facetheory-tenant': ['spoofed-tenant'],
    },
  });
  const tenantBHeader = await app.handle({
    method: 'GET',
    path: '/tenant/home',
    headers: {
      'x-tenant-id': ['TENANT_SECRET_B'],
      'x-facetheory-tenant': ['TENANT_SECRET_A'],
    },
  });

  assert.equal(tenantAHeader.status, 500);
  assert.equal(tenantBHeader.status, 500);
  const tenantAHtml = decodeBody(tenantAHeader.body as Uint8Array);
  const tenantBHtml = decodeBody(tenantBHeader.body as Uint8Array);
  assert.equal(tenantAHtml.includes('TENANT_SECRET_A'), false);
  assert.equal(tenantBHtml.includes('TENANT_SECRET_B'), false);
  assert.equal(renderCount, 0);

  const cacheKeys = metaStore.debugSnapshot().map((record) => record.cacheKey);
  assert.deepEqual(cacheKeys, []);

  const runtime = createIsrRuntime({ htmlStore, metaStore });
  await assert.rejects(
    runtime.handleFace({
      face: {
        route: '/tenant/{slug}',
        mode: 'isr',
        revalidateSeconds: 60,
        render: async () => ({ html: '<main>should not render</main>' }),
      },
      ctx: {
        request: {
          method: 'GET',
          path: '/tenant/home',
          query: {},
          headers: { 'x-tenant-id': ['TENANT_SECRET_C'] },
          cookies: {},
          body: new Uint8Array(),
          isBase64: false,
          cspNonce: null,
        },
        params: { slug: 'home' },
        proxy: null,
      },
      routePattern: '/tenant/{slug}',
      renderFresh: async () => {
        throw new Error('should not render');
      },
    }),
    (err) =>
      err instanceof Error &&
      err.message.includes('tenantKey or cacheKey') &&
      !err.message.includes('TENANT_SECRET_C'),
  );
});

test('isr: custom tenant boundary headers extend fail-closed defaults', async () => {
  const htmlStore = new InMemoryHtmlStore();
  const metaStore = new InMemoryIsrMetaStore();
  let renderCount = 0;

  const app = createFaceApp({
    faces: [
      {
        route: '/tenant-custom/{slug}',
        mode: 'isr',
        revalidateSeconds: 60,
        render: async (ctx) => {
          const seq = ++renderCount;
          const tenant = ctx.request.headers['x-org-id']?.[0] ?? 'missing';
          return { html: `<main>${tenant}-${seq}</main>` };
        },
      },
    ],
    isr: {
      htmlStore,
      metaStore,
      tenantBoundaryHeaders: ['x-org-id'],
    },
  });

  const customHeader = await app.handle({
    method: 'GET',
    path: '/tenant-custom/home',
    headers: { 'x-org-id': ['TENANT_SECRET_CUSTOM'] },
  });
  const defaultHeader = await app.handle({
    method: 'GET',
    path: '/tenant-custom/home',
    headers: { 'x-tenant-id': ['TENANT_SECRET_DEFAULT'] },
  });

  assert.equal(customHeader.status, 500);
  assert.equal(defaultHeader.status, 500);
  assert.equal(renderCount, 0);
  assert.deepEqual(metaStore.debugSnapshot(), []);
  assert.equal(
    decodeBody(customHeader.body as Uint8Array).includes(
      'TENANT_SECRET_CUSTOM',
    ),
    false,
  );
  assert.equal(
    decodeBody(defaultHeader.body as Uint8Array).includes(
      'TENANT_SECRET_DEFAULT',
    ),
    false,
  );
});

for (const variant of [
  {
    label: 'null tenantKey',
    isr: { tenantKey: null },
  },
  {
    label: 'null cacheKey',
    isr: { cacheKey: null },
  },
  {
    label: 'null tenantKey and cacheKey',
    isr: { tenantKey: null, cacheKey: null },
  },
]) {
  test(`isr: ${variant.label} does not count as an explicit tenant partition`, async () => {
    const htmlStore = new InMemoryHtmlStore();
    const metaStore = new InMemoryIsrMetaStore();
    let renderCount = 0;

    const app = createFaceApp({
      faces: [
        {
          route: '/tenant-null/{slug}',
          mode: 'isr',
          revalidateSeconds: 60,
          render: async (ctx) => {
            const seq = ++renderCount;
            const tenant = ctx.request.headers['x-tenant-id']?.[0] ?? 'missing';
            return { html: `<main>${tenant}-${seq}</main>` };
          },
        },
      ],
      isr: {
        htmlStore,
        metaStore,
        ...variant.isr,
      } as unknown as FaceIsrOptions,
    });

    const tenantAHeader = await app.handle({
      method: 'GET',
      path: '/tenant-null/home',
      headers: { 'x-tenant-id': ['TENANT_SECRET_A'] },
    });
    const tenantBHeader = await app.handle({
      method: 'GET',
      path: '/tenant-null/home',
      headers: { 'x-tenant-id': ['TENANT_SECRET_B'] },
    });

    assert.equal(tenantAHeader.status, 500);
    assert.equal(tenantBHeader.status, 500);
    assert.equal(renderCount, 0);
    assert.deepEqual(metaStore.debugSnapshot(), []);
    assert.equal(
      decodeBody(tenantAHeader.body as Uint8Array).includes('TENANT_SECRET_A'),
      false,
    );
    assert.equal(
      decodeBody(tenantBHeader.body as Uint8Array).includes('TENANT_SECRET_B'),
      false,
    );
  });
}

test('isr: tenantKey option partitions by a trusted header boundary', async () => {
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
      tenantKey: tenantKeyFromTrustedHeader('x-tenant-id'),
    },
  });

  const tenantAFirst = await app.handle({
    method: 'GET',
    path: '/tenant/home',
    headers: { 'x-tenant-id': ['tenant-a'] },
  });
  const tenantBFirst = await app.handle({
    method: 'GET',
    path: '/tenant/home',
    headers: { 'x-tenant-id': ['tenant-b'] },
  });
  const tenantASecond = await app.handle({
    method: 'GET',
    path: '/tenant/home',
    headers: { 'x-tenant-id': ['tenant-a'] },
  });

  assert.ok(decodeBody(tenantAFirst.body as Uint8Array).includes('tenant-1'));
  assert.ok(decodeBody(tenantBFirst.body as Uint8Array).includes('tenant-2'));
  assert.ok(decodeBody(tenantASecond.body as Uint8Array).includes('tenant-1'));
  assert.equal(renderCount, 2);

  const cacheKeys = metaStore.debugSnapshot().map((record) => record.cacheKey);
  assert.equal(cacheKeys.length, 2);
});

test('isr: custom cacheKey is an explicit tenant boundary partition contract', async () => {
  const htmlStore = new InMemoryHtmlStore();
  const metaStore = new InMemoryIsrMetaStore();
  let renderCount = 0;

  const app = createFaceApp({
    faces: [
      {
        route: '/tenant/{slug}',
        mode: 'isr',
        revalidateSeconds: 60,
        render: async (ctx) => {
          const seq = ++renderCount;
          const tenant = ctx.request.headers['x-tenant-id']?.[0] ?? 'missing';
          return { html: `<main>${tenant}-${seq}</main>` };
        },
      },
    ],
    isr: {
      htmlStore,
      metaStore,
      cacheKey: (input) => {
        const tenant = input.headers?.['x-tenant-id']?.[0];
        const tenantPartition = tenant === 'TENANT_SECRET_A' ? 'a' : 'b';
        return `custom::${input.routePattern}#tenant=${tenantPartition}`;
      },
    },
  });

  const tenantAFirst = await app.handle({
    method: 'GET',
    path: '/tenant/home',
    headers: { 'x-tenant-id': ['TENANT_SECRET_A'] },
  });
  const tenantBFirst = await app.handle({
    method: 'GET',
    path: '/tenant/home',
    headers: { 'x-tenant-id': ['TENANT_SECRET_B'] },
  });
  const tenantASecond = await app.handle({
    method: 'GET',
    path: '/tenant/home',
    headers: { 'x-tenant-id': ['TENANT_SECRET_A'] },
  });

  assert.equal(tenantAFirst.status, 200);
  assert.equal(tenantBFirst.status, 200);
  assert.equal(tenantASecond.status, 200);
  assert.ok(
    decodeBody(tenantAFirst.body as Uint8Array).includes('TENANT_SECRET_A-1'),
  );
  assert.ok(
    decodeBody(tenantBFirst.body as Uint8Array).includes('TENANT_SECRET_B-2'),
  );
  assert.ok(
    decodeBody(tenantASecond.body as Uint8Array).includes('TENANT_SECRET_A-1'),
  );
  assert.equal(renderCount, 2);

  const serializedKeys = metaStore
    .debugSnapshot()
    .map((record) => record.cacheKey)
    .join('\n');
  assert.equal(serializedKeys.includes('TENANT_SECRET_A'), false);
  assert.equal(serializedKeys.includes('TENANT_SECRET_B'), false);
  assert.equal(metaStore.debugSnapshot().length, 2);
});

test('isr: default cache key partitions by auth headers and cookies without raw secrets', async () => {
  const htmlStore = new InMemoryHtmlStore();
  const metaStore = new InMemoryIsrMetaStore();
  let renderCount = 0;

  const app = createFaceApp({
    faces: [
      {
        route: '/account',
        mode: 'isr',
        revalidateSeconds: 60,
        render: async () => {
          const seq = ++renderCount;
          return { html: `<main>account-${seq}</main>` };
        },
      },
    ],
    isr: {
      htmlStore,
      metaStore,
    },
  });

  const anonymous = await app.handle({ method: 'GET', path: '/account' });
  const anonymousAgain = await app.handle({ method: 'GET', path: '/account' });
  const authA = await app.handle({
    method: 'GET',
    path: '/account',
    headers: { authorization: ['Bearer SECRET_TOKEN_A'] },
  });
  const authB = await app.handle({
    method: 'GET',
    path: '/account',
    headers: { authorization: ['Bearer SECRET_TOKEN_B'] },
  });
  const cookieA = await app.handle({
    method: 'GET',
    path: '/account',
    headers: { cookie: ['session=COOKIE_SECRET_A; theme=light'] },
  });
  const cookieAAgain = await app.handle({
    method: 'GET',
    path: '/account',
    headers: { cookie: ['theme=light; session=COOKIE_SECRET_A'] },
  });

  assert.ok(decodeBody(anonymous.body as Uint8Array).includes('account-1'));
  assert.ok(
    decodeBody(anonymousAgain.body as Uint8Array).includes('account-1'),
  );
  assert.ok(decodeBody(authA.body as Uint8Array).includes('account-2'));
  assert.ok(decodeBody(authB.body as Uint8Array).includes('account-3'));
  assert.ok(decodeBody(cookieA.body as Uint8Array).includes('account-4'));
  assert.ok(decodeBody(cookieAAgain.body as Uint8Array).includes('account-4'));
  assert.equal(renderCount, 4);

  const serializedKeys = metaStore
    .debugSnapshot()
    .map((record) => record.cacheKey)
    .join('\n');
  assert.equal(serializedKeys.includes('SECRET_TOKEN_A'), false);
  assert.equal(serializedKeys.includes('SECRET_TOKEN_B'), false);
  assert.equal(serializedKeys.includes('COOKIE_SECRET_A'), false);
  assert.equal(serializedKeys.includes('authorization'), false);
  assert.equal(serializedKeys.includes('session'), false);
});

test('isr: varyCookies allowlist scopes request variant cookie partitioning', async () => {
  const htmlStore = new InMemoryHtmlStore();
  const metaStore = new InMemoryIsrMetaStore();
  let renderCount = 0;

  const app = createFaceApp({
    faces: [
      {
        route: '/account',
        mode: 'isr',
        revalidateSeconds: 60,
        render: async () => {
          const seq = ++renderCount;
          return { html: `<main>account-${seq}</main>` };
        },
      },
    ],
    isr: {
      htmlStore,
      metaStore,
      varyCookies: ['session'],
    },
  });

  const sessionA = await app.handle({
    method: 'GET',
    path: '/account',
    headers: { cookie: ['session=COOKIE_SECRET_A; theme=light'] },
  });
  const sessionAThemeChanged = await app.handle({
    method: 'GET',
    path: '/account',
    headers: { cookie: ['session=COOKIE_SECRET_A; theme=dark'] },
  });
  const sessionB = await app.handle({
    method: 'GET',
    path: '/account',
    headers: { cookie: ['session=COOKIE_SECRET_B; theme=dark'] },
  });

  assert.ok(decodeBody(sessionA.body as Uint8Array).includes('account-1'));
  assert.ok(
    decodeBody(sessionAThemeChanged.body as Uint8Array).includes('account-1'),
  );
  assert.ok(decodeBody(sessionB.body as Uint8Array).includes('account-2'));
  assert.equal(renderCount, 2);

  const serializedKeys = metaStore
    .debugSnapshot()
    .map((record) => record.cacheKey)
    .join('\n');
  assert.equal(metaStore.debugSnapshot().length, 2);
  assert.equal(serializedKeys.includes('COOKIE_SECRET_A'), false);
  assert.equal(serializedKeys.includes('COOKIE_SECRET_B'), false);
  assert.equal(serializedKeys.includes('session'), false);
  assert.equal(serializedKeys.includes('theme'), false);
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

  async tryAcquireLease(
    input: TryAcquireIsrLeaseInput,
  ): Promise<TryAcquireIsrLeaseResult> {
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

class CspMetadataDroppingMetaStore implements IsrMetaStore {
  private readonly inner = new InMemoryIsrMetaStore();

  async get(cacheKey: string): Promise<IsrMetaRecord | null> {
    return dropCspMetadata(await this.inner.get(cacheKey));
  }

  async tryAcquireLease(
    input: TryAcquireIsrLeaseInput,
  ): Promise<TryAcquireIsrLeaseResult> {
    const result = await this.inner.tryAcquireLease(input);
    return {
      ...result,
      record: dropCspMetadata(result.record) ?? result.record,
    };
  }

  async commitGeneration(input: CommitIsrGenerationInput): Promise<void> {
    const {
      contentSecurityPolicy: _contentSecurityPolicy,
      strictCspPolicy: _strictCspPolicy,
      ...rest
    } = input;
    await this.inner.commitGeneration(rest);
  }

  async releaseLease(input: ReleaseIsrLeaseInput): Promise<void> {
    await this.inner.releaseLease(input);
  }

  debugSnapshot(): IsrMetaRecord[] {
    return this.inner
      .debugSnapshot()
      .map((record) => dropCspMetadata(record) ?? record);
  }
}

function dropCspMetadata(record: IsrMetaRecord | null): IsrMetaRecord | null {
  if (record === null) return null;
  const {
    contentSecurityPolicy: _contentSecurityPolicy,
    strictCspPolicy: _strictCspPolicy,
    ...rest
  } = record;
  return rest;
}

class ToggleableFailingMetaStore implements IsrMetaStore {
  private readonly inner = new InMemoryIsrMetaStore();
  getError: unknown = null;
  acquireError: unknown = null;

  async get(cacheKey: string): Promise<IsrMetaRecord | null> {
    if (this.getError !== null) throw this.getError;
    return await this.inner.get(cacheKey);
  }

  async tryAcquireLease(
    input: TryAcquireIsrLeaseInput,
  ): Promise<TryAcquireIsrLeaseResult> {
    if (this.acquireError !== null) throw this.acquireError;
    return await this.inner.tryAcquireLease(input);
  }

  async commitGeneration(input: CommitIsrGenerationInput): Promise<void> {
    await this.inner.commitGeneration(input);
  }

  async releaseLease(input: ReleaseIsrLeaseInput): Promise<void> {
    await this.inner.releaseLease(input);
  }

  debugSnapshot(): IsrMetaRecord[] {
    return this.inner.debugSnapshot();
  }
}

class StatusContentTypeDroppingMetaStore implements IsrMetaStore {
  private readonly inner = new InMemoryIsrMetaStore();

  async get(cacheKey: string): Promise<IsrMetaRecord | null> {
    return dropStatusContentType(await this.inner.get(cacheKey));
  }

  async tryAcquireLease(
    input: TryAcquireIsrLeaseInput,
  ): Promise<TryAcquireIsrLeaseResult> {
    const result = await this.inner.tryAcquireLease(input);
    return {
      ...result,
      record: dropStatusContentType(result.record) ?? result.record,
    };
  }

  async commitGeneration(input: CommitIsrGenerationInput): Promise<void> {
    await this.inner.commitGeneration({
      ...input,
      status: 200,
      contentType: 'text/html; charset=utf-8',
    });
  }

  async releaseLease(input: ReleaseIsrLeaseInput): Promise<void> {
    await this.inner.releaseLease(input);
  }

  debugSnapshot(): IsrMetaRecord[] {
    return this.inner
      .debugSnapshot()
      .map((record) => dropStatusContentType(record) ?? record);
  }
}

function dropStatusContentType(
  record: IsrMetaRecord | null,
): IsrMetaRecord | null {
  if (record === null) return null;
  return {
    ...record,
    status: 200,
    contentType: 'text/html; charset=utf-8',
  };
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

  assert.ok(
    recording.commits.some(
      (commit) =>
        typeof commit.htmlPointer === 'string' && commit.htmlPointer.length > 0,
    ),
  );
});

test('isr: cache hits preserve status and content type from HTML metadata', async () => {
  const htmlStore = new InMemoryHtmlStore();
  const metaStore = new StatusContentTypeDroppingMetaStore();
  let renderCount = 0;

  const app = createFaceApp({
    faces: [
      {
        route: '/api/missing',
        mode: 'isr',
        revalidateSeconds: 60,
        render: () => {
          renderCount += 1;
          return {
            status: 404,
            headers: { 'content-type': 'application/problem+json' },
            html: '{"error":"missing"}',
          };
        },
      },
    ],
    isr: {
      htmlStore,
      metaStore,
      now: () => 1_000,
    },
  });

  const miss = await app.handle({ method: 'GET', path: '/api/missing' });
  assert.equal(miss.status, 404);
  assert.equal(miss.headers['content-type']?.[0], 'application/problem+json');
  assert.equal(miss.headers['x-facetheory-isr']?.[0], 'miss');

  const record = metaStore.debugSnapshot()[0];
  assert.ok(record?.htmlPointer);
  assert.equal(record.status, 200);
  assert.equal(record.contentType, 'text/html; charset=utf-8');

  const stored = await htmlStore.read(record.htmlPointer);
  assert.deepEqual(stored?.metadata, {
    'facetheory-content-type': 'application/problem+json',
    'facetheory-status': '404',
  });

  const hit = await app.handle({ method: 'GET', path: '/api/missing' });
  assert.equal(hit.status, miss.status);
  assert.equal(
    hit.headers['content-type']?.[0],
    miss.headers['content-type']?.[0],
  );
  assert.equal(hit.headers['x-facetheory-isr']?.[0], 'hit');
  assert.equal(
    decodeBody(hit.body as Uint8Array),
    decodeBody(miss.body as Uint8Array),
  );
  assert.equal(renderCount, 1);
});

test('isr: metadata get failure serves last-known stale entry with degraded state', async () => {
  const htmlStore = new InMemoryHtmlStore();
  const metaStore = new ToggleableFailingMetaStore();
  const observedErrors: Array<{ err: unknown; ctx: Record<string, unknown> }> =
    [];
  const metrics: Array<Record<string, unknown>> = [];

  let nowMs = 10_000;
  let renderCount = 0;
  const app = createFaceApp({
    faces: [
      {
        route: '/meta-read',
        mode: 'isr',
        revalidateSeconds: 1,
        render: () => {
          const seq = ++renderCount;
          return { html: `<main>read-${seq}</main>` };
        },
      },
    ],
    isr: {
      htmlStore,
      metaStore,
      now: () => nowMs,
    },
    observability: {
      onError: (err, ctx) =>
        observedErrors.push({
          err,
          ctx: ctx as unknown as Record<string, unknown>,
        }),
      metric: (record) =>
        metrics.push(record as unknown as Record<string, unknown>),
    },
  });

  const warm = await app.handle({ method: 'GET', path: '/meta-read' });
  assert.ok(decodeBody(warm.body as Uint8Array).includes('read-1'));
  assert.equal(warm.headers['x-facetheory-isr']?.[0], 'miss');

  nowMs = 11_000;
  const metadataError = new Error('metadata read unavailable');
  metaStore.getError = metadataError;
  const stale = await app.handle({
    method: 'GET',
    path: '/meta-read',
    headers: { 'x-request-id': ['meta-read-failure'] },
  });

  assert.equal(stale.status, 200);
  assert.ok(decodeBody(stale.body as Uint8Array).includes('read-1'));
  assert.equal(stale.headers['x-facetheory-isr']?.[0], 'stale-metadata-error');
  assert.equal(renderCount, 1);
  assert.equal(observedErrors.length, 1);
  assert.equal(observedErrors[0]?.err, metadataError);
  assert.equal(observedErrors[0]?.ctx.phase, 'isr-metadata');
  assert.equal(observedErrors[0]?.ctx.requestId, 'meta-read-failure');

  const degradedMetric = metrics
    .filter((metric) => metric.name === 'facetheory.request')
    .at(-1);
  assert.equal(
    (degradedMetric?.tags as Record<string, string> | undefined)?.isr_state,
    'stale-metadata-error',
  );
});

test('isr: metadata get failure honors error policy instead of serving stale', async () => {
  const htmlStore = new InMemoryHtmlStore();
  const metaStore = new ToggleableFailingMetaStore();
  const observedErrors: Array<{ err: unknown; ctx: Record<string, unknown> }> =
    [];

  let nowMs = 40_000;
  let renderCount = 0;
  const app = createFaceApp({
    faces: [
      {
        route: '/meta-error-policy',
        mode: 'isr',
        revalidateSeconds: 1,
        render: () => {
          const seq = ++renderCount;
          return { html: `<main>error-policy-${seq}</main>` };
        },
      },
    ],
    isr: {
      htmlStore,
      metaStore,
      now: () => nowMs,
      failurePolicy: 'error',
    },
    observability: {
      onError: (err, ctx) =>
        observedErrors.push({
          err,
          ctx: ctx as unknown as Record<string, unknown>,
        }),
    },
  });

  const warm = await app.handle({
    method: 'GET',
    path: '/meta-error-policy',
  });
  assert.ok(decodeBody(warm.body as Uint8Array).includes('error-policy-1'));
  assert.equal(warm.headers['x-facetheory-isr']?.[0], 'miss');

  nowMs = 41_000;
  const metadataError = new Error('metadata read unavailable for error policy');
  metaStore.getError = metadataError;
  const response = await app.handle({
    method: 'GET',
    path: '/meta-error-policy',
    headers: { 'x-request-id': ['meta-error-policy-failure'] },
  });

  assert.equal(response.status, 500);
  assert.equal(response.headers['x-facetheory-isr'], undefined);
  const body = decodeBody(response.body as Uint8Array);
  assert.ok(body.includes('<h1>Internal Server Error</h1>'));
  assert.equal(body.includes('error-policy-1'), false);
  assert.equal(renderCount, 1);
  assert.equal(observedErrors.length, 1);
  assert.equal(observedErrors[0]?.err, metadataError);
  assert.equal(observedErrors[0]?.ctx.phase, 'render');
  assert.equal(observedErrors[0]?.ctx.requestId, 'meta-error-policy-failure');
});

test('isr: metadata-failure last-known records evict least-recent cache keys', async () => {
  const htmlStore = new InMemoryHtmlStore();
  const metaStore = new ToggleableFailingMetaStore();
  let renderCount = 0;

  const app = createFaceApp({
    faces: [
      {
        route: '/meta-lru',
        mode: 'isr',
        revalidateSeconds: 60,
        render: (ctx) => {
          renderCount += 1;
          const variant = ctx.request.query.v?.[0] ?? 'missing';
          return { html: `<main>meta-lru-${variant}</main>` };
        },
      },
    ],
    isr: {
      htmlStore,
      metaStore,
      now: () => 50_000,
    },
  });

  for (let index = 0; index <= 128; index += 1) {
    const response = await app.handle({
      method: 'GET',
      path: `/meta-lru?v=${String(index)}`,
    });
    assert.equal(response.headers['x-facetheory-isr']?.[0], 'miss');
    assert.ok(
      decodeBody(response.body as Uint8Array).includes(
        `meta-lru-${String(index)}`,
      ),
    );
  }
  assert.equal(renderCount, 129);

  metaStore.getError = new Error('metadata unavailable after cap');
  const evicted = await app.handle({ method: 'GET', path: '/meta-lru?v=0' });
  assert.equal(evicted.status, 500);
  assert.equal(evicted.headers['x-facetheory-isr'], undefined);
  assert.equal(
    decodeBody(evicted.body as Uint8Array).includes('meta-lru-0'),
    false,
  );

  const retained = await app.handle({
    method: 'GET',
    path: '/meta-lru?v=128',
  });
  assert.equal(retained.status, 200);
  assert.equal(
    retained.headers['x-facetheory-isr']?.[0],
    'stale-metadata-error',
  );
  assert.ok(decodeBody(retained.body as Uint8Array).includes('meta-lru-128'));
  assert.equal(renderCount, 129);
});

test('isr: lease failure serves current stale entry with degraded state', async () => {
  const htmlStore = new InMemoryHtmlStore();
  const metaStore = new ToggleableFailingMetaStore();
  const observedErrors: Array<{ err: unknown; ctx: Record<string, unknown> }> =
    [];

  let nowMs = 20_000;
  let renderCount = 0;
  const app = createFaceApp({
    faces: [
      {
        route: '/meta-lease',
        mode: 'isr',
        revalidateSeconds: 1,
        render: () => {
          const seq = ++renderCount;
          return { html: `<main>lease-${seq}</main>` };
        },
      },
    ],
    isr: {
      htmlStore,
      metaStore,
      now: () => nowMs,
    },
    observability: {
      onError: (err, ctx) =>
        observedErrors.push({
          err,
          ctx: ctx as unknown as Record<string, unknown>,
        }),
    },
  });

  await app.handle({ method: 'GET', path: '/meta-lease' });
  nowMs = 21_000;
  const leaseError = new Error('lease unavailable');
  metaStore.acquireError = leaseError;

  const stale = await app.handle({
    method: 'GET',
    path: '/meta-lease',
    headers: { 'x-request-id': ['meta-lease-failure'] },
  });

  assert.equal(stale.status, 200);
  assert.ok(decodeBody(stale.body as Uint8Array).includes('lease-1'));
  assert.equal(stale.headers['x-facetheory-isr']?.[0], 'stale-metadata-error');
  assert.equal(renderCount, 1);
  assert.equal(observedErrors.length, 1);
  assert.equal(observedErrors[0]?.err, leaseError);
  assert.equal(observedErrors[0]?.ctx.phase, 'isr-metadata');
  assert.equal(observedErrors[0]?.ctx.requestId, 'meta-lease-failure');
});

test('isr: metadata failure without a serveable entry returns 500 through onError', async () => {
  const htmlStore = new InMemoryHtmlStore();
  const metaStore = new ToggleableFailingMetaStore();
  const metadataError = new Error('metadata unavailable before warm');
  const observedErrors: Array<{ err: unknown; ctx: Record<string, unknown> }> =
    [];
  metaStore.getError = metadataError;

  const app = createFaceApp({
    faces: [
      {
        route: '/no-entry',
        mode: 'isr',
        revalidateSeconds: 1,
        render: () => ({ html: '<main>unreachable</main>' }),
      },
    ],
    isr: {
      htmlStore,
      metaStore,
      now: () => 30_000,
    },
    observability: {
      onError: (err, ctx) =>
        observedErrors.push({
          err,
          ctx: ctx as unknown as Record<string, unknown>,
        }),
    },
  });

  const response = await app.handle({ method: 'GET', path: '/no-entry' });
  assert.equal(response.status, 500);
  assert.equal(response.headers['x-facetheory-isr'], undefined);
  const body = decodeBody(response.body as Uint8Array);
  assert.ok(body.includes('<h1>Internal Server Error</h1>'));
  assert.equal(body.includes('metadata unavailable before warm'), false);
  assert.equal(observedErrors.length, 1);
  assert.equal(observedErrors[0]?.err, metadataError);
  assert.equal(observedErrors[0]?.ctx.phase, 'render');
});

test('isr: strict CSP hydration writes and serves pointer-derived sidecars', async () => {
  const htmlStore = new InMemoryHtmlStore();
  const metaStore = new InMemoryIsrMetaStore();
  const secret = 'HYDRATION_SECRET_PAYLOAD';
  let renderCount = 0;

  const app = createFaceApp({
    faces: [
      {
        route: '/posts/{slug}',
        mode: 'isr',
        revalidateSeconds: 60,
        render: (ctx) => {
          const seq = ++renderCount;
          return {
            csp: {
              inlineScripts: false,
              inlineStyles: false,
              rawHead: false,
            },
            html: `<main>${ctx.params.slug}-${seq}</main>`,
            hydration: {
              data: {
                slug: ctx.params.slug,
                seq,
                secret,
                terminator: '</script>',
              },
              bootstrapModule: '/assets/client-entry.js',
            },
          };
        },
      },
    ],
    isr: {
      htmlStore,
      metaStore,
      now: () => 1_000,
    },
  });

  const miss = await app.handle({ method: 'GET', path: '/posts/a' });
  const missHtml = decodeBody(miss.body as Uint8Array);
  const sidecarHref = externalHydrationHref(missHtml);

  assert.equal(miss.headers['x-facetheory-isr']?.[0], 'miss');
  assert.match(
    miss.headers['content-security-policy']?.[0] ?? '',
    /script-src 'self'/,
  );
  assert.match(
    miss.headers['content-security-policy']?.[0] ?? '',
    /style-src 'self'/,
  );
  assert.ok(missHtml.includes('<main>a-1</main>'));
  assert.ok(missHtml.includes('src="/assets/client-entry.js"'));
  assert.equal(missHtml.includes('id="__FACETHEORY_DATA__"'), false);
  assert.equal(missHtml.includes(secret), false);
  assert.match(sidecarHref, /^\/posts\/a\?__facetheory_isr_hydration=/);

  const sidecar = await app.handle({ method: 'GET', path: sidecarHref });
  assert.equal(sidecar.status, 200);
  assert.equal(
    sidecar.headers['content-type']?.[0],
    'application/json; charset=utf-8',
  );
  assert.equal(renderCount, 1);

  const sidecarJson = decodeBody(sidecar.body as Uint8Array);
  assert.equal(sidecarJson.includes('<'), false);
  assert.deepEqual(JSON.parse(sidecarJson), {
    slug: 'a',
    seq: 1,
    secret,
    terminator: '</script>',
  });

  const hit = await app.handle({ method: 'GET', path: '/posts/a' });
  const hitHtml = decodeBody(hit.body as Uint8Array);
  assert.equal(hit.headers['x-facetheory-isr']?.[0], 'hit');
  assert.equal(
    hit.headers['content-security-policy']?.[0],
    miss.headers['content-security-policy']?.[0],
  );
  assert.equal(externalHydrationHref(hitHtml), sidecarHref);
  assert.equal(renderCount, 1);

  const records = metaStore.debugSnapshot();
  assert.equal(records[0]?.strictCspPolicy?.inlineScripts, false);
  assert.equal(records[0]?.strictCspPolicy?.inlineStyles, false);
  assert.equal(
    records[0]?.contentSecurityPolicy,
    miss.headers['content-security-policy']?.[0],
  );
  const serializedMeta = JSON.stringify(records);
  assert.equal(serializedMeta.includes(secret), false);
  assert.equal(serializedMeta.includes('terminator'), false);
});

test('isr: strict CSP cached HTML is validated before re-emitting stored bodies', async () => {
  const htmlStore = new InMemoryHtmlStore();
  const metaStore = new CspMetadataDroppingMetaStore();
  let renderCount = 0;

  const app = createFaceApp({
    faces: [
      {
        route: '/strict',
        mode: 'isr',
        revalidateSeconds: 60,
        render: () => {
          renderCount += 1;
          return {
            csp: {
              inlineScripts: false,
              inlineStyles: false,
              rawHead: false,
            },
            html: '<main>strict cached html</main>',
          };
        },
      },
    ],
    isr: {
      htmlStore,
      metaStore,
      now: () => 1_000,
    },
  });

  const miss = await app.handle({ method: 'GET', path: '/strict' });
  assert.equal(miss.status, 200);
  assert.equal(miss.headers['x-facetheory-isr']?.[0], 'miss');
  assert.match(
    miss.headers['content-security-policy']?.[0] ?? '',
    /script-src 'self'/,
  );

  const record = metaStore.debugSnapshot()[0];
  assert.ok(record?.htmlPointer);
  assert.equal(record.strictCspPolicy, undefined);
  assert.equal(record.contentSecurityPolicy, undefined);

  const stored = await htmlStore.read(record.htmlPointer);
  assert.ok(stored?.metadata);
  assert.ok(
    Object.values(stored.metadata).some((value) =>
      value.includes("script-src 'self'"),
    ),
  );

  const hit = await app.handle({ method: 'GET', path: '/strict' });
  assert.equal(hit.status, 200);
  assert.equal(
    hit.headers['content-security-policy']?.[0],
    miss.headers['content-security-policy']?.[0],
  );

  await htmlStore.write({
    key: record.htmlPointer,
    body: encodeBody(
      '<!doctype html><html><head><title>Unsafe</title></head><body><main>tampered</main><script>alert("cached")</script></body></html>',
    ),
    contentType: 'text/html; charset=utf-8',
    metadata: stored.metadata,
  });

  const tamperedHit = await app.handle({ method: 'GET', path: '/strict' });
  assert.equal(tamperedHit.status, 500);
  const tamperedHtml = decodeBody(tamperedHit.body as Uint8Array);
  assert.ok(tamperedHtml.includes('<h1>Internal Server Error</h1>'));
  assert.equal(tamperedHtml.includes('tampered'), false);
  assert.equal(tamperedHtml.includes('alert("cached")'), false);
  assert.equal(renderCount, 1);
});

test('isr: strict CSP hydration sidecars are bound to tenant and auth variants', async () => {
  const htmlStore = new InMemoryHtmlStore();
  const metaStore = new InMemoryIsrMetaStore();
  let renderCount = 0;

  const app = createFaceApp({
    faces: [
      {
        route: '/accounts/{id}',
        mode: 'isr',
        revalidateSeconds: 60,
        render: (ctx) => {
          const seq = ++renderCount;
          return {
            csp: {
              inlineScripts: false,
              inlineStyles: false,
              rawHead: false,
            },
            html: `<main>${ctx.params.id}-${seq}</main>`,
            hydration: {
              data: {
                id: ctx.params.id,
                seq,
                tenant: ctx.request.headers['x-tenant-id']?.[0] ?? 'missing',
                view: ctx.request.query.view?.[0] ?? 'missing',
              },
              bootstrapModule: '/assets/account-entry.js',
            },
          };
        },
      },
    ],
    isr: {
      htmlStore,
      metaStore,
      now: () => 1_000,
      tenantKey: tenantKeyFromTrustedHeader('x-tenant-id'),
    },
  });

  const matchingHeaders = {
    'x-tenant-id': ['tenant-a'],
    authorization: ['Bearer SECRET_TOKEN_A'],
    cookie: ['session=COOKIE_SECRET_A; theme=light'],
  };
  const miss = await app.handle({
    method: 'GET',
    path: '/accounts/42?view=summary',
    headers: matchingHeaders,
  });
  const missHtml = decodeBody(miss.body as Uint8Array);
  const sidecarHref = externalHydrationHref(missHtml);

  assert.equal(miss.status, 200);
  assert.equal(miss.headers['x-facetheory-isr']?.[0], 'miss');
  assert.match(
    sidecarHref,
    /^\/accounts\/42\?view=summary&__facetheory_isr_hydration=/,
  );

  const matchingSidecar = await app.handle({
    method: 'GET',
    path: sidecarHref,
    headers: matchingHeaders,
  });
  assert.equal(matchingSidecar.status, 200);
  assert.deepEqual(JSON.parse(decodeBody(matchingSidecar.body as Uint8Array)), {
    id: '42',
    seq: 1,
    tenant: 'tenant-a',
    view: 'summary',
  });

  const leakedWithoutOriginalContext = await app.handle({
    method: 'GET',
    path: sidecarHref,
  });
  const leakedMissingAuthCookie = await app.handle({
    method: 'GET',
    path: sidecarHref,
    headers: { 'x-tenant-id': ['tenant-a'] },
  });
  const leakedDifferentTenant = await app.handle({
    method: 'GET',
    path: sidecarHref,
    headers: {
      ...matchingHeaders,
      'x-tenant-id': ['tenant-b'],
    },
  });
  const leakedDifferentCookie = await app.handle({
    method: 'GET',
    path: sidecarHref,
    headers: {
      ...matchingHeaders,
      cookie: ['session=COOKIE_SECRET_B; theme=light'],
    },
  });
  const leakedWithoutQueryVariant = await app.handle({
    method: 'GET',
    path: sidecarHref.replace('view=summary&', ''),
    headers: matchingHeaders,
  });

  assert.equal(leakedWithoutOriginalContext.status, 404);
  assert.equal(leakedMissingAuthCookie.status, 404);
  assert.equal(leakedDifferentTenant.status, 404);
  assert.equal(leakedDifferentCookie.status, 404);
  assert.equal(leakedWithoutQueryVariant.status, 404);
  assert.equal(renderCount, 1);
});

class FailingSidecarHtmlStore extends InMemoryHtmlStore {
  failSidecarWrites = false;

  override async write(
    input: HtmlStoreWriteInput,
  ): Promise<HtmlStoreWriteResult> {
    if (this.failSidecarWrites && input.key.endsWith('.hydration.json')) {
      throw new Error('sidecar write failed');
    }
    return await super.write(input);
  }
}

test('isr: failed strict sidecar writes fail closed to stale HTML/data pairs', async () => {
  const htmlStore = new FailingSidecarHtmlStore();
  const metaStore = new InMemoryIsrMetaStore();

  let nowMs = 10_000;
  let renderCount = 0;

  const app = createFaceApp({
    faces: [
      {
        route: '/strict',
        mode: 'isr',
        revalidateSeconds: 1,
        render: () => {
          const seq = ++renderCount;
          return {
            csp: {
              inlineScripts: false,
              inlineStyles: false,
              rawHead: false,
            },
            html: `<main>v${seq}</main>`,
            hydration: {
              data: { seq },
              bootstrapModule: '/assets/client-entry.js',
            },
          };
        },
      },
    ],
    isr: {
      htmlStore,
      metaStore,
      now: () => nowMs,
    },
  });

  const warm = await app.handle({ method: 'GET', path: '/strict' });
  const warmHtml = decodeBody(warm.body as Uint8Array);
  const warmHref = externalHydrationHref(warmHtml);
  assert.ok(warmHtml.includes('<main>v1</main>'));

  const cacheKey = defaultIsrCacheKey({
    tenant: 'default',
    routePattern: '/strict',
    params: {},
    query: {},
    headers: {},
    cookies: {},
  });
  const beforeFailure = await metaStore.get(cacheKey);
  assert.ok(beforeFailure?.htmlPointer);

  nowMs = 11_000;
  htmlStore.failSidecarWrites = true;
  const stale = await app.handle({ method: 'GET', path: '/strict' });
  const staleHtml = decodeBody(stale.body as Uint8Array);
  assert.ok(staleHtml.includes('<main>v1</main>'));
  assert.equal(externalHydrationHref(staleHtml), warmHref);
  assert.equal(renderCount, 2);

  const afterFailure = await metaStore.get(cacheKey);
  assert.equal(afterFailure?.htmlPointer, beforeFailure?.htmlPointer);

  const warmSidecar = await app.handle({ method: 'GET', path: warmHref });
  assert.deepEqual(JSON.parse(decodeBody(warmSidecar.body as Uint8Array)), {
    seq: 1,
  });

  htmlStore.failSidecarWrites = false;
  nowMs = 11_001;
  const recovered = await app.handle({ method: 'GET', path: '/strict' });
  const recoveredHtml = decodeBody(recovered.body as Uint8Array);
  const recoveredHref = externalHydrationHref(recoveredHtml);
  assert.ok(recoveredHtml.includes('<main>v3</main>'));
  assert.notEqual(recoveredHref, warmHref);

  const recoveredSidecar = await app.handle({
    method: 'GET',
    path: recoveredHref,
  });
  assert.deepEqual(
    JSON.parse(decodeBody(recoveredSidecar.body as Uint8Array)),
    { seq: 3 },
  );
});

test('isr: invalid strict sidecar tokens fail closed without rendering', async () => {
  const htmlStore = new InMemoryHtmlStore();
  const metaStore = new InMemoryIsrMetaStore();
  let renderCount = 0;

  const app = createFaceApp({
    faces: [
      {
        route: '/',
        mode: 'isr',
        render: () => {
          renderCount += 1;
          return { html: '<main>should-not-render</main>' };
        },
      },
    ],
    isr: {
      htmlStore,
      metaStore,
    },
  });

  const response = await app.handle({
    method: 'GET',
    path: '/?__facetheory_isr_hydration=not-a-valid-token',
  });

  assert.equal(response.status, 404);
  assert.equal(renderCount, 0);
});
