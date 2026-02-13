import { createHash, randomUUID } from 'node:crypto';

import type { FaceContext, FaceModule, FaceResponse, Headers } from './types.js';
import { canonicalizeHeaders, normalizePath } from './types.js';

const HTML_CONTENT_TYPE = 'text/html; charset=utf-8';
const DEFAULT_REVALIDATE_SECONDS = 60;
const DEFAULT_LEASE_DURATION_MS = 5_000;
const DEFAULT_REGEN_WAIT_TIMEOUT_MS = 7_000;
const DEFAULT_REGEN_POLL_INTERVAL_MS = 25;

export type IsrFailurePolicy = 'serve-stale' | 'error';
export type IsrLockContentionPolicy = 'wait' | 'serve-stale';
export type IsrCacheState = 'miss' | 'hit' | 'stale' | 'wait-hit';

export interface HtmlStoreWriteInput {
  key: string;
  body: Uint8Array;
  contentType?: string;
  cacheControl?: string | null;
  metadata?: Record<string, string>;
}

export interface HtmlStoreWriteResult {
  etag?: string | null;
}

export interface HtmlStoreReadResult {
  body: Uint8Array;
  etag?: string | null;
}

export interface HtmlStore {
  read: (key: string) => Promise<HtmlStoreReadResult | null>;
  write: (input: HtmlStoreWriteInput) => Promise<HtmlStoreWriteResult>;
}

export interface IsrMetaRecord {
  cacheKey: string;
  htmlPointer: string | null;
  generatedAt: number;
  revalidateSeconds: number;
  status: number;
  contentType: string;
  etag: string | null;
  leaseOwner: string | null;
  leaseToken: string | null;
  leaseExpiresAt: number;
}

export interface TryAcquireIsrLeaseInput {
  cacheKey: string;
  leaseOwner: string;
  nowMs: number;
  leaseDurationMs: number;
  fallbackRevalidateSeconds: number;
}

export interface TryAcquireIsrLeaseResult {
  acquired: boolean;
  record: IsrMetaRecord;
  leaseToken: string | null;
}

export interface CommitIsrGenerationInput {
  cacheKey: string;
  leaseOwner: string;
  leaseToken: string;
  htmlPointer: string;
  generatedAt: number;
  revalidateSeconds: number;
  status: number;
  contentType: string;
  etag?: string | null;
}

export interface ReleaseIsrLeaseInput {
  cacheKey: string;
  leaseOwner: string;
  leaseToken: string;
}

export interface IsrMetaStore {
  get: (cacheKey: string) => Promise<IsrMetaRecord | null>;
  tryAcquireLease: (input: TryAcquireIsrLeaseInput) => Promise<TryAcquireIsrLeaseResult>;
  commitGeneration: (input: CommitIsrGenerationInput) => Promise<void>;
  releaseLease: (input: ReleaseIsrLeaseInput) => Promise<void>;
}

export interface IsrCacheKeyInput {
  tenant: string;
  routePattern: string;
  params: Record<string, string>;
}

export interface IsrCacheControlOptions {
  browserMaxAgeSeconds?: number;
  sharedMaxAgeSeconds?: number;
  staleIfErrorSeconds?: number;
}

export interface IsrCacheHeaderInput {
  revalidateSeconds: number;
  state: IsrCacheState;
  isFresh: boolean;
}

export interface HandleIsrFaceInput {
  face: FaceModule;
  ctx: FaceContext;
  routePattern: string;
  renderFresh: () => Promise<FaceResponse>;
}

export interface IsrRuntime {
  handleFace: (input: HandleIsrFaceInput) => Promise<FaceResponse>;
}

export interface FaceIsrOptions {
  htmlStore?: HtmlStore;
  metaStore?: IsrMetaStore;
  now?: () => number;
  createLeaseOwner?: () => string;
  leaseDurationMs?: number;
  regenerationWaitTimeoutMs?: number;
  regenerationPollIntervalMs?: number;
  failurePolicy?: IsrFailurePolicy;
  lockContentionPolicy?: IsrLockContentionPolicy;
  tenantKey?: (ctx: FaceContext) => string | null | undefined;
  cacheKey?: (input: IsrCacheKeyInput) => string;
  htmlPointerPrefix?: string;
  cacheControl?: (input: IsrCacheHeaderInput) => string;
}

interface CreateIsrRuntimeOptions {
  htmlStore: HtmlStore;
  metaStore: IsrMetaStore;
  now: () => number;
  createLeaseOwner: () => string;
  leaseDurationMs: number;
  regenerationWaitTimeoutMs: number;
  regenerationPollIntervalMs: number;
  failurePolicy: IsrFailurePolicy;
  lockContentionPolicy: IsrLockContentionPolicy;
  tenantKey: (ctx: FaceContext) => string | null | undefined;
  cacheKey: (input: IsrCacheKeyInput) => string;
  htmlPointerPrefix: string;
  cacheControl: (input: IsrCacheHeaderInput) => string;
}

interface PreparedFreshResponse {
  body: Uint8Array;
  status: number;
  contentType: string;
  etag: string | null;
}

class IsrLeaseConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IsrLeaseConflictError';
  }
}

export class InMemoryHtmlStore implements HtmlStore {
  private readonly objects = new Map<string, { body: Uint8Array; etag: string | null }>();

  async read(key: string): Promise<HtmlStoreReadResult | null> {
    const entry = this.objects.get(key);
    if (!entry) return null;
    return {
      body: Uint8Array.from(entry.body),
      ...(entry.etag !== null ? { etag: entry.etag } : {}),
    };
  }

  async write(input: HtmlStoreWriteInput): Promise<HtmlStoreWriteResult> {
    const etag = `W/"${createHash('sha1').update(input.body).digest('hex')}"`;
    this.objects.set(input.key, {
      body: Uint8Array.from(input.body),
      etag,
    });
    return { etag };
  }
}

export class InMemoryIsrMetaStore implements IsrMetaStore {
  private readonly records = new Map<string, IsrMetaRecord>();

  async get(cacheKey: string): Promise<IsrMetaRecord | null> {
    const record = this.records.get(cacheKey);
    return record ? cloneIsrMetaRecord(record) : null;
  }

  async tryAcquireLease(input: TryAcquireIsrLeaseInput): Promise<TryAcquireIsrLeaseResult> {
    const current = this.records.get(input.cacheKey) ?? createDefaultMetaRecord(input.cacheKey);
    const hasActiveLease =
      current.leaseToken !== null &&
      current.leaseOwner !== null &&
      current.leaseExpiresAt > input.nowMs &&
      current.leaseOwner !== input.leaseOwner;

    if (hasActiveLease) {
      return {
        acquired: false,
        record: cloneIsrMetaRecord(current),
        leaseToken: null,
      };
    }

    const leaseToken = randomUUID();
    const next: IsrMetaRecord = {
      ...current,
      revalidateSeconds:
        current.revalidateSeconds > 0
          ? current.revalidateSeconds
          : normalizeRevalidateSeconds(input.fallbackRevalidateSeconds),
      leaseOwner: input.leaseOwner,
      leaseToken,
      leaseExpiresAt: input.nowMs + input.leaseDurationMs,
    };
    this.records.set(input.cacheKey, next);

    return {
      acquired: true,
      record: cloneIsrMetaRecord(next),
      leaseToken,
    };
  }

  async commitGeneration(input: CommitIsrGenerationInput): Promise<void> {
    const current = this.records.get(input.cacheKey);
    if (
      !current ||
      current.leaseOwner !== input.leaseOwner ||
      current.leaseToken !== input.leaseToken
    ) {
      throw new IsrLeaseConflictError(`ISR lease lost for cache key "${input.cacheKey}"`);
    }

    const next: IsrMetaRecord = {
      ...current,
      htmlPointer: input.htmlPointer,
      generatedAt: input.generatedAt,
      revalidateSeconds: normalizeRevalidateSeconds(input.revalidateSeconds),
      status: normalizeStatus(input.status),
      contentType: normalizeContentType(input.contentType),
      etag: input.etag ?? null,
      leaseOwner: null,
      leaseToken: null,
      leaseExpiresAt: 0,
    };

    this.records.set(input.cacheKey, next);
  }

  async releaseLease(input: ReleaseIsrLeaseInput): Promise<void> {
    const current = this.records.get(input.cacheKey);
    if (!current) return;
    if (current.leaseOwner !== input.leaseOwner || current.leaseToken !== input.leaseToken) return;

    this.records.set(input.cacheKey, {
      ...current,
      leaseOwner: null,
      leaseToken: null,
      leaseExpiresAt: 0,
    });
  }

  debugSnapshot(): IsrMetaRecord[] {
    return Array.from(this.records.values())
      .map((record) => cloneIsrMetaRecord(record))
      .sort((left, right) => left.cacheKey.localeCompare(right.cacheKey));
  }
}

export interface S3HtmlStoreClient {
  getObject: (input: { bucket: string; key: string }) => Promise<{
    body: Uint8Array | string | AsyncIterable<Uint8Array> | null;
    etag?: string | null;
  } | null>;
  putObject: (input: {
    bucket: string;
    key: string;
    body: Uint8Array;
    contentType: string;
    cacheControl?: string;
    metadata?: Record<string, string>;
  }) => Promise<{ etag?: string | null }>;
}

export interface S3HtmlStoreOptions {
  client: S3HtmlStoreClient;
  bucket: string;
  keyPrefix?: string;
}

export class S3HtmlStore implements HtmlStore {
  private readonly client: S3HtmlStoreClient;
  private readonly bucket: string;
  private readonly keyPrefix: string;

  constructor(options: S3HtmlStoreOptions) {
    this.client = options.client;
    this.bucket = options.bucket;
    this.keyPrefix = normalizeObjectPrefix(options.keyPrefix ?? '');
  }

  async read(key: string): Promise<HtmlStoreReadResult | null> {
    const output = await this.client.getObject({
      bucket: this.bucket,
      key: this.objectKey(key),
    });
    if (!output) return null;
    if (output.body === null) return null;

    const body = await toUint8Array(output.body);
    return {
      body,
      ...(output.etag !== undefined ? { etag: output.etag ?? null } : {}),
    };
  }

  async write(input: HtmlStoreWriteInput): Promise<HtmlStoreWriteResult> {
    const output = await this.client.putObject({
      bucket: this.bucket,
      key: this.objectKey(input.key),
      body: Uint8Array.from(input.body),
      contentType: normalizeContentType(input.contentType),
      ...(input.cacheControl ? { cacheControl: input.cacheControl } : {}),
      ...(input.metadata ? { metadata: { ...input.metadata } } : {}),
    });

    return {
      ...(output.etag !== undefined ? { etag: output.etag ?? null } : {}),
    };
  }

  private objectKey(key: string): string {
    return this.keyPrefix.length > 0 ? `${this.keyPrefix}${stripLeadingSlash(key)}` : stripLeadingSlash(key);
  }
}

export interface DynamoDbIsrMetaItem {
  cacheKey: string;
  htmlPointer: string | null;
  generatedAt: number;
  revalidateSeconds: number;
  status: number;
  contentType: string;
  etag: string | null;
  leaseOwner: string | null;
  leaseToken: string | null;
  leaseExpiresAt: number;
}

export interface DynamoDbIsrMetaClient {
  getItem: (input: {
    tableName: string;
    cacheKey: string;
  }) => Promise<DynamoDbIsrMetaItem | null>;
  putItemIfLeaseAvailable: (input: {
    tableName: string;
    item: DynamoDbIsrMetaItem;
    nowMs: number;
  }) => Promise<boolean>;
  updateItemIfLeaseMatches: (input: {
    tableName: string;
    cacheKey: string;
    leaseOwner: string;
    leaseToken: string;
    item: DynamoDbIsrMetaItem;
  }) => Promise<boolean>;
  clearLeaseIfMatches: (input: {
    tableName: string;
    cacheKey: string;
    leaseOwner: string;
    leaseToken: string;
  }) => Promise<void>;
}

export interface DynamoDbIsrMetaStoreOptions {
  client: DynamoDbIsrMetaClient;
  tableName: string;
}

export class DynamoDbIsrMetaStore implements IsrMetaStore {
  private readonly client: DynamoDbIsrMetaClient;
  private readonly tableName: string;

  constructor(options: DynamoDbIsrMetaStoreOptions) {
    this.client = options.client;
    this.tableName = options.tableName;
  }

  async get(cacheKey: string): Promise<IsrMetaRecord | null> {
    const item = await this.client.getItem({
      tableName: this.tableName,
      cacheKey,
    });
    if (!item) return null;
    return dynamoItemToIsrMetaRecord(item, cacheKey);
  }

  async tryAcquireLease(input: TryAcquireIsrLeaseInput): Promise<TryAcquireIsrLeaseResult> {
    const existing =
      (await this.get(input.cacheKey)) ?? createDefaultMetaRecord(input.cacheKey, input.fallbackRevalidateSeconds);
    const leaseToken = randomUUID();
    const next: IsrMetaRecord = {
      ...existing,
      revalidateSeconds:
        existing.revalidateSeconds > 0
          ? existing.revalidateSeconds
          : normalizeRevalidateSeconds(input.fallbackRevalidateSeconds),
      leaseOwner: input.leaseOwner,
      leaseToken,
      leaseExpiresAt: input.nowMs + input.leaseDurationMs,
    };

    const acquired = await this.client.putItemIfLeaseAvailable({
      tableName: this.tableName,
      item: isrMetaRecordToDynamoItem(next),
      nowMs: input.nowMs,
    });

    if (!acquired) {
      const current =
        (await this.get(input.cacheKey)) ??
        createDefaultMetaRecord(input.cacheKey, input.fallbackRevalidateSeconds);
      return {
        acquired: false,
        record: current,
        leaseToken: null,
      };
    }

    return {
      acquired: true,
      record: next,
      leaseToken,
    };
  }

  async commitGeneration(input: CommitIsrGenerationInput): Promise<void> {
    const existing = await this.get(input.cacheKey);
    if (!existing) {
      throw new IsrLeaseConflictError(`ISR lease lost for cache key "${input.cacheKey}"`);
    }

    const next: IsrMetaRecord = {
      ...existing,
      htmlPointer: input.htmlPointer,
      generatedAt: input.generatedAt,
      revalidateSeconds: normalizeRevalidateSeconds(input.revalidateSeconds),
      status: normalizeStatus(input.status),
      contentType: normalizeContentType(input.contentType),
      etag: input.etag ?? null,
      leaseOwner: null,
      leaseToken: null,
      leaseExpiresAt: 0,
    };

    const committed = await this.client.updateItemIfLeaseMatches({
      tableName: this.tableName,
      cacheKey: input.cacheKey,
      leaseOwner: input.leaseOwner,
      leaseToken: input.leaseToken,
      item: isrMetaRecordToDynamoItem(next),
    });

    if (!committed) {
      throw new IsrLeaseConflictError(`ISR lease lost for cache key "${input.cacheKey}"`);
    }
  }

  async releaseLease(input: ReleaseIsrLeaseInput): Promise<void> {
    await this.client.clearLeaseIfMatches({
      tableName: this.tableName,
      cacheKey: input.cacheKey,
      leaseOwner: input.leaseOwner,
      leaseToken: input.leaseToken,
    });
  }
}

export function isrMetaRecordToDynamoItem(record: IsrMetaRecord): DynamoDbIsrMetaItem {
  return {
    cacheKey: record.cacheKey,
    htmlPointer: record.htmlPointer,
    generatedAt: record.generatedAt,
    revalidateSeconds: normalizeRevalidateSeconds(record.revalidateSeconds),
    status: normalizeStatus(record.status),
    contentType: normalizeContentType(record.contentType),
    etag: record.etag ?? null,
    leaseOwner: record.leaseOwner ?? null,
    leaseToken: record.leaseToken ?? null,
    leaseExpiresAt: Math.max(0, Math.trunc(record.leaseExpiresAt)),
  };
}

export function dynamoItemToIsrMetaRecord(
  item: DynamoDbIsrMetaItem,
  cacheKey = item.cacheKey,
): IsrMetaRecord {
  return {
    cacheKey,
    htmlPointer: item.htmlPointer ?? null,
    generatedAt: Math.max(0, Math.trunc(item.generatedAt)),
    revalidateSeconds: normalizeRevalidateSeconds(item.revalidateSeconds),
    status: normalizeStatus(item.status),
    contentType: normalizeContentType(item.contentType),
    etag: item.etag ?? null,
    leaseOwner: item.leaseOwner ?? null,
    leaseToken: item.leaseToken ?? null,
    leaseExpiresAt: Math.max(0, Math.trunc(item.leaseExpiresAt)),
  };
}

export function createIsrRuntime(options: FaceIsrOptions): IsrRuntime {
  const runtimeOptions = normalizeRuntimeOptions(options);
  return {
    handleFace: async (input) => {
      const revalidateSeconds = normalizeRevalidateSeconds(input.face.revalidateSeconds);
      const tenant = resolveTenant(runtimeOptions, input.ctx);
      const cacheKey = runtimeOptions.cacheKey({
        tenant,
        routePattern: normalizePath(input.routePattern),
        params: input.ctx.params,
      });
      const currentNow = runtimeOptions.now();
      const existing = await runtimeOptions.metaStore.get(cacheKey);

      if (existing && isFresh(existing, currentNow)) {
        const cachedFresh = await cachedResponseFromRecord(runtimeOptions, existing, 'hit', currentNow, false);
        if (cachedFresh) return cachedFresh;
      }

      const leaseOwner = runtimeOptions.createLeaseOwner();
      const acquire = await runtimeOptions.metaStore.tryAcquireLease({
        cacheKey,
        leaseOwner,
        nowMs: currentNow,
        leaseDurationMs: runtimeOptions.leaseDurationMs,
        fallbackRevalidateSeconds: revalidateSeconds,
      });

      if (acquire.acquired && acquire.leaseToken) {
        return regenerateAndCommit(
          runtimeOptions,
          input,
          cacheKey,
          leaseOwner,
          acquire.leaseToken,
          revalidateSeconds,
          existing ?? acquire.record,
        );
      }

      const staleRecord = existing ?? acquire.record;
      if (runtimeOptions.lockContentionPolicy === 'wait') {
        const deadline = runtimeOptions.now() + runtimeOptions.regenerationWaitTimeoutMs;
        const waited = await waitForRegeneratedRecord(
          runtimeOptions,
          cacheKey,
          staleRecord.generatedAt,
          deadline,
        );
        if (waited) {
          const cached = await cachedResponseFromRecord(
            runtimeOptions,
            waited,
            'wait-hit',
            runtimeOptions.now(),
            true,
          );
          if (cached) return cached;
        }
      }

      const retryAcquire = await runtimeOptions.metaStore.tryAcquireLease({
        cacheKey,
        leaseOwner,
        nowMs: runtimeOptions.now(),
        leaseDurationMs: runtimeOptions.leaseDurationMs,
        fallbackRevalidateSeconds: revalidateSeconds,
      });
      if (retryAcquire.acquired && retryAcquire.leaseToken) {
        return regenerateAndCommit(
          runtimeOptions,
          input,
          cacheKey,
          leaseOwner,
          retryAcquire.leaseToken,
          revalidateSeconds,
          staleRecord,
        );
      }

      if (
        runtimeOptions.lockContentionPolicy === 'serve-stale' ||
        runtimeOptions.failurePolicy === 'serve-stale'
      ) {
        const stale = await cachedResponseFromRecord(
          runtimeOptions,
          staleRecord,
          'stale',
          runtimeOptions.now(),
          true,
        );
        if (stale) return stale;
      }

      throw new Error(`ISR regeneration lock is busy for key "${cacheKey}"`);
    },
  };
}

export function defaultIsrCacheKey(input: IsrCacheKeyInput): string {
  const routePattern = normalizePath(input.routePattern);
  const paramParts = Object.keys(input.params)
    .sort((left, right) => left.localeCompare(right))
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(input.params[key]))}`);
  return `${input.tenant}::${routePattern}?${paramParts.join('&')}`;
}

export function blockingIsrCacheControl(
  revalidateSeconds: number,
  options: IsrCacheControlOptions = {},
): string {
  const safeRevalidate = normalizeRevalidateSeconds(revalidateSeconds);
  const browserMaxAge = normalizeNonNegativeInt(options.browserMaxAgeSeconds, 0);
  const sharedMaxAge = normalizeNonNegativeInt(options.sharedMaxAgeSeconds, 0);
  const staleIfError = normalizeNonNegativeInt(options.staleIfErrorSeconds, safeRevalidate);
  return `public, max-age=${browserMaxAge}, s-maxage=${sharedMaxAge}, stale-if-error=${staleIfError}, must-revalidate`;
}

export function isFresh(record: IsrMetaRecord, nowMs: number): boolean {
  if (!record.htmlPointer) return false;
  return nowMs < record.generatedAt + record.revalidateSeconds * 1_000;
}

async function regenerateAndCommit(
  runtimeOptions: CreateIsrRuntimeOptions,
  input: HandleIsrFaceInput,
  cacheKey: string,
  leaseOwner: string,
  leaseToken: string,
  revalidateSeconds: number,
  staleRecord: IsrMetaRecord,
): Promise<FaceResponse> {
  const generatedAt = runtimeOptions.now();
  try {
    const prepared = await prepareFreshResponse(await input.renderFresh());
    if (prepared.status >= 500) {
      throw new Error(`ISR regeneration produced status ${prepared.status}`);
    }

    const htmlPointer = buildHtmlPointer(cacheKey, generatedAt, runtimeOptions.htmlPointerPrefix);
    const write = await runtimeOptions.htmlStore.write({
      key: htmlPointer,
      body: prepared.body,
      contentType: prepared.contentType,
      cacheControl: blockingIsrCacheControl(revalidateSeconds),
    });
    const etag = prepared.etag ?? write.etag ?? null;

    await runtimeOptions.metaStore.commitGeneration({
      cacheKey,
      leaseOwner,
      leaseToken,
      htmlPointer,
      generatedAt,
      revalidateSeconds,
      status: prepared.status,
      contentType: prepared.contentType,
      ...(etag !== null ? { etag } : {}),
    });

    return responseFromStoredHtml(
      runtimeOptions,
      {
        ...createDefaultMetaRecord(cacheKey, revalidateSeconds),
        htmlPointer,
        generatedAt,
        status: prepared.status,
        contentType: prepared.contentType,
        etag,
      },
      prepared.body,
      'miss',
      runtimeOptions.now(),
    );
  } catch (err) {
    if (runtimeOptions.failurePolicy === 'serve-stale') {
      const stale = await cachedResponseFromRecord(runtimeOptions, staleRecord, 'stale', runtimeOptions.now(), true);
      if (stale) return stale;
    }
    throw err;
  } finally {
    await runtimeOptions.metaStore.releaseLease({
      cacheKey,
      leaseOwner,
      leaseToken,
    });
  }
}

async function waitForRegeneratedRecord(
  runtimeOptions: CreateIsrRuntimeOptions,
  cacheKey: string,
  previousGeneratedAt: number,
  deadlineMs: number,
): Promise<IsrMetaRecord | null> {
  for (;;) {
    const nowMs = runtimeOptions.now();
    if (nowMs >= deadlineMs) return null;

    await sleep(runtimeOptions.regenerationPollIntervalMs);

    const record = await runtimeOptions.metaStore.get(cacheKey);
    if (!record) continue;
    if (!record.htmlPointer) continue;
    if (record.generatedAt > previousGeneratedAt) return record;
    if (isFresh(record, runtimeOptions.now())) return record;
  }
}

async function cachedResponseFromRecord(
  runtimeOptions: CreateIsrRuntimeOptions,
  record: IsrMetaRecord,
  state: IsrCacheState,
  nowMs: number,
  allowStale: boolean,
): Promise<FaceResponse | null> {
  if (!record.htmlPointer) return null;
  if (!allowStale && !isFresh(record, nowMs)) return null;

  const html = await runtimeOptions.htmlStore.read(record.htmlPointer);
  if (!html) return null;

  const body = Uint8Array.from(html.body);
  return responseFromStoredHtml(runtimeOptions, record, body, state, nowMs);
}

function responseFromStoredHtml(
  runtimeOptions: CreateIsrRuntimeOptions,
  record: IsrMetaRecord,
  body: Uint8Array,
  state: IsrCacheState,
  nowMs: number,
): FaceResponse {
  const contentType = normalizeContentType(record.contentType);
  const isRecordFresh = isFresh(record, nowMs);
  const headers: Headers = {
    'cache-control': [
      runtimeOptions.cacheControl({
        revalidateSeconds: record.revalidateSeconds,
        state,
        isFresh: isRecordFresh,
      }),
    ],
    'content-type': [contentType],
    'x-facetheory-isr': [state],
  };

  if (record.etag) {
    headers.etag = [record.etag];
  }

  return {
    status: normalizeStatus(record.status),
    headers: sortHeaders(headers),
    cookies: [],
    body,
    isBase64: false,
  };
}

function normalizeRuntimeOptions(input: FaceIsrOptions): CreateIsrRuntimeOptions {
  const htmlStore = input.htmlStore ?? new InMemoryHtmlStore();
  const metaStore = input.metaStore ?? new InMemoryIsrMetaStore();

  return {
    htmlStore,
    metaStore,
    now: input.now ?? (() => Date.now()),
    createLeaseOwner: input.createLeaseOwner ?? (() => randomUUID()),
    leaseDurationMs: normalizeNonNegativeInt(input.leaseDurationMs, DEFAULT_LEASE_DURATION_MS),
    regenerationWaitTimeoutMs: normalizeNonNegativeInt(
      input.regenerationWaitTimeoutMs,
      DEFAULT_REGEN_WAIT_TIMEOUT_MS,
    ),
    regenerationPollIntervalMs: Math.max(
      1,
      normalizeNonNegativeInt(input.regenerationPollIntervalMs, DEFAULT_REGEN_POLL_INTERVAL_MS),
    ),
    failurePolicy: input.failurePolicy ?? 'serve-stale',
    lockContentionPolicy: input.lockContentionPolicy ?? 'wait',
    tenantKey: input.tenantKey ?? defaultTenantKey,
    cacheKey: input.cacheKey ?? defaultIsrCacheKey,
    htmlPointerPrefix: normalizeObjectPrefix(input.htmlPointerPrefix ?? 'isr'),
    cacheControl:
      input.cacheControl ??
      ((options) => blockingIsrCacheControl(options.revalidateSeconds)),
  };
}

function resolveTenant(runtimeOptions: CreateIsrRuntimeOptions, ctx: FaceContext): string {
  const rawTenant = runtimeOptions.tenantKey(ctx);
  const tenant = String(rawTenant ?? '').trim();
  return tenant.length > 0 ? tenant : 'default';
}

function defaultTenantKey(ctx: FaceContext): string {
  const values = ctx.request.headers['x-facetheory-tenant'] ?? [];
  const first = values[0] ?? '';
  return String(first).trim() || 'default';
}

function buildHtmlPointer(cacheKey: string, generatedAt: number, prefix: string): string {
  const digest = createHash('sha256').update(cacheKey).digest('hex').slice(0, 24);
  return `${prefix}${digest}/${generatedAt}-${randomUUID()}.html`;
}

function createDefaultMetaRecord(
  cacheKey: string,
  revalidateSeconds = DEFAULT_REVALIDATE_SECONDS,
): IsrMetaRecord {
  return {
    cacheKey,
    htmlPointer: null,
    generatedAt: 0,
    revalidateSeconds: normalizeRevalidateSeconds(revalidateSeconds),
    status: 200,
    contentType: HTML_CONTENT_TYPE,
    etag: null,
    leaseOwner: null,
    leaseToken: null,
    leaseExpiresAt: 0,
  };
}

function cloneIsrMetaRecord(record: IsrMetaRecord): IsrMetaRecord {
  return { ...record };
}

function sortHeaders(headers: Headers): Headers {
  const canonical = canonicalizeHeaders(headers);
  const out: Headers = {};
  for (const key of Object.keys(canonical).sort()) {
    out[key] = [...(canonical[key] ?? [])];
  }
  return out;
}

function normalizeContentType(value: string | null | undefined): string {
  const normalized = String(value ?? '').trim();
  return normalized.length > 0 ? normalized : HTML_CONTENT_TYPE;
}

function normalizeStatus(value: number): number {
  const int = Math.trunc(Number(value));
  if (!Number.isFinite(int) || int < 100 || int > 599) return 200;
  return int;
}

function normalizeRevalidateSeconds(value: number | undefined): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_REVALIDATE_SECONDS;
  return Math.max(0, numeric);
}

function normalizeNonNegativeInt(value: number | undefined, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.trunc(numeric));
}

function normalizeObjectPrefix(value: string): string {
  const cleaned = String(value).trim().replace(/^\/+/, '').replace(/\/+$/, '');
  if (!cleaned) return '';
  return `${cleaned}/`;
}

function stripLeadingSlash(value: string): string {
  return String(value).replace(/^\/+/, '');
}

async function prepareFreshResponse(response: FaceResponse): Promise<PreparedFreshResponse> {
  if (response.isBase64) {
    throw new Error('ISR does not support FaceResponse.isBase64=true');
  }

  const headers = canonicalizeHeaders(response.headers);
  const status = normalizeStatus(response.status);
  const contentType = normalizeContentType(firstHeaderValue(headers, 'content-type'));
  const etag = firstHeaderValue(headers, 'etag');
  const body = await collectBody(response.body);

  return {
    body,
    status,
    contentType,
    etag,
  };
}

function firstHeaderValue(headers: Headers, key: string): string | null {
  const values = headers[key.toLowerCase()] ?? [];
  if (!values.length) return null;
  const first = values[0];
  return first === undefined ? null : String(first);
}

async function collectBody(
  body: FaceResponse['body'],
): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body;

  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of body) {
    chunks.push(chunk);
    total += chunk.length;
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

async function toUint8Array(
  input: Uint8Array | string | AsyncIterable<Uint8Array>,
): Promise<Uint8Array> {
  if (input instanceof Uint8Array) return Uint8Array.from(input);
  if (typeof input === 'string') {
    return new TextEncoder().encode(input);
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of input) {
    const normalizedChunk = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    chunks.push(normalizedChunk);
    total += normalizedChunk.length;
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
