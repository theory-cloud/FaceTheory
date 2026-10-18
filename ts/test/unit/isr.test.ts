import assert from 'node:assert/strict';
import test from 'node:test';

import { createFaceApp } from '../../src/app.js';
import {
  blockingIsrCacheControl,
  type CommitIsrGenerationInput,
  createIsrRuntime,
  defaultIsrCacheKey,
  type FaceIsrOptions,
  type HtmlStore,
  type HtmlStoreReadResult,
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
import type { FaceContext, FaceModule, FaceResponse } from '../../src/types.js';

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

class CountingHtmlStore implements HtmlStore {
  readonly inner = new InMemoryHtmlStore();
  readCalls = 0;
  writeCalls = 0;

  async read(key: string): Promise<HtmlStoreReadResult | null> {
    this.readCalls += 1;
    return await this.inner.read(key);
  }

  async write(input: HtmlStoreWriteInput): Promise<HtmlStoreWriteResult> {
    this.writeCalls += 1;
    return await this.inner.write(input);
  }
}

class CountingMetaStore implements IsrMetaStore {
  readonly inner = new InMemoryIsrMetaStore();
  getCalls = 0;
  invalidateCalls = 0;
  leaseCalls = 0;
  commitCalls = 0;
  releaseCalls = 0;

  async get(cacheKey: string): Promise<IsrMetaRecord | null> {
    this.getCalls += 1;
    return await this.inner.get(cacheKey);
  }

  async invalidate(cacheKey: string): Promise<void> {
    this.invalidateCalls += 1;
    await this.inner.invalidate(cacheKey);
  }

  async tryAcquireLease(
    input: TryAcquireIsrLeaseInput,
  ): Promise<TryAcquireIsrLeaseResult> {
    this.leaseCalls += 1;
    return await this.inner.tryAcquireLease(input);
  }

  async commitGeneration(input: CommitIsrGenerationInput): Promise<void> {
    this.commitCalls += 1;
    await this.inner.commitGeneration(input);
  }

  async releaseLease(input: ReleaseIsrLeaseInput): Promise<void> {
    this.releaseCalls += 1;
    await this.inner.releaseLease(input);
  }

  debugSnapshot(): IsrMetaRecord[] {
    return this.inner.debugSnapshot();
  }
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

test('isr: in-memory invalidate deletes meta so the next request regenerates', async () => {
  const htmlStore = new InMemoryHtmlStore();
  const metaStore = new InMemoryIsrMetaStore();
  let renderCount = 0;

  const app = createFaceApp({
    faces: [
      {
        route: '/invalidate',
        mode: 'isr',
        revalidateSeconds: 60,
        render: () => ({ html: `<main>render-${++renderCount}</main>` }),
      },
    ],
    isr: { htmlStore, metaStore },
  });

  const warm = await app.handle({ method: 'GET', path: '/invalidate' });
  assert.equal(warm.headers['x-facetheory-isr']?.[0], 'miss');
  assert.ok(decodeBody(warm.body as Uint8Array).includes('render-1'));

  const hit = await app.handle({ method: 'GET', path: '/invalidate' });
  assert.equal(hit.headers['x-facetheory-isr']?.[0], 'hit');
  assert.ok(decodeBody(hit.body as Uint8Array).includes('render-1'));

  const cacheKey = metaStore.debugSnapshot()[0]?.cacheKey;
  assert.ok(cacheKey);
  assert.ok(cacheKey.includes('default::/invalidate?'));
  await metaStore.invalidate(cacheKey);
  assert.deepEqual(metaStore.debugSnapshot(), []);

  const regenerated = await app.handle({ method: 'GET', path: '/invalidate' });
  assert.equal(regenerated.headers['x-facetheory-isr']?.[0], 'miss');
  assert.ok(decodeBody(regenerated.body as Uint8Array).includes('render-2'));
  assert.equal(renderCount, 2);
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
    label: 'tenantBoundaryHeaders non-array input',
    isr: { tenantBoundaryHeaders: 'x-org-id' } as unknown as FaceIsrOptions,
    expected: /isr\.tenantBoundaryHeaders must be an array of strings/,
  },
  {
    label: 'tenantBoundaryHeaders non-string entry',
    isr: {
      tenantBoundaryHeaders: ['x-org-id', 42] as unknown as string[],
    },
    expected: /isr\.tenantBoundaryHeaders\[1\] must be a string/,
  },
  {
    label: 'varyCookies non-array input',
    isr: { varyCookies: 'session' } as unknown as FaceIsrOptions,
    expected: /isr\.varyCookies must be an array of strings/,
  },
  {
    label: 'varyCookies non-string entry',
    isr: { varyCookies: ['session', false] as unknown as string[] },
    expected: /isr\.varyCookies\[1\] must be a string/,
  },
  {
    label: 'varyCookies empty array',
    isr: { varyCookies: [] },
    expected: /isr\.varyCookies must include at least one cookie name/,
  },
]) {
  test(`isr: malformed ${variant.label} fails loudly at construction`, () => {
    assert.throws(() => {
      createFaceApp({
        faces: [
          {
            route: '/bad-isr-option',
            mode: 'isr',
            revalidateSeconds: 60,
            render: async () => ({ html: '<main>bad option</main>' }),
          },
        ],
        isr: variant.isr,
      });
    }, variant.expected);
  });
}

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

test('isr: custom cacheKey without an explicit tenantKey fails closed on tenant boundary signals', async () => {
  const htmlStore = new CountingHtmlStore();
  const metaStore = new CountingMetaStore();
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
      cacheKey: ({ routePattern }) => `custom::${routePattern}`,
    },
  });

  const tenantA = await app.handle({
    method: 'GET',
    path: '/tenant/home',
    headers: { 'x-tenant-id': ['TENANT_SECRET_A'] },
  });
  const tenantB = await app.handle({
    method: 'GET',
    path: '/tenant/home',
    headers: { 'x-facetheory-tenant': ['TENANT_SECRET_B'] },
  });

  assert.equal(tenantA.status, 500);
  assert.equal(tenantB.status, 500);
  assert.equal(renderCount, 0);
  assert.equal(
    decodeBody(tenantA.body as Uint8Array).includes('TENANT_SECRET_A'),
    false,
  );
  assert.equal(
    decodeBody(tenantB.body as Uint8Array).includes('TENANT_SECRET_B'),
    false,
  );
  // Fail closed before any metadata lookup, lease acquisition, or HTML store access.
  assert.equal(metaStore.getCalls, 0);
  assert.equal(metaStore.leaseCalls, 0);
  assert.equal(metaStore.commitCalls, 0);
  assert.equal(metaStore.releaseCalls, 0);
  assert.equal(htmlStore.readCalls, 0);
  assert.equal(htmlStore.writeCalls, 0);
  assert.deepEqual(metaStore.debugSnapshot(), []);
});

test('isr: explicit tenantKey partitions custom cache keys so tenants sharing one logical key stay isolated', async () => {
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
      tenantKey: tenantKeyFromTrustedHeader('x-tenant-id'),
      // Identical logical key for every tenant: the framework-owned tenant
      // partition must still keep the stored identities distinct.
      cacheKey: ({ routePattern }) => `shared::${routePattern}`,
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

  assert.ok(decodeBody(tenantAFirst.body as Uint8Array).includes('tenant-a-1'));
  assert.ok(decodeBody(tenantBFirst.body as Uint8Array).includes('tenant-b-2'));
  // Tenant B never receives tenant A's cached HTML even though the logical key matched.
  assert.equal(
    decodeBody(tenantBFirst.body as Uint8Array).includes('tenant-a'),
    false,
  );
  // Same-tenant repeats hit that tenant's own partitioned entry.
  assert.ok(
    decodeBody(tenantASecond.body as Uint8Array).includes('tenant-a-1'),
  );
  assert.equal(renderCount, 2);

  const cacheKeys = metaStore.debugSnapshot().map((record) => record.cacheKey);
  assert.equal(cacheKeys.length, 2);
  assert.equal(new Set(cacheKeys).size, 2);
  const serialized = cacheKeys.join('\n');
  // The tenant is folded in as a digest: raw trusted tenant values never persist.
  assert.equal(serialized.includes('tenant-a'), false);
  assert.equal(serialized.includes('tenant-b'), false);
});

test('isr: explicit tenantKey distinguishes the literal "default" identifier from another tenant', async () => {
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
      tenantKey: tenantKeyFromTrustedHeader('x-tenant-id'),
      cacheKey: ({ routePattern }) => `shared::${routePattern}`,
    },
  });

  const defaultFirst = await app.handle({
    method: 'GET',
    path: '/tenant/home',
    headers: { 'x-tenant-id': ['default'] },
  });
  const defaultSecond = await app.handle({
    method: 'GET',
    path: '/tenant/home',
    headers: { 'x-tenant-id': ['default'] },
  });
  const otherTenant = await app.handle({
    method: 'GET',
    path: '/tenant/home',
    headers: { 'x-tenant-id': ['tenant-a'] },
  });

  assert.ok(decodeBody(defaultFirst.body as Uint8Array).includes('default-1'));
  assert.ok(decodeBody(defaultSecond.body as Uint8Array).includes('default-1'));
  assert.ok(decodeBody(otherTenant.body as Uint8Array).includes('tenant-a-2'));
  assert.equal(renderCount, 2);
  assert.equal(metaStore.debugSnapshot().length, 2);
});

test('isr: tenant-invariant custom cacheKey without signals keeps its logical key unchanged', async () => {
  const htmlStore = new InMemoryHtmlStore();
  const metaStore = new InMemoryIsrMetaStore();
  let renderCount = 0;

  const app = createFaceApp({
    faces: [
      {
        route: '/public/{slug}',
        mode: 'isr',
        revalidateSeconds: 60,
        render: async () => {
          const seq = ++renderCount;
          return { html: `<main>public-${seq}</main>` };
        },
      },
    ],
    isr: {
      htmlStore,
      metaStore,
      cacheKey: ({ routePattern }) => `public::${routePattern}`,
    },
  });

  const first = await app.handle({ method: 'GET', path: '/public/home' });
  const second = await app.handle({ method: 'GET', path: '/public/home' });

  assert.ok(decodeBody(first.body as Uint8Array).includes('public-1'));
  assert.ok(decodeBody(second.body as Uint8Array).includes('public-1'));
  assert.equal(renderCount, 1);

  const cacheKeys = metaStore.debugSnapshot().map((record) => record.cacheKey);
  // No tenant scope and no signal: the consumer's logical key is used verbatim.
  assert.deepEqual(cacheKeys, ['public::/public/{slug}']);
});

test('isr: documented tenant-safe example derives distinct keys across tenant, query, and auth variants', async () => {
  const htmlStore = new InMemoryHtmlStore();
  const metaStore = new InMemoryIsrMetaStore();
  let renderCount = 0;

  const app = createFaceApp({
    faces: [
      {
        route: '/accounts/{id}',
        mode: 'isr',
        revalidateSeconds: 60,
        render: async (ctx) => {
          const seq = ++renderCount;
          const tenant = ctx.request.headers['x-tenant-id']?.[0] ?? 'missing';
          const view = ctx.request.query.view?.[0] ?? 'missing';
          return { html: `<main>${tenant}-${view}-${seq}</main>` };
        },
      },
    ],
    isr: {
      htmlStore,
      metaStore,
      // Trusted tenant identity — never a raw client-supplied header.
      tenantKey: tenantKeyFromTrustedHeader('x-tenant-id'),
      // Delegate to defaultIsrCacheKey so query, cookie, and auth request variants
      // are retained instead of being dropped by a hand-rolled key.
      cacheKey: (input) => defaultIsrCacheKey(input),
    },
  });

  const tenantASummary = await app.handle({
    method: 'GET',
    path: '/accounts/42?view=summary',
    headers: { 'x-tenant-id': ['tenant-a'] },
  });
  const tenantASummaryRepeat = await app.handle({
    method: 'GET',
    path: '/accounts/42?view=summary',
    headers: { 'x-tenant-id': ['tenant-a'] },
  });
  const tenantBSummary = await app.handle({
    method: 'GET',
    path: '/accounts/42?view=summary',
    headers: { 'x-tenant-id': ['tenant-b'] },
  });
  const tenantADetail = await app.handle({
    method: 'GET',
    path: '/accounts/42?view=detail',
    headers: { 'x-tenant-id': ['tenant-a'] },
  });
  const tenantAAuth = await app.handle({
    method: 'GET',
    path: '/accounts/42?view=summary',
    headers: {
      'x-tenant-id': ['tenant-a'],
      authorization: ['Bearer SECRET_TOKEN_A'],
    },
  });

  assert.ok(
    decodeBody(tenantASummary.body as Uint8Array).includes(
      'tenant-a-summary-1',
    ),
  );
  assert.ok(
    decodeBody(tenantASummaryRepeat.body as Uint8Array).includes(
      'tenant-a-summary-1',
    ),
  );
  assert.ok(
    decodeBody(tenantBSummary.body as Uint8Array).includes(
      'tenant-b-summary-2',
    ),
  );
  assert.ok(
    decodeBody(tenantADetail.body as Uint8Array).includes('tenant-a-detail-3'),
  );
  assert.ok(
    decodeBody(tenantAAuth.body as Uint8Array).includes('tenant-a-summary-4'),
  );
  assert.equal(renderCount, 4);

  const cacheKeys = metaStore.debugSnapshot().map((record) => record.cacheKey);
  assert.equal(cacheKeys.length, 4);
  assert.equal(new Set(cacheKeys).size, 4);
  assert.ok(
    cacheKeys.every((key) => key.startsWith('isr-tenant:v1:')),
    'custom cache keys must be composed with a framework-owned tenant partition',
  );
});

for (const emptyTenant of [null, undefined, '', '   '] as const) {
  test(`isr: explicit tenantKey resolving to ${JSON.stringify(emptyTenant)} fails closed for custom cache keys`, async () => {
    const htmlStore = new CountingHtmlStore();
    const metaStore = new CountingMetaStore();
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
        tenantKey: () => emptyTenant,
        cacheKey: ({ routePattern }) => `custom::${routePattern}`,
      },
    });

    const response = await app.handle({
      method: 'GET',
      path: '/tenant/home',
      headers: { 'x-tenant-id': ['tenant-a'] },
    });

    assert.equal(response.status, 500);
    assert.equal(renderCount, 0);
    assert.equal(metaStore.getCalls, 0);
    assert.equal(metaStore.leaseCalls, 0);
    assert.equal(metaStore.commitCalls, 0);
    assert.equal(metaStore.releaseCalls, 0);
    assert.equal(htmlStore.readCalls, 0);
    assert.equal(htmlStore.writeCalls, 0);
    assert.deepEqual(metaStore.debugSnapshot(), []);
  });
}

for (const emptyTenant of [null, undefined, '', '   '] as const) {
  test(`isr: explicit tenantKey resolving to ${JSON.stringify(emptyTenant)} fails closed for the default cache key`, async () => {
    const htmlStore = new CountingHtmlStore();
    const metaStore = new CountingMetaStore();
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
        tenantKey: () => emptyTenant,
      },
    });

    const response = await app.handle({
      method: 'GET',
      path: '/tenant/home',
      headers: { 'x-tenant-id': ['tenant-a'] },
    });

    assert.equal(response.status, 500);
    assert.equal(renderCount, 0);
    assert.equal(metaStore.getCalls, 0);
    assert.equal(metaStore.leaseCalls, 0);
    assert.equal(metaStore.commitCalls, 0);
    assert.equal(metaStore.releaseCalls, 0);
    assert.equal(htmlStore.readCalls, 0);
    assert.equal(htmlStore.writeCalls, 0);
    assert.deepEqual(metaStore.debugSnapshot(), []);
  });
}

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

  async invalidate(cacheKey: string): Promise<void> {
    await this.inner.invalidate(cacheKey);
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

  async invalidate(cacheKey: string): Promise<void> {
    await this.inner.invalidate(cacheKey);
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

  async invalidate(cacheKey: string): Promise<void> {
    await this.inner.invalidate(cacheKey);
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

  async invalidate(cacheKey: string): Promise<void> {
    await this.inner.invalidate(cacheKey);
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

test('isr: superseded strict CSP hydration sidecars are no longer readable', async () => {
  const htmlStore = new InMemoryHtmlStore();
  const metaStore = new InMemoryIsrMetaStore();
  let nowMs = 1_000;
  let renderCount = 0;

  const app = createFaceApp({
    faces: [
      {
        route: '/accounts/{id}',
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
            html: `<main>account-${seq}</main>`,
            hydration: {
              data: { seq },
              bootstrapModule: '/assets/account-entry.js',
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

  const first = await app.handle({ method: 'GET', path: '/accounts/42' });
  const firstHref = externalHydrationHref(decodeBody(first.body as Uint8Array));
  const firstSidecar = await app.handle({ method: 'GET', path: firstHref });
  assert.equal(firstSidecar.status, 200);

  nowMs += 2_000;
  const second = await app.handle({ method: 'GET', path: '/accounts/42' });
  assert.equal(second.headers['x-facetheory-isr']?.[0], 'miss');
  const secondHref = externalHydrationHref(
    decodeBody(second.body as Uint8Array),
  );
  assert.notEqual(secondHref, firstHref);

  const superseded = await app.handle({ method: 'GET', path: firstHref });
  assert.equal(superseded.status, 404);
  const current = await app.handle({ method: 'GET', path: secondHref });
  assert.equal(current.status, 200);
  assert.equal(renderCount, 2);
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
        revalidateSeconds: 60,
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

test('isr: a throwing regeneration metric cannot strand the lease or mask the render outcome', async () => {
  const htmlStore = new InMemoryHtmlStore();
  const metaStore = new CountingMetaStore();
  let metricCalls = 0;

  let nowMs = 1_000;
  const app = createFaceApp({
    faces: [
      {
        route: '/metric-regen',
        mode: 'isr',
        revalidateSeconds: 1,
        render: () => {
          throw new Error('regeneration blew up');
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
      metric: (record) => {
        metricCalls += 1;
        if (record.name === 'facetheory.isr.regeneration_ms') {
          throw new Error('metric sink unavailable');
        }
      },
    },
  });

  const failed = await app.handle({ method: 'GET', path: '/metric-regen' });
  assert.equal(failed.status, 500);
  assert.ok(metricCalls >= 1);
  // The lease acquired for the failed regeneration is released even though the
  // regeneration metric threw before releaseLease ran.
  assert.equal(metaStore.releaseCalls, 1);
  const records = metaStore.debugSnapshot();
  assert.equal(records.length, 1);
  assert.equal(records[0]?.leaseOwner, null);
  assert.equal(records[0]?.leaseToken, null);

  // No stranded lease: a second request acquires a fresh lease and is contained again.
  nowMs = 2_000;
  const retry = await app.handle({ method: 'GET', path: '/metric-regen' });
  assert.equal(retry.status, 500);
  assert.equal(metaStore.releaseCalls, 2);
});

test('isr: ordinary regeneration still emits the success metric and releases the lease', async () => {
  const htmlStore = new InMemoryHtmlStore();
  const metaStore = new CountingMetaStore();
  const metrics: Array<{ name: string; tags?: Record<string, string> }> = [];

  const app = createFaceApp({
    faces: [
      {
        route: '/metric-ok',
        mode: 'isr',
        revalidateSeconds: 60,
        render: () => ({ html: '<main>ok</main>' }),
      },
    ],
    isr: { htmlStore, metaStore },
    observability: {
      metric: (record) =>
        metrics.push(
          record as { name: string; tags?: Record<string, string> },
        ),
    },
  });

  const response = await app.handle({ method: 'GET', path: '/metric-ok' });
  assert.equal(response.status, 200);
  assert.equal(response.headers['x-facetheory-isr']?.[0], 'miss');
  const regeneration = metrics.filter(
    (metric) => metric.name === 'facetheory.isr.regeneration_ms',
  );
  assert.equal(regeneration.length, 1);
  assert.equal(regeneration[0]?.tags?.outcome, 'success');
  assert.equal(metaStore.commitCalls, 1);
  assert.equal(metaStore.releaseCalls, 1);
});

test('isr: a throwing contention metric does not fail the ordinary contention journey', async () => {
  const htmlStore = new InMemoryHtmlStore();
  const metaStore = new InMemoryIsrMetaStore();

  let nowMs = 1_000;
  let renderCount = 0;
  let contentionMetricCalls = 0;

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
    observability: {
      metric: (record) => {
        if (record.name === 'facetheory.isr.lease_contention') {
          contentionMetricCalls += 1;
          throw new Error('contention metric sink unavailable');
        }
      },
    },
  });

  const warm = await app.handle({ method: 'GET', path: '/posts/a' });
  assert.equal(warm.status, 200);

  nowMs = 2_000;
  const responses = await Promise.all(
    Array.from({ length: 8 }, () =>
      app.handle({ method: 'GET', path: '/posts/a' }),
    ),
  );

  assert.ok(contentionMetricCalls >= 1);
  assert.equal(renderCount, 2);
  for (const response of responses) {
    assert.equal(response.status, 200);
    assert.ok(decodeBody(response.body as Uint8Array).includes('render-2'));
  }
  // Every held lease was released; nothing is stranded.
  for (const record of metaStore.debugSnapshot()) {
    assert.equal(record.leaseOwner, null);
    assert.equal(record.leaseToken, null);
  }
});

test('isr: cache metrics label parameterized routes by template, not request path', async () => {
  const metrics: Array<{ name: string; tags?: Record<string, string> }> = [];
  const app = createFaceApp({
    faces: [
      {
        route: '/isr-posts/{slug}',
        mode: 'isr',
        revalidateSeconds: 60,
        render: (ctx) => ({ html: `<main>${String(ctx.params.slug)}</main>` }),
      },
    ],
    observability: {
      metric: (record) =>
        metrics.push(record as unknown as { name: string; tags?: Record<string, string> }),
    },
  });

  await app.handle({ method: 'GET', path: '/isr-posts/a' });
  await app.handle({ method: 'GET', path: '/isr-posts/b' });
  await app.handle({ method: 'GET', path: '/isr-posts/a' });
  const missing = await app.handle({ method: 'GET', path: '/isr-missing/zzz' });
  assert.equal(missing.status, 404);

  const cacheLabels = metrics
    .filter((metric) => metric.name === 'facetheory.isr.cache')
    .map((metric) => metric.tags?.route_pattern);
  assert.equal(cacheLabels.length, 3);
  assert.ok(cacheLabels.every((label) => label === '/isr-posts/{slug}'));

  const requestLabels = new Set(
    metrics
      .filter((metric) => metric.name === 'facetheory.request')
      .map((metric) => metric.tags?.route_pattern),
  );
  assert.deepEqual([...requestLabels].sort(), ['/isr-posts/{slug}', 'unmatched']);
});

// --- FACE-063E M9: ISR authenticated cache-control fail-closed guard --------------
//
// Root criterion: authenticated requests fail closed with `private, no-store`
// unless an explicit safe variation policy is configured. The guard also covers
// any deployment that configures an explicit, opaque custom `cacheKey`, because
// the framework cannot attribute that identity to a shared viewer. These tests
// drive the real `createIsrRuntime` (through `createFaceApp`, plus one direct
// runtime probe) across all six emission branches and assert both the emitted
// response header and the committed `HtmlStore` cache-control value.

const ISR_MATRIX_REVALIDATE_SECONDS = 60;
const ISR_MATRIX_PUBLIC_CACHE_CONTROL = blockingIsrCacheControl(
  ISR_MATRIX_REVALIDATE_SECONDS,
);
const ISR_MATRIX_PRIVATE_CACHE_CONTROL = 'private, no-store';

type IsrMatrixBranch =
  | 'miss'
  | 'hit'
  | 'wait-hit'
  | 'stale'
  | 'stale-after-error'
  | 'stale-metadata-error';

const ISR_MATRIX_BRANCHES: readonly IsrMatrixBranch[] = [
  'miss',
  'hit',
  'wait-hit',
  'stale',
  'stale-after-error',
  'stale-metadata-error',
];

const ISR_MATRIX_EXPECTED_STATE: Record<IsrMatrixBranch, string> = {
  miss: 'miss',
  hit: 'hit',
  'wait-hit': 'wait-hit',
  stale: 'stale',
  'stale-after-error': 'stale',
  'stale-metadata-error': 'stale-metadata-error',
};

const ISR_MATRIX_AUTH_HEADERS = { authorization: ['Bearer SECRET_TOKEN_A'] };
const ISR_MATRIX_COOKIE_HEADERS = {
  cookie: ['session=COOKIE_SECRET_A; theme=light'],
};

class RecordingHtmlStore extends InMemoryHtmlStore {
  readonly writes: HtmlStoreWriteInput[] = [];

  override async write(
    input: HtmlStoreWriteInput,
  ): Promise<HtmlStoreWriteResult> {
    this.writes.push({
      ...input,
      ...(input.metadata ? { metadata: { ...input.metadata } } : {}),
    });
    return await super.write(input);
  }
}

class ToggleContentionMetaStore extends InMemoryIsrMetaStore {
  contend = false;

  override async tryAcquireLease(
    input: TryAcquireIsrLeaseInput,
  ): Promise<TryAcquireIsrLeaseResult> {
    if (!this.contend) return await super.tryAcquireLease(input);
    const record = await this.get(input.cacheKey);
    if (!record) throw new Error('contention store requires a warm record');
    return { acquired: false, record, leaseToken: null };
  }
}

class FailingGetMetaStore extends InMemoryIsrMetaStore {
  failGet = false;

  override async get(cacheKey: string): Promise<IsrMetaRecord | null> {
    if (this.failGet) throw new Error('metadata store unavailable');
    return await super.get(cacheKey);
  }
}

interface IsrMatrixProbe {
  headers?: Record<string, string[]>;
}

interface IsrMatrixResult {
  response: FaceResponse;
  writes: HtmlStoreWriteInput[];
}

async function driveIsrMatrixBranch(
  branch: IsrMatrixBranch,
  probe: IsrMatrixProbe,
  isrOptions: FaceIsrOptions = {},
): Promise<IsrMatrixResult> {
  const htmlStore = new RecordingHtmlStore();
  const plainMetaStore = new InMemoryIsrMetaStore();
  const contentionMetaStore = new ToggleContentionMetaStore();
  const failingGetMetaStore = new FailingGetMetaStore();
  const metaStore: InMemoryIsrMetaStore =
    branch === 'stale'
      ? contentionMetaStore
      : branch === 'stale-metadata-error'
        ? failingGetMetaStore
        : plainMetaStore;

  let nowMs = 1_000;
  let renderMode: 'ok' | 'throw' = 'ok';
  let renderDelayMs = 0;

  const app = createFaceApp({
    faces: [
      {
        route: '/matrix',
        mode: 'isr',
        revalidateSeconds: ISR_MATRIX_REVALIDATE_SECONDS,
        render: async () => {
          if (renderDelayMs > 0) await delay(renderDelayMs);
          if (renderMode === 'throw') {
            throw new Error('matrix regeneration failure');
          }
          return { html: '<main>matrix</main>' };
        },
      },
    ],
    isr: {
      htmlStore,
      metaStore,
      now: () => nowMs,
      ...(branch === 'stale'
        ? { lockContentionPolicy: 'serve-stale' as const }
        : {}),
      ...isrOptions,
    },
  });

  const request = (): Promise<FaceResponse> =>
    app.handle({
      method: 'GET',
      path: '/matrix',
      ...(probe.headers ? { headers: probe.headers } : {}),
    });

  let response: FaceResponse;
  switch (branch) {
    case 'miss':
      response = await request();
      break;
    case 'hit': {
      await request();
      response = await request();
      break;
    }
    case 'wait-hit': {
      renderDelayMs = 40;
      const first = request();
      await delay(5);
      const second = request();
      const [, secondResponse] = await Promise.all([first, second]);
      response = secondResponse;
      break;
    }
    case 'stale': {
      await request();
      nowMs += (ISR_MATRIX_REVALIDATE_SECONDS + 1) * 1_000;
      contentionMetaStore.contend = true;
      response = await request();
      break;
    }
    case 'stale-after-error': {
      await request();
      nowMs += (ISR_MATRIX_REVALIDATE_SECONDS + 1) * 1_000;
      renderMode = 'throw';
      response = await request();
      break;
    }
    case 'stale-metadata-error': {
      await request();
      failingGetMetaStore.failGet = true;
      response = await request();
      break;
    }
    default:
      throw new Error(`unknown ISR matrix branch: ${String(branch)}`);
  }

  return { response, writes: htmlStore.writes };
}

function isrCacheControl(response: FaceResponse): string | undefined {
  return response.headers['cache-control']?.[0];
}

function isrState(response: FaceResponse): string | undefined {
  return response.headers['x-facetheory-isr']?.[0];
}

function assertHtmlWritesCacheControl(
  writes: readonly HtmlStoreWriteInput[],
  expected: string,
): void {
  const htmlWrites = writes.filter(
    (write) => write.contentType !== 'application/json; charset=utf-8',
  );
  assert.ok(htmlWrites.length > 0, 'expected at least one HTML store write');
  for (const write of htmlWrites) {
    assert.equal(write.cacheControl, expected);
  }
}

for (const branch of ISR_MATRIX_BRANCHES) {
  test(`isr: ordinary anonymous default-key request stays public on the ${branch} branch`, async () => {
    const { response, writes } = await driveIsrMatrixBranch(branch, {});
    assert.equal(isrState(response), ISR_MATRIX_EXPECTED_STATE[branch]);
    assert.equal(isrCacheControl(response), ISR_MATRIX_PUBLIC_CACHE_CONTROL);
    assertHtmlWritesCacheControl(writes, ISR_MATRIX_PUBLIC_CACHE_CONTROL);
  });
}

for (const branch of ISR_MATRIX_BRANCHES) {
  test(`isr: authorization request fails closed on the ${branch} branch`, async () => {
    const { response, writes } = await driveIsrMatrixBranch(branch, {
      headers: ISR_MATRIX_AUTH_HEADERS,
    });
    assert.equal(isrState(response), ISR_MATRIX_EXPECTED_STATE[branch]);
    assert.equal(isrCacheControl(response), ISR_MATRIX_PRIVATE_CACHE_CONTROL);
    assertHtmlWritesCacheControl(writes, ISR_MATRIX_PRIVATE_CACHE_CONTROL);
  });
}

for (const branch of ISR_MATRIX_BRANCHES) {
  test(`isr: cookie-bearing request fails closed on the ${branch} branch`, async () => {
    const { response, writes } = await driveIsrMatrixBranch(branch, {
      headers: ISR_MATRIX_COOKIE_HEADERS,
    });
    assert.equal(isrState(response), ISR_MATRIX_EXPECTED_STATE[branch]);
    assert.equal(isrCacheControl(response), ISR_MATRIX_PRIVATE_CACHE_CONTROL);
    assertHtmlWritesCacheControl(writes, ISR_MATRIX_PRIVATE_CACHE_CONTROL);
  });
}

test('isr: every default auth-vary header fails closed on the miss branch', async () => {
  for (const headerName of [
    'authorization',
    'proxy-authorization',
    'x-api-key',
    'x-amz-security-token',
  ]) {
    const { response } = await driveIsrMatrixBranch('miss', {
      headers: { [headerName]: ['SECRET_VALUE'] },
    });
    assert.equal(
      isrCacheControl(response),
      ISR_MATRIX_PRIVATE_CACHE_CONTROL,
      `expected ${headerName} to fail closed`,
    );
  }
});

test('isr: varyCookies keeps the key shared but still fails closed for an unlisted cookie', async () => {
  const htmlStore = new RecordingHtmlStore();
  const metaStore = new InMemoryIsrMetaStore();
  let renders = 0;

  const app = createFaceApp({
    faces: [
      {
        route: '/matrix',
        mode: 'isr',
        revalidateSeconds: ISR_MATRIX_REVALIDATE_SECONDS,
        render: () => {
          renders += 1;
          return { html: `<main>matrix-${renders}</main>` };
        },
      },
    ],
    isr: { htmlStore, metaStore, varyCookies: ['pref'] },
  });

  const first = await app.handle({
    method: 'GET',
    path: '/matrix',
    headers: { cookie: ['session=COOKIE_SECRET_A'] },
  });
  const second = await app.handle({
    method: 'GET',
    path: '/matrix',
    headers: { cookie: ['session=COOKIE_SECRET_A'] },
  });

  assert.equal(metaStore.debugSnapshot().length, 1);
  assert.equal(renders, 1);
  assert.equal(isrState(second), 'hit');
  assert.equal(isrCacheControl(first), ISR_MATRIX_PRIVATE_CACHE_CONTROL);
  assert.equal(isrCacheControl(second), ISR_MATRIX_PRIVATE_CACHE_CONTROL);
});

test('isr: explicit custom cacheKey fails closed for anonymous and bespoke-auth requests', async () => {
  const htmlStore = new RecordingHtmlStore();
  const metaStore = new InMemoryIsrMetaStore();

  const app = createFaceApp({
    faces: [
      {
        route: '/matrix',
        mode: 'isr',
        revalidateSeconds: ISR_MATRIX_REVALIDATE_SECONDS,
        render: () => ({ html: '<main>matrix</main>' }),
      },
    ],
    isr: {
      htmlStore,
      metaStore,
      cacheKey: ({ headers }) =>
        `custom::${headers?.['x-session-token']?.[0] ?? 'anonymous'}`,
    },
  });

  const anonymous = await app.handle({ method: 'GET', path: '/matrix' });
  const bespoke = await app.handle({
    method: 'GET',
    path: '/matrix',
    headers: { 'x-session-token': ['SESSION_SECRET_VALUE'] },
  });

  assert.equal(isrCacheControl(anonymous), ISR_MATRIX_PRIVATE_CACHE_CONTROL);
  assert.equal(isrCacheControl(bespoke), ISR_MATRIX_PRIVATE_CACHE_CONTROL);
  assertHtmlWritesCacheControl(htmlStore.writes, ISR_MATRIX_PRIVATE_CACHE_CONTROL);
});

test('isr: trusted tenantKey with a custom cacheKey stays guarded under the composed key', async () => {
  const htmlStore = new RecordingHtmlStore();
  const metaStore = new InMemoryIsrMetaStore();

  const app = createFaceApp({
    faces: [
      {
        route: '/matrix',
        mode: 'isr',
        revalidateSeconds: ISR_MATRIX_REVALIDATE_SECONDS,
        render: () => ({ html: '<main>matrix</main>' }),
      },
    ],
    isr: {
      htmlStore,
      metaStore,
      tenantKey: tenantKeyFromTrustedHeader('x-tenant-id'),
      cacheKey: ({ routePattern }) => `custom::${routePattern}`,
    },
  });

  const response = await app.handle({
    method: 'GET',
    path: '/matrix',
    headers: {
      'x-tenant-id': ['tenant-a'],
      ...ISR_MATRIX_AUTH_HEADERS,
    },
  });

  assert.equal(isrCacheControl(response), ISR_MATRIX_PRIVATE_CACHE_CONTROL);
  const keys = metaStore.debugSnapshot().map((record) => record.cacheKey);
  assert.equal(keys.length, 1);
  assert.ok(keys[0]?.startsWith('isr-tenant:v1:'));
});

test('isr: explicit cacheControl callback is honored verbatim for anonymous default-key requests', async () => {
  const { response, writes } = await driveIsrMatrixBranch('miss', {}, {
    cacheControl: () => 'public, max-age=300',
  });

  assert.equal(isrCacheControl(response), 'public, max-age=300');
  // The origin-store write keeps the unchanged framework default; the explicit
  // callback only shapes the emitted response for unguarded requests.
  assertHtmlWritesCacheControl(writes, ISR_MATRIX_PUBLIC_CACHE_CONTROL);
});

test('isr: explicit cacheControl callback cannot override the fail-closed guard', async () => {
  const { response, writes } = await driveIsrMatrixBranch(
    'miss',
    { headers: ISR_MATRIX_AUTH_HEADERS },
    { cacheControl: () => 'public, max-age=300' },
  );

  assert.equal(isrCacheControl(response), ISR_MATRIX_PRIVATE_CACHE_CONTROL);
  assertHtmlWritesCacheControl(writes, ISR_MATRIX_PRIVATE_CACHE_CONTROL);
});

test('isr: explicit cacheControl callback is clamped under a custom key even for anonymous requests', async () => {
  const { response } = await driveIsrMatrixBranch('miss', {}, {
    cacheKey: ({ routePattern }) => `custom::${routePattern}`,
    cacheControl: () => 'public, max-age=300',
  });

  assert.equal(isrCacheControl(response), ISR_MATRIX_PRIVATE_CACHE_CONTROL);
});

test('isr: a private-returning cacheControl callback is preserved verbatim when unguarded', async () => {
  const { response } = await driveIsrMatrixBranch('miss', {}, {
    cacheControl: () => 'private, max-age=5',
  });

  assert.equal(isrCacheControl(response), 'private, max-age=5');
});

test('isr: createIsrRuntime fails closed for auth-variant requests without app wiring', async () => {
  const htmlStore = new RecordingHtmlStore();
  const metaStore = new InMemoryIsrMetaStore();
  const runtime = createIsrRuntime({ htmlStore, metaStore, now: () => 1_000 });

  const face: FaceModule = {
    route: '/direct',
    mode: 'isr',
    revalidateSeconds: ISR_MATRIX_REVALIDATE_SECONDS,
    render: () => ({ html: '<main>direct</main>' }),
  };
  const renderFresh = async (): Promise<FaceResponse> => ({
    status: 200,
    headers: {},
    cookies: [],
    body: encodeBody('<main>direct</main>'),
    isBase64: false,
  });
  const contextFor = (
    headers: Record<string, string[]>,
    cookies: Record<string, string>,
  ): FaceContext => ({
    request: {
      method: 'GET',
      path: '/direct',
      query: {},
      headers,
      cookies,
      body: new Uint8Array(),
      isBase64: false,
      cspNonce: null,
    },
    params: {},
    proxy: null,
  });

  const anonymous = await runtime.handleFace({
    face,
    ctx: contextFor({}, {}),
    routePattern: '/direct',
    renderFresh,
  });
  const authenticated = await runtime.handleFace({
    face,
    ctx: contextFor({ authorization: ['Bearer SECRET_TOKEN_D'] }, {}),
    routePattern: '/direct',
    renderFresh,
  });

  assert.equal(isrCacheControl(anonymous), ISR_MATRIX_PUBLIC_CACHE_CONTROL);
  assert.equal(isrCacheControl(authenticated), ISR_MATRIX_PRIVATE_CACHE_CONTROL);
});

test('isr: guarded responses and stored metadata never carry the raw secret', async () => {
  const secret = 'RAW_SECRET_VALUE_063E';
  const { response, writes } = await driveIsrMatrixBranch('miss', {
    headers: {
      authorization: [`Bearer ${secret}`],
      cookie: [`session=${secret}`],
    },
  });

  const serialized = `${JSON.stringify(response.headers)}\n${JSON.stringify(writes)}`;
  assert.equal(serialized.includes(secret), false);
  assert.equal(isrCacheControl(response), ISR_MATRIX_PRIVATE_CACHE_CONTROL);
});
