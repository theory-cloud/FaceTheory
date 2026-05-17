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

function externalHydrationHref(html: string): string {
  const tag = /<link\b[^>]*__FACETHEORY_DATA_URL__[^>]*>/i.exec(html)?.[0];
  assert.ok(tag, 'expected external hydration link tag');
  const href = /\bhref="([^"]+)"/i.exec(tag)?.[1];
  assert.ok(href, 'expected external hydration href');
  return href;
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
            const tenant =
              ctx.request.headers['x-tenant-id']?.[0] ?? 'missing';
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
      decodeBody(tenantAHeader.body as Uint8Array).includes(
        'TENANT_SECRET_A',
      ),
      false,
    );
    assert.equal(
      decodeBody(tenantBHeader.body as Uint8Array).includes(
        'TENANT_SECRET_B',
      ),
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
  assert.ok(missHtml.includes('<main>a-1</main>'));
  assert.ok(missHtml.includes('src="/assets/client-entry.js"'));
  assert.equal(missHtml.includes('id="__FACETHEORY_DATA__"'), false);
  assert.equal(missHtml.includes(secret), false);
  assert.match(sidecarHref, /^\/posts\/a\?__facetheory_isr_hydration=/);

  const sidecar = await app.handle({ method: 'GET', path: sidecarHref });
  assert.equal(sidecar.status, 200);
  assert.equal(sidecar.headers['content-type']?.[0], 'application/json; charset=utf-8');
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
  assert.equal(externalHydrationHref(hitHtml), sidecarHref);
  assert.equal(renderCount, 1);

  const serializedMeta = JSON.stringify(metaStore.debugSnapshot());
  assert.equal(serializedMeta.includes(secret), false);
  assert.equal(serializedMeta.includes('terminator'), false);
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
