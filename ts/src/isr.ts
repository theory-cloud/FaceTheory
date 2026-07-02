import { createHash, randomUUID } from 'node:crypto';

import { utf8 } from './bytes.js';
import { safeJson } from './html.js';
import {
  reportFaceError,
  type FaceObservabilityHooks,
} from './ops.js';
import {
  requiresStrictCspDocumentValidation,
  validateStrictCspDocument,
} from './security.js';
import type {
  CookieMap,
  FaceCspPolicy,
  FaceContext,
  FaceModule,
  FaceResponse,
  Headers,
  Query,
} from './types.js';
import {
  canonicalizeHeaders,
  normalizePath,
  trimLeadingSlashes,
  trimOuterSlashes,
} from './types.js';

const HTML_CONTENT_TYPE = 'text/html; charset=utf-8';
const DEFAULT_REVALIDATE_SECONDS = 60;
const DEFAULT_LEASE_DURATION_MS = 5_000;
const DEFAULT_REGEN_WAIT_TIMEOUT_MS = 7_000;
const DEFAULT_REGEN_POLL_INTERVAL_MS = 25;
const DEFAULT_AUTH_VARY_HEADERS = [
  'authorization',
  'proxy-authorization',
  'x-api-key',
  'x-amz-security-token',
] as const;
const DEFAULT_TENANT_BOUNDARY_HEADERS = [
  'x-tenant-id',
  'x-facetheory-tenant',
] as const;
const ISR_HYDRATION_QUERY_PARAM = '__facetheory_isr_hydration';
const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';
const HYDRATION_SIDECAR_CACHE_CONTROL = 'no-store';
const ISR_HTML_METADATA_CONTENT_SECURITY_POLICY =
  'facetheory-content-security-policy';
const ISR_HTML_METADATA_STATUS = 'facetheory-status';
const ISR_HTML_METADATA_CONTENT_TYPE = 'facetheory-content-type';
const ISR_STATE_STALE_METADATA_ERROR = 'stale-metadata-error';
const DEFAULT_LAST_KNOWN_ISR_RECORD_LIMIT = 128;

export type IsrFailurePolicy = 'serve-stale' | 'error';
export type IsrLockContentionPolicy = 'wait' | 'serve-stale';
export type IsrCacheState =
  | 'miss'
  | 'hit'
  | 'stale'
  | 'wait-hit'
  | typeof ISR_STATE_STALE_METADATA_ERROR;

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
  metadata?: Record<string, string>;
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
  contentSecurityPolicy?: string | null;
  strictCspPolicy?: IsrCachedStrictCspPolicy | null;
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
  contentSecurityPolicy?: string | null;
  strictCspPolicy?: IsrCachedStrictCspPolicy | null;
  etag?: string | null;
}

export interface ReleaseIsrLeaseInput {
  cacheKey: string;
  leaseOwner: string;
  leaseToken: string;
}

export interface IsrMetaStore {
  get: (cacheKey: string) => Promise<IsrMetaRecord | null>;
  tryAcquireLease: (
    input: TryAcquireIsrLeaseInput,
  ) => Promise<TryAcquireIsrLeaseResult>;
  commitGeneration: (input: CommitIsrGenerationInput) => Promise<void>;
  releaseLease: (input: ReleaseIsrLeaseInput) => Promise<void>;
}

export interface IsrCacheKeyInput {
  tenant: string;
  routePattern: string;
  params: Record<string, string>;
  query: Query;
  headers?: Headers;
  cookies?: CookieMap;
  varyCookies?: readonly string[];
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
  renderFresh: (options?: IsrRenderFreshOptions) => Promise<FaceResponse>;
}

export interface IsrHydrationSidecar {
  data: unknown;
  dataUrl: string;
}

export interface IsrRenderFreshOptions {
  strictExternalHydrationDataUrl?: string;
  onHydrationSidecar?: (sidecar: IsrHydrationSidecar) => void;
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
  varyCookies?: string[];
  htmlPointerPrefix?: string;
  cacheControl?: (input: IsrCacheHeaderInput) => string;
  observability?: FaceObservabilityHooks | null;
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
  hasExplicitTenantKey: boolean;
  cacheKey: (input: IsrCacheKeyInput) => string;
  hasExplicitCacheKey: boolean;
  varyCookies: readonly string[] | null;
  tenantBoundaryHeaders: readonly string[];
  htmlPointerPrefix: string;
  cacheControl: (input: IsrCacheHeaderInput) => string;
  observability: FaceObservabilityHooks | null;
}

interface PreparedFreshResponse {
  body: Uint8Array;
  status: number;
  contentType: string;
  contentSecurityPolicy: string | null;
  strictCspPolicy: IsrCachedStrictCspPolicy | null;
  etag: string | null;
}

export interface IsrCachedStrictCspPolicy {
  inlineScripts?: false | undefined;
  inlineStyles?: false | undefined;
}

class IsrLeaseConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IsrLeaseConflictError';
  }
}

export class InMemoryHtmlStore implements HtmlStore {
  private readonly objects = new Map<
    string,
    {
      body: Uint8Array;
      etag: string | null;
      metadata: Record<string, string> | null;
    }
  >();

  async read(key: string): Promise<HtmlStoreReadResult | null> {
    const entry = this.objects.get(key);
    if (!entry) return null;
    return {
      body: Uint8Array.from(entry.body),
      ...(entry.etag !== null ? { etag: entry.etag } : {}),
      ...(entry.metadata !== null ? { metadata: { ...entry.metadata } } : {}),
    };
  }

  async write(input: HtmlStoreWriteInput): Promise<HtmlStoreWriteResult> {
    const etag = `W/"${createHash('sha1').update(input.body).digest('hex')}"`;
    this.objects.set(input.key, {
      body: Uint8Array.from(input.body),
      etag,
      metadata: input.metadata ? { ...input.metadata } : null,
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

  async tryAcquireLease(
    input: TryAcquireIsrLeaseInput,
  ): Promise<TryAcquireIsrLeaseResult> {
    const current =
      this.records.get(input.cacheKey) ??
      createDefaultMetaRecord(input.cacheKey);
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
      throw new IsrLeaseConflictError(
        `ISR lease lost for cache key "${input.cacheKey}"`,
      );
    }

    const next: IsrMetaRecord = {
      ...current,
      htmlPointer: input.htmlPointer,
      generatedAt: input.generatedAt,
      revalidateSeconds: normalizeRevalidateSeconds(input.revalidateSeconds),
      status: normalizeStatus(input.status),
      contentType: normalizeContentType(input.contentType),
      contentSecurityPolicy: input.contentSecurityPolicy ?? null,
      strictCspPolicy: input.strictCspPolicy ?? null,
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
    if (
      current.leaseOwner !== input.leaseOwner ||
      current.leaseToken !== input.leaseToken
    )
      return;

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
    metadata?: Record<string, string>;
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
      ...(output.metadata ? { metadata: { ...output.metadata } } : {}),
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
    return this.keyPrefix.length > 0
      ? `${this.keyPrefix}${stripLeadingSlash(key)}`
      : stripLeadingSlash(key);
  }
}

export function createIsrRuntime(options: FaceIsrOptions): IsrRuntime {
  const runtimeOptions = normalizeRuntimeOptions(options);
  const lastKnownRecords = new Map<string, IsrMetaRecord>();
  const rememberRecord = (record: IsrMetaRecord | null): void => {
    rememberLastKnownRecord(lastKnownRecords, record);
  };
  const lastKnownRecord = (cacheKey: string): IsrMetaRecord | null => {
    return readLastKnownRecord(lastKnownRecords, cacheKey);
  };

  return {
    handleFace: async (input) => {
      const revalidateSeconds = normalizeRevalidateSeconds(
        input.face.revalidateSeconds,
      );
      assertPartitionedTenantBoundary(runtimeOptions, input.ctx);

      const hydrationSidecarPointer = hydrationSidecarPointerFromRequest(
        input.ctx.request.query,
        runtimeOptions.htmlPointerPrefix,
      );

      const tenant = resolveTenant(runtimeOptions, input.ctx);
      const query = hydrationSidecarPointer.present
        ? queryWithoutHydrationSidecar(input.ctx.request.query)
        : input.ctx.request.query;
      const cacheKeyInput: IsrCacheKeyInput = {
        tenant,
        routePattern: normalizePath(input.routePattern),
        params: input.ctx.params,
        query,
        headers: input.ctx.request.headers,
        cookies: input.ctx.request.cookies,
      };
      if (runtimeOptions.varyCookies !== null) {
        cacheKeyInput.varyCookies = runtimeOptions.varyCookies;
      }
      const cacheKey = runtimeOptions.cacheKey(cacheKeyInput);

      if (hydrationSidecarPointer.present) {
        if (
          !hydrationSidecarPointer.pointer ||
          !hydrationSidecarPointerMatchesCacheKey(
            hydrationSidecarPointer.pointer,
            cacheKey,
            runtimeOptions.htmlPointerPrefix,
          )
        ) {
          return hydrationSidecarNotFoundResponse();
        }
        return cachedHydrationSidecarResponse(
          runtimeOptions,
          hydrationSidecarPointer.pointer,
        );
      }

      const currentNow = runtimeOptions.now();
      let existing: IsrMetaRecord | null;
      try {
        existing = await runtimeOptions.metaStore.get(cacheKey);
        rememberRecord(existing);
      } catch (err) {
        const stale = await staleResponseForMetadataFailure(
          runtimeOptions,
          input,
          lastKnownRecord(cacheKey),
          err,
        );
        if (stale) return stale;
        throw err;
      }

      if (existing && isFresh(existing, currentNow)) {
        const cachedFresh = await cachedResponseFromRecord(
          runtimeOptions,
          existing,
          'hit',
          currentNow,
          false,
        );
        if (cachedFresh) {
          rememberRecord(existing);
          return cachedFresh;
        }
      }

      const leaseOwner = runtimeOptions.createLeaseOwner();
      let acquire: TryAcquireIsrLeaseResult;
      try {
        acquire = await runtimeOptions.metaStore.tryAcquireLease({
          cacheKey,
          leaseOwner,
          nowMs: currentNow,
          leaseDurationMs: runtimeOptions.leaseDurationMs,
          fallbackRevalidateSeconds: revalidateSeconds,
        });
        rememberRecord(acquire.record);
      } catch (err) {
        const stale = await staleResponseForMetadataFailure(
          runtimeOptions,
          input,
          existing ?? lastKnownRecord(cacheKey),
          err,
        );
        if (stale) return stale;
        throw err;
      }

      if (acquire.acquired && acquire.leaseToken) {
        return regenerateAndCommit(
          runtimeOptions,
          input,
          cacheKey,
          leaseOwner,
          acquire.leaseToken,
          revalidateSeconds,
          existing ?? acquire.record,
          rememberRecord,
        );
      }

      const staleRecord = existing ?? acquire.record;
      if (runtimeOptions.lockContentionPolicy === 'wait') {
        const deadline =
          runtimeOptions.now() + runtimeOptions.regenerationWaitTimeoutMs;
        let waited: IsrMetaRecord | null;
        try {
          waited = await waitForRegeneratedRecord(
            runtimeOptions,
            cacheKey,
            staleRecord.generatedAt,
            deadline,
          );
          rememberRecord(waited);
        } catch (err) {
          const stale = await staleResponseForMetadataFailure(
            runtimeOptions,
            input,
            staleRecord,
            err,
          );
          if (stale) return stale;
          throw err;
        }
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

      let retryAcquire: TryAcquireIsrLeaseResult;
      try {
        retryAcquire = await runtimeOptions.metaStore.tryAcquireLease({
          cacheKey,
          leaseOwner,
          nowMs: runtimeOptions.now(),
          leaseDurationMs: runtimeOptions.leaseDurationMs,
          fallbackRevalidateSeconds: revalidateSeconds,
        });
        rememberRecord(retryAcquire.record);
      } catch (err) {
        const stale = await staleResponseForMetadataFailure(
          runtimeOptions,
          input,
          staleRecord,
          err,
        );
        if (stale) return stale;
        throw err;
      }
      if (retryAcquire.acquired && retryAcquire.leaseToken) {
        return regenerateAndCommit(
          runtimeOptions,
          input,
          cacheKey,
          leaseOwner,
          retryAcquire.leaseToken,
          revalidateSeconds,
          staleRecord,
          rememberRecord,
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
    .map(
      (key) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(String(input.params[key]))}`,
    );
  const queryParts = Object.keys(input.query)
    .sort((left, right) => left.localeCompare(right))
    .flatMap((key) =>
      (input.query[key] ?? []).map(
        (value) =>
          `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
      ),
    );

  const keyParts = [...paramParts, ...queryParts];
  const requestVariantParts = requestVariantKeyParts(input);
  const requestVariant =
    requestVariantParts.length > 0 ? `#${requestVariantParts.join('&')}` : '';
  return `${input.tenant}::${routePattern}?${keyParts.join('&')}${requestVariant}`;
}

function requestVariantKeyParts(input: IsrCacheKeyInput): string[] {
  const parts: string[] = [];
  const authHeadersDigest = digestSelectedHeaders(
    input.headers,
    DEFAULT_AUTH_VARY_HEADERS,
  );
  if (authHeadersDigest) parts.push(`auth=${authHeadersDigest}`);

  const cookiesDigest = digestCookies(input.cookies, input.varyCookies);
  if (cookiesDigest) parts.push(`cookies=${cookiesDigest}`);
  return parts;
}

function digestSelectedHeaders(
  headers: Headers | undefined,
  headerNames: readonly string[],
): string | null {
  const canonical = canonicalizeHeaders(headers);
  const lines: string[] = [];

  for (const name of [...headerNames].sort((left, right) =>
    left.localeCompare(right),
  )) {
    const values = canonical[name] ?? [];
    if (values.length === 0) continue;
    lines.push(
      `${name}=${values.map((value) => String(value)).join('\u0000')}`,
    );
  }

  return digestVariantLines(lines);
}

function digestCookies(
  cookies: CookieMap | undefined,
  varyCookies?: readonly string[],
): string | null {
  if (!cookies) return null;
  const cookieNames =
    varyCookies === undefined ? Object.keys(cookies) : [...varyCookies];
  const lines = [...new Set(cookieNames)]
    .filter((name) => Object.hasOwn(cookies, name))
    .sort((left, right) => left.localeCompare(right))
    .map((name) => `${name}=${String(cookies[name])}`);
  return digestVariantLines(lines);
}

function digestVariantLines(lines: string[]): string | null {
  if (lines.length === 0) return null;
  return createHash('sha256')
    .update(lines.join('\n'))
    .digest('hex')
    .slice(0, 24);
}

/**
 * Returns a tenant resolver backed by a request header. Only use this when an
 * upstream trusted boundary (for example AppTheory middleware or CloudFront)
 * strips client-supplied copies and writes the header after authentication.
 * The default ISR tenant resolver intentionally ignores request headers.
 */
export function tenantKeyFromTrustedHeader(
  headerName = 'x-tenant-id',
): (ctx: FaceContext) => string | null {
  const normalized = String(headerName).trim().toLowerCase();
  return (ctx) =>
    normalized ? firstHeaderValue(ctx.request.headers, normalized) : null;
}

export function blockingIsrCacheControl(
  revalidateSeconds: number,
  options: IsrCacheControlOptions = {},
): string {
  const safeRevalidate = normalizeRevalidateSeconds(revalidateSeconds);
  const browserMaxAge = normalizeNonNegativeInt(
    options.browserMaxAgeSeconds,
    0,
  );
  const sharedMaxAge = normalizeNonNegativeInt(options.sharedMaxAgeSeconds, 0);
  const staleIfError = normalizeNonNegativeInt(
    options.staleIfErrorSeconds,
    safeRevalidate,
  );
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
  rememberRecord: (record: IsrMetaRecord | null) => void,
): Promise<FaceResponse> {
  const generatedAt = runtimeOptions.now();
  const htmlPointer = buildHtmlPointer(
    cacheKey,
    generatedAt,
    runtimeOptions.htmlPointerPrefix,
  );
  const hydrationSidecarPointer =
    buildHydrationSidecarPointerFromHtmlPointer(htmlPointer);
  const hydrationDataUrl = buildHydrationSidecarDataUrl(
    input.ctx.request.path,
    input.ctx.request.query,
    hydrationSidecarPointer,
  );
  const hydrationSidecarRef: { current: IsrHydrationSidecar | null } = {
    current: null,
  };

  try {
    const prepared = await prepareFreshResponse(
      await input.renderFresh({
        strictExternalHydrationDataUrl: hydrationDataUrl,
        onHydrationSidecar: (sidecar) => {
          hydrationSidecarRef.current = sidecar;
        },
      }),
    );
    if (prepared.status >= 500) {
      throw new Error(`ISR regeneration produced status ${prepared.status}`);
    }

    const hydrationSidecar = hydrationSidecarRef.current;
    if (hydrationSidecar !== null) {
      await runtimeOptions.htmlStore.write({
        key: hydrationSidecarPointer,
        body: utf8(`${safeJson(hydrationSidecar.data)}\n`),
        contentType: JSON_CONTENT_TYPE,
        cacheControl: HYDRATION_SIDECAR_CACHE_CONTROL,
      });
    }

    const htmlMetadata = htmlStoreMetadataFromPreparedFreshResponse(prepared);
    const write = await runtimeOptions.htmlStore.write({
      key: htmlPointer,
      body: prepared.body,
      contentType: prepared.contentType,
      cacheControl: blockingIsrCacheControl(revalidateSeconds),
      ...(htmlMetadata ? { metadata: htmlMetadata } : {}),
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
      ...(prepared.contentSecurityPolicy !== null
        ? { contentSecurityPolicy: prepared.contentSecurityPolicy }
        : {}),
      ...(prepared.strictCspPolicy !== null
        ? { strictCspPolicy: prepared.strictCspPolicy }
        : {}),
      ...(etag !== null ? { etag } : {}),
    });

    const committedRecord: IsrMetaRecord = {
      ...createDefaultMetaRecord(cacheKey, revalidateSeconds),
      htmlPointer,
      generatedAt,
      status: prepared.status,
      contentType: prepared.contentType,
      contentSecurityPolicy: prepared.contentSecurityPolicy,
      strictCspPolicy: prepared.strictCspPolicy,
      etag,
    };
    rememberRecord(committedRecord);

    return responseFromStoredHtml(
      runtimeOptions,
      committedRecord,
      prepared.body,
      'miss',
      runtimeOptions.now(),
    );
  } catch (err) {
    if (runtimeOptions.failurePolicy === 'serve-stale') {
      const stale = await cachedResponseFromRecord(
        runtimeOptions,
        staleRecord,
        'stale',
        runtimeOptions.now(),
        true,
      );
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

async function staleResponseForMetadataFailure(
  runtimeOptions: CreateIsrRuntimeOptions,
  input: HandleIsrFaceInput,
  record: IsrMetaRecord | null,
  err: unknown,
): Promise<FaceResponse | null> {
  if (runtimeOptions.failurePolicy !== 'serve-stale') return null;

  const response = await cachedResponseFromRecord(
    runtimeOptions,
    record,
    ISR_STATE_STALE_METADATA_ERROR,
    runtimeOptions.now(),
    true,
  );
  if (!response) return null;

  reportFaceError(runtimeOptions.observability, err, {
    requestId: String(input.ctx.request.headers['x-request-id']?.[0] ?? ''),
    method: input.ctx.request.method,
    path: input.ctx.request.path,
    routePattern: input.routePattern,
    mode: 'isr',
    phase: 'isr-metadata',
    status: response.status,
    isrState: response.headers['x-facetheory-isr']?.[0] ?? null,
  });
  return response;
}

function rememberLastKnownRecord(
  records: Map<string, IsrMetaRecord>,
  record: IsrMetaRecord | null,
): void {
  if (!record?.htmlPointer) return;

  if (records.has(record.cacheKey)) {
    records.delete(record.cacheKey);
  }
  records.set(record.cacheKey, cloneIsrMetaRecord(record));

  while (records.size > DEFAULT_LAST_KNOWN_ISR_RECORD_LIMIT) {
    const oldestCacheKey = records.keys().next().value;
    if (oldestCacheKey === undefined) break;
    records.delete(oldestCacheKey);
  }
}

function readLastKnownRecord(
  records: Map<string, IsrMetaRecord>,
  cacheKey: string,
): IsrMetaRecord | null {
  const record = records.get(cacheKey);
  if (!record) return null;

  records.delete(cacheKey);
  records.set(cacheKey, record);
  return cloneIsrMetaRecord(record);
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
  record: IsrMetaRecord | null,
  state: IsrCacheState,
  nowMs: number,
  allowStale: boolean,
): Promise<FaceResponse | null> {
  if (!record?.htmlPointer) return null;
  if (!allowStale && !isFresh(record, nowMs)) return null;

  const html = await runtimeOptions.htmlStore.read(record.htmlPointer);
  if (!html) return null;

  const body = Uint8Array.from(html.body);
  return responseFromStoredHtml(
    runtimeOptions,
    record,
    body,
    state,
    nowMs,
    html.metadata,
  );
}

function responseFromStoredHtml(
  runtimeOptions: CreateIsrRuntimeOptions,
  record: IsrMetaRecord,
  body: Uint8Array,
  state: IsrCacheState,
  nowMs: number,
  htmlMetadata?: Record<string, string> | undefined,
): FaceResponse {
  const contentType = normalizeContentType(
    htmlMetadata?.[ISR_HTML_METADATA_CONTENT_TYPE] ?? record.contentType,
  );
  const status = normalizeStatusFromMetadata(
    htmlMetadata?.[ISR_HTML_METADATA_STATUS],
    record.status,
  );
  const contentSecurityPolicy = normalizeOptionalHeaderValue(
    record.contentSecurityPolicy ??
      htmlMetadata?.[ISR_HTML_METADATA_CONTENT_SECURITY_POLICY],
  );
  const strictCspPolicy = normalizeCachedStrictCspPolicy(
    record.strictCspPolicy,
    contentSecurityPolicy,
  );
  if (strictCspPolicy !== null) {
    validateStrictCspDocument(decodeUtf8Html(body), {
      policy: strictCspPolicy,
    });
  }

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
  if (contentSecurityPolicy !== null) {
    headers['content-security-policy'] = [contentSecurityPolicy];
  }

  if (record.etag) {
    headers.etag = [record.etag];
  }

  return {
    status,
    headers: sortHeaders(headers),
    cookies: [],
    body,
    isBase64: false,
  };
}

function htmlStoreMetadataFromPreparedFreshResponse(
  prepared: PreparedFreshResponse,
): Record<string, string> {
  const metadata: Record<string, string> = {
    [ISR_HTML_METADATA_STATUS]: String(prepared.status),
    [ISR_HTML_METADATA_CONTENT_TYPE]: prepared.contentType,
  };
  if (prepared.contentSecurityPolicy !== null) {
    metadata[ISR_HTML_METADATA_CONTENT_SECURITY_POLICY] =
      prepared.contentSecurityPolicy;
  }
  return metadata;
}

function normalizeRuntimeOptions(
  input: FaceIsrOptions,
): CreateIsrRuntimeOptions {
  const htmlStore = input.htmlStore ?? new InMemoryHtmlStore();
  const metaStore = input.metaStore ?? new InMemoryIsrMetaStore();
  const tenantKey =
    typeof input.tenantKey === 'function' ? input.tenantKey : defaultTenantKey;
  const hasExplicitTenantKey = typeof input.tenantKey === 'function';
  const cacheKey =
    typeof input.cacheKey === 'function' ? input.cacheKey : defaultIsrCacheKey;
  const hasExplicitCacheKey = typeof input.cacheKey === 'function';
  const varyCookies = Array.isArray(input.varyCookies)
    ? normalizeVaryCookies(input.varyCookies)
    : null;

  return {
    htmlStore,
    metaStore,
    now: input.now ?? (() => Date.now()),
    createLeaseOwner: input.createLeaseOwner ?? (() => randomUUID()),
    leaseDurationMs: normalizeNonNegativeInt(
      input.leaseDurationMs,
      DEFAULT_LEASE_DURATION_MS,
    ),
    regenerationWaitTimeoutMs: normalizeNonNegativeInt(
      input.regenerationWaitTimeoutMs,
      DEFAULT_REGEN_WAIT_TIMEOUT_MS,
    ),
    regenerationPollIntervalMs: Math.max(
      1,
      normalizeNonNegativeInt(
        input.regenerationPollIntervalMs,
        DEFAULT_REGEN_POLL_INTERVAL_MS,
      ),
    ),
    failurePolicy: input.failurePolicy ?? 'serve-stale',
    lockContentionPolicy: input.lockContentionPolicy ?? 'wait',
    tenantKey,
    hasExplicitTenantKey,
    cacheKey,
    hasExplicitCacheKey,
    varyCookies,
    tenantBoundaryHeaders: DEFAULT_TENANT_BOUNDARY_HEADERS,
    htmlPointerPrefix: normalizeObjectPrefix(input.htmlPointerPrefix ?? 'isr'),
    cacheControl:
      input.cacheControl ??
      ((options) => blockingIsrCacheControl(options.revalidateSeconds)),
    observability: input.observability ?? null,
  };
}

function normalizeVaryCookies(varyCookies: readonly string[]): readonly string[] {
  return [...new Set(varyCookies.map((name) => String(name).trim()))].filter(
    (name) => name.length > 0,
  );
}

function assertPartitionedTenantBoundary(
  runtimeOptions: CreateIsrRuntimeOptions,
  ctx: FaceContext,
): void {
  if (runtimeOptions.hasExplicitTenantKey || runtimeOptions.hasExplicitCacheKey)
    return;
  if (
    !hasNonEmptyHeader(
      ctx.request.headers,
      runtimeOptions.tenantBoundaryHeaders,
    )
  )
    return;

  throw new Error(
    'ISR tenant boundary header requires explicit tenantKey or cacheKey configuration',
  );
}

function hasNonEmptyHeader(
  headers: Headers | undefined,
  headerNames: readonly string[],
): boolean {
  const canonical = canonicalizeHeaders(headers);
  for (const name of headerNames) {
    const values = canonical[name] ?? [];
    if (values.some((value) => String(value).trim().length > 0)) return true;
  }
  return false;
}

function resolveTenant(
  runtimeOptions: CreateIsrRuntimeOptions,
  ctx: FaceContext,
): string {
  const rawTenant = runtimeOptions.tenantKey(ctx);
  const tenant = String(rawTenant ?? '').trim();
  return tenant.length > 0 ? tenant : 'default';
}

function defaultTenantKey(ctx: FaceContext): string {
  void ctx;
  return 'default';
}

function buildHtmlPointer(
  cacheKey: string,
  generatedAt: number,
  prefix: string,
): string {
  return `${prefix}${cacheKeyDigest(cacheKey)}/${generatedAt}-${randomUUID()}.html`;
}

function cacheKeyDigest(cacheKey: string): string {
  return createHash('sha256').update(cacheKey).digest('hex').slice(0, 24);
}

function buildHydrationSidecarPointerFromHtmlPointer(
  htmlPointer: string,
): string {
  return htmlPointer.endsWith('.html')
    ? `${htmlPointer.slice(0, -'.html'.length)}.hydration.json`
    : `${htmlPointer}.hydration.json`;
}

function buildHydrationSidecarDataUrl(
  routePath: string,
  query: Query,
  sidecarPointer: string,
): string {
  const token = Buffer.from(sidecarPointer, 'utf8').toString('base64url');
  const params = new URLSearchParams();
  for (const [key, values] of Object.entries(query)) {
    if (key === ISR_HYDRATION_QUERY_PARAM) continue;
    for (const value of values ?? []) {
      params.append(key, String(value));
    }
  }
  params.append(ISR_HYDRATION_QUERY_PARAM, token);
  return `${normalizePath(routePath)}?${params.toString()}`;
}

function hydrationSidecarPointerFromRequest(
  query: Query,
  htmlPointerPrefix: string,
): { present: false } | { present: true; pointer: string | null } {
  const values = query[ISR_HYDRATION_QUERY_PARAM] ?? [];
  if (values.length === 0) return { present: false };
  if (values.length !== 1) return { present: true, pointer: null };

  const token = String(values[0] ?? '').trim();
  if (!token) return { present: true, pointer: null };

  let pointer: string;
  try {
    pointer = Buffer.from(token, 'base64url').toString('utf8');
  } catch {
    return { present: true, pointer: null };
  }

  if (!isValidHydrationSidecarPointer(pointer, htmlPointerPrefix)) {
    return { present: true, pointer: null };
  }

  return { present: true, pointer };
}

function isValidHydrationSidecarPointer(
  pointer: string,
  htmlPointerPrefix: string,
): boolean {
  const normalized = String(pointer ?? '').trim();
  if (!normalized) return false;
  if (normalized.startsWith('/') || normalized.includes('\\')) return false;
  if (!normalized.endsWith('.hydration.json')) return false;
  if (htmlPointerPrefix && !normalized.startsWith(htmlPointerPrefix)) {
    return false;
  }

  const relative = htmlPointerPrefix
    ? normalized.slice(htmlPointerPrefix.length)
    : normalized;
  const parts = relative.split('/');
  if (
    parts.length !== 2 ||
    !/^[a-f0-9]{24}$/i.test(parts[0] ?? '') ||
    !/^\d+-[a-f0-9-]{36}\.hydration\.json$/i.test(parts[1] ?? '')
  ) {
    return false;
  }

  for (const part of normalized.split('/')) {
    if (!part || part === '.' || part === '..') return false;
  }

  return true;
}

function hydrationSidecarPointerMatchesCacheKey(
  pointer: string,
  cacheKey: string,
  htmlPointerPrefix: string,
): boolean {
  const relative = htmlPointerPrefix
    ? pointer.slice(htmlPointerPrefix.length)
    : pointer;
  const pointerDigest = relative.split('/')[0] ?? '';
  return pointerDigest.toLowerCase() === cacheKeyDigest(cacheKey);
}

function queryWithoutHydrationSidecar(query: Query): Query {
  const out: Query = {};
  for (const [key, values] of Object.entries(query)) {
    if (key === ISR_HYDRATION_QUERY_PARAM) continue;
    out[key] = [...(values ?? [])];
  }
  return out;
}

async function cachedHydrationSidecarResponse(
  runtimeOptions: CreateIsrRuntimeOptions,
  pointer: string,
): Promise<FaceResponse> {
  const sidecar = await runtimeOptions.htmlStore.read(pointer);
  if (!sidecar) return hydrationSidecarNotFoundResponse();

  const headers: Headers = {
    'cache-control': [HYDRATION_SIDECAR_CACHE_CONTROL],
    'content-type': [JSON_CONTENT_TYPE],
  };
  if (sidecar.etag) {
    headers.etag = [sidecar.etag];
  }

  return {
    status: 200,
    headers: sortHeaders(headers),
    cookies: [],
    body: Uint8Array.from(sidecar.body),
    isBase64: false,
  };
}

function hydrationSidecarNotFoundResponse(): FaceResponse {
  return {
    status: 404,
    headers: {
      'cache-control': ['no-store'],
      'content-type': ['text/plain; charset=utf-8'],
    },
    cookies: [],
    body: utf8('Not Found'),
    isBase64: false,
  };
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
    contentSecurityPolicy: null,
    strictCspPolicy: null,
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

function normalizeStatusFromMetadata(
  metadataValue: string | undefined,
  fallback: number,
): number {
  if (metadataValue === undefined) return normalizeStatus(fallback);
  return normalizeStatus(Number(metadataValue));
}

function firstHeaderValue(headers: Headers, key: string): string | null {
  const values = headers[key] ?? headers[key.toLowerCase()] ?? [];
  const first = values[0] ?? '';
  const normalized = String(first).trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeRevalidateSeconds(value: number | undefined): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_REVALIDATE_SECONDS;
  return Math.max(0, numeric);
}

function normalizeNonNegativeInt(
  value: number | undefined,
  fallback: number,
): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.trunc(numeric));
}

function normalizeObjectPrefix(value: string): string {
  const cleaned = trimOuterSlashes(String(value).trim());
  if (!cleaned) return '';
  return `${cleaned}/`;
}

function stripLeadingSlash(value: string): string {
  return trimLeadingSlashes(value);
}

async function prepareFreshResponse(
  response: FaceResponse,
): Promise<PreparedFreshResponse> {
  if (response.isBase64) {
    throw new Error('ISR does not support FaceResponse.isBase64=true');
  }

  const headers = canonicalizeHeaders(response.headers);
  const status = normalizeStatus(response.status);
  const contentType = normalizeContentType(
    firstHeaderValue(headers, 'content-type'),
  );
  const contentSecurityPolicy = normalizeOptionalHeaderValue(
    firstHeaderValue(headers, 'content-security-policy'),
  );
  const strictCspPolicy = inferCachedStrictCspPolicy(contentSecurityPolicy);
  const etag = firstHeaderValue(headers, 'etag');
  const body = await collectBody(response.body);

  return {
    body,
    status,
    contentType,
    contentSecurityPolicy,
    strictCspPolicy,
    etag,
  };
}

function normalizeCachedStrictCspPolicy(
  policy: IsrCachedStrictCspPolicy | null | undefined,
  contentSecurityPolicy: string | null,
): FaceCspPolicy | null {
  const normalizedPolicy =
    policy ?? inferCachedStrictCspPolicy(contentSecurityPolicy);
  if (!normalizedPolicy) return null;

  const cspPolicy: FaceCspPolicy = {};
  if (normalizedPolicy.inlineScripts === false) {
    cspPolicy.inlineScripts = false;
  }
  if (normalizedPolicy.inlineStyles === false) {
    cspPolicy.inlineStyles = false;
  }
  return requiresStrictCspDocumentValidation(cspPolicy) ? cspPolicy : null;
}

function inferCachedStrictCspPolicy(
  contentSecurityPolicy: string | null,
): IsrCachedStrictCspPolicy | null {
  if (contentSecurityPolicy === null) return null;

  const directives = parseCspDirectives(contentSecurityPolicy);
  const scriptDirective =
    directives.get('script-src') ?? directives.get('default-src');
  const styleDirective =
    directives.get('style-src') ?? directives.get('default-src');
  const policy: IsrCachedStrictCspPolicy = {};

  if (scriptDirective && !directiveAllowsUnsafeInline(scriptDirective)) {
    policy.inlineScripts = false;
  }
  if (styleDirective && !directiveAllowsUnsafeInline(styleDirective)) {
    policy.inlineStyles = false;
  }

  return policy.inlineScripts === false || policy.inlineStyles === false
    ? policy
    : null;
}

function parseCspDirectives(value: string): Map<string, string[]> {
  const directives = new Map<string, string[]>();
  for (const rawDirective of value.split(';')) {
    const tokens = rawDirective.trim().split(/\s+/).filter(Boolean);
    const name = tokens.shift()?.toLowerCase();
    if (!name || directives.has(name)) continue;
    directives.set(
      name,
      tokens.map((token) => token.toLowerCase()),
    );
  }
  return directives;
}

function directiveAllowsUnsafeInline(values: readonly string[]): boolean {
  return values.some(
    (value) => value.replace(/^'+|'+$/g, '') === 'unsafe-inline',
  );
}

function normalizeOptionalHeaderValue(
  value: string | null | undefined,
): string | null {
  const normalized = String(value ?? '').trim();
  return normalized.length > 0 ? normalized : null;
}

function decodeUtf8Html(body: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(body);
}

async function collectBody(body: FaceResponse['body']): Promise<Uint8Array> {
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
    const normalizedChunk =
      chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
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
