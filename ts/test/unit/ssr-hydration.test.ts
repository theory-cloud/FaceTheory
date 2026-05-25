import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  HtmlStore,
  HtmlStoreReadResult,
  HtmlStoreWriteInput,
  HtmlStoreWriteResult,
} from '../../src/isr.js';
import * as core from '../../src/index.js';
import {
  buildSsrHydrationSidecarDataUrl,
  createSsrHydrationSidecarStore,
  serializeSsrHydrationSidecarJson,
  SsrHydrationSidecarError,
} from '../../src/ssr-hydration.js';

const SIGNING_SECRET = 'synthetic unit test signing secret with enough entropy';

class RecordingHtmlStore implements HtmlStore {
  readonly writes: HtmlStoreWriteInput[] = [];
  readonly objects = new Map<
    string,
    { body: Uint8Array; etag: string | null }
  >();

  async read(key: string): Promise<HtmlStoreReadResult | null> {
    const entry = this.objects.get(key);
    if (!entry) return null;
    return {
      body: Uint8Array.from(entry.body),
      ...(entry.etag !== null ? { etag: entry.etag } : {}),
    };
  }

  async write(input: HtmlStoreWriteInput): Promise<HtmlStoreWriteResult> {
    const copy = {
      ...input,
      body: Uint8Array.from(input.body),
      ...(input.metadata ? { metadata: { ...input.metadata } } : {}),
    };
    const etag = `test-etag-${String(this.writes.length + 1)}`;
    this.writes.push(copy);
    this.objects.set(input.key, {
      body: Uint8Array.from(input.body),
      etag,
    });
    return { etag };
  }
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function decodeTokenPayload(token: string): Record<string, unknown> {
  const [payload] = token.split('.');
  assert.ok(payload);
  return JSON.parse(
    Buffer.from(payload, 'base64url').toString('utf8'),
  ) as Record<string, unknown>;
}

function assertSidecarError(reason: string): (error: unknown) => boolean {
  return (error: unknown): boolean =>
    error instanceof SsrHydrationSidecarError && error.reason === reason;
}

test('SSR hydration sidecar store: writes safe JSON and returns a signed expiring URL token', async () => {
  let now = 1_000;
  const htmlStore = new RecordingHtmlStore();
  const store = createSsrHydrationSidecarStore({
    htmlStore,
    signingSecret: SIGNING_SECRET,
    now: () => now,
    ttlSeconds: 30,
    dataUrlPrefix: '/_facetheory/ssr-data',
  });
  const rawAuthInput = 'synthetic-raw-auth-source';
  const written = await store.write({
    data: {
      route: '/account',
      html: '<script>&</script>',
      line: '\u2028\u2029',
    },
    variant: {
      path: '/account',
      query: { tab: ['profile'] },
      auth: rawAuthInput,
      identityPartition: 'synthetic-user-partition',
    },
  });

  assert.equal(htmlStore.writes.length, 1);
  const write = htmlStore.writes[0];
  assert.ok(write);
  assert.equal(write.key, written.key);
  assert.equal(write.contentType, 'application/json; charset=utf-8');
  assert.equal(write.cacheControl, 'no-store');
  assert.equal(
    decodeUtf8(write.body),
    '{"route":"/account","html":"\\u003cscript\\u003e\\u0026\\u003c/script\\u003e","line":"\\u2028\\u2029"}',
  );
  assert.equal(
    written.dataUrl,
    `/_facetheory/ssr-data/${encodeURIComponent(written.token)}`,
  );
  assert.equal(written.issuedAtMs, 1_000);
  assert.equal(written.notBeforeMs, 1_000);
  assert.equal(written.expiresAtMs, 31_000);
  assert.equal(written.etag, 'test-etag-1');

  const tokenPayload = decodeTokenPayload(written.token);
  const storedRecord = JSON.stringify({
    key: written.key,
    metadata: write.metadata,
    tokenPayload,
  });
  assert.equal(storedRecord.includes(rawAuthInput), false);
  assert.equal(storedRecord.includes(SIGNING_SECRET), false);
  assert.equal(written.key.includes(rawAuthInput), false);
  assert.equal(write.metadata?.['facetheory-variant'], written.variantHash);

  now = 2_000;
  const read = await store.read<{ html: string; line: string; route: string }>({
    token: written.token,
    variant: {
      identityPartition: 'synthetic-user-partition',
      auth: rawAuthInput,
      query: { tab: ['profile'] },
      path: '/account',
    },
  });

  assert.deepEqual(read.data, {
    route: '/account',
    html: '<script>&</script>',
    line: '\u2028\u2029',
  });
  assert.equal(read.key, written.key);
  assert.equal(read.variantHash, written.variantHash);
  assert.equal(read.etag, 'test-etag-1');
});

test('SSR hydration sidecar store: rejects tampered tokens', async () => {
  const htmlStore = new RecordingHtmlStore();
  const store = createSsrHydrationSidecarStore({
    htmlStore,
    signingSecret: SIGNING_SECRET,
    now: () => 1_000,
  });
  const written = await store.write({
    data: { route: '/tamper' },
    variant: { path: '/tamper', partition: 'synthetic-reader' },
  });
  const tampered = `${written.token.slice(0, -1)}${written.token.endsWith('A') ? 'B' : 'A'}`;

  await assert.rejects(
    store.read({
      token: tampered,
      variant: { path: '/tamper', partition: 'synthetic-reader' },
    }),
    assertSidecarError('tampered-token'),
  );
});

test('SSR hydration sidecar store: rejects expired and not-yet-valid tokens', async () => {
  let now = 5_000;
  const htmlStore = new RecordingHtmlStore();
  const store = createSsrHydrationSidecarStore({
    htmlStore,
    signingSecret: SIGNING_SECRET,
    now: () => now,
    ttlSeconds: 1,
  });
  const written = await store.write({
    data: { route: '/clock' },
    variant: { path: '/clock' },
  });

  now = 4_999;
  await assert.rejects(
    store.read({ token: written.token, variant: { path: '/clock' } }),
    assertSidecarError('not-yet-valid-token'),
  );

  now = 6_000;
  await assert.rejects(
    store.read({ token: written.token, variant: { path: '/clock' } }),
    assertSidecarError('expired-token'),
  );
});

test('SSR hydration sidecar store: rejects wrong-variant and missing sidecar reads', async () => {
  const firstStore = new RecordingHtmlStore();
  const sidecarStore = createSsrHydrationSidecarStore({
    htmlStore: firstStore,
    signingSecret: SIGNING_SECRET,
    now: () => 1_000,
  });
  const written = await sidecarStore.write({
    data: { route: '/variant' },
    variant: { path: '/variant', locale: 'en-US' },
  });

  await assert.rejects(
    sidecarStore.read({
      token: written.token,
      variant: { path: '/variant', locale: 'fr-FR' },
    }),
    assertSidecarError('wrong-variant'),
  );

  const emptyStore = createSsrHydrationSidecarStore({
    htmlStore: new RecordingHtmlStore(),
    signingSecret: SIGNING_SECRET,
    now: () => 1_500,
  });
  await assert.rejects(
    emptyStore.read({
      token: written.token,
      variant: { path: '/variant', locale: 'en-US' },
    }),
    assertSidecarError('missing-sidecar'),
  );
});

test('SSR hydration sidecar store: detects stored body tampering', async () => {
  const htmlStore = new RecordingHtmlStore();
  const store = createSsrHydrationSidecarStore({
    htmlStore,
    signingSecret: SIGNING_SECRET,
    now: () => 1_000,
  });
  const written = await store.write({
    data: { route: '/body' },
    variant: { path: '/body' },
  });
  htmlStore.objects.set(written.key, {
    body: new TextEncoder().encode('{"route":"/other"}'),
    etag: 'tampered-etag',
  });

  await assert.rejects(
    store.read({ token: written.token, variant: { path: '/body' } }),
    assertSidecarError('tampered-sidecar'),
  );
});

test('SSR hydration sidecar store: rejects malformed tokens and non-serializable top-level payloads', async () => {
  const htmlStore = new RecordingHtmlStore();
  const store = createSsrHydrationSidecarStore({
    htmlStore,
    signingSecret: SIGNING_SECRET,
    now: () => 1_000,
  });

  await assert.rejects(
    store.read({ token: 'not-a-token', variant: { path: '/malformed' } }),
    assertSidecarError('malformed-token'),
  );

  await assert.rejects(
    store.write({ data: undefined, variant: { path: '/undefined' } }),
    /JSON-serializable at the top level/,
  );
  await assert.rejects(
    store.write({ data: () => 'nope', variant: { path: '/function' } }),
    /JSON-serializable at the top level/,
  );
  assert.equal(htmlStore.writes.length, 0);
});

test('SSR hydration sidecar helpers: expose stable public core primitives', () => {
  assert.equal(core.DEFAULT_SSR_HYDRATION_SIDECAR_TTL_SECONDS, 60);
  assert.equal(typeof core.createSsrHydrationSidecarStore, 'function');
  assert.equal(
    serializeSsrHydrationSidecarJson({
      html: '<x>&</x>',
      line: '\u2028\u2029',
    }),
    '{"html":"\\u003cx\\u003e\\u0026\\u003c/x\\u003e","line":"\\u2028\\u2029"}',
  );
  assert.equal(
    buildSsrHydrationSidecarDataUrl('payload.signature', {
      dataUrlPrefix: '_facetheory/ssr-data/',
    }),
    '/_facetheory/ssr-data/payload.signature',
  );
});
