import { createHmac, timingSafeEqual } from 'node:crypto';

import { utf8 } from './bytes.js';
import type { HtmlStore } from './isr.js';
import { trimOuterSlashes, trimTrailingSlashes } from './types.js';

const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';
const HYDRATION_SIDECAR_CACHE_CONTROL = 'no-store';
const DEFAULT_KEY_PREFIX = 'ssr-hydration';
const DEFAULT_DATA_URL_PREFIX = '/_facetheory/ssr-data';
const DEFAULT_TOKEN_SCOPE = 'facetheory:ssr-hydration-sidecar';
const TOKEN_VERSION = 1;
const TOKEN_SIGNATURE_CONTEXT = 'facetheory:ssr-hydration-sidecar:token:v1';
const SCOPE_DIGEST_CONTEXT = 'facetheory:ssr-hydration-sidecar:scope:v1';
const VARIANT_DIGEST_CONTEXT = 'facetheory:ssr-hydration-sidecar:variant:v1';
const BODY_DIGEST_CONTEXT = 'facetheory:ssr-hydration-sidecar:body:v1';
const KEY_DIGEST_CONTEXT = 'facetheory:ssr-hydration-sidecar:key:v1';
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;
const SIDE_CAR_DIGEST_RE = /^[A-Za-z0-9_-]{32,}$/;

export const DEFAULT_SSR_HYDRATION_SIDECAR_TTL_SECONDS = 60;

export type SsrHydrationSidecarSigningSecret = string | Uint8Array;
export type SsrHydrationSidecarVariantInput = unknown;

export type SsrHydrationSidecarRejectReason =
  | 'malformed-token'
  | 'tampered-token'
  | 'wrong-scope'
  | 'expired-token'
  | 'not-yet-valid-token'
  | 'wrong-variant'
  | 'missing-sidecar'
  | 'invalid-sidecar'
  | 'tampered-sidecar';

export interface SsrHydrationSidecarStoreOptions {
  /** Shared object store used for the serialized sidecar JSON. */
  htmlStore: HtmlStore;
  /** HMAC signing secret. The secret is never written to tokens or storage. */
  signingSecret: SsrHydrationSidecarSigningSecret;
  /** Clock hook for deterministic tests. Defaults to `Date.now`. */
  now?: () => number;
  /** Default token lifetime. Defaults to 60 seconds. */
  ttlSeconds?: number;
  /** Logical object-key prefix in the configured HtmlStore. */
  keyPrefix?: string;
  /** Same-origin resource route prefix used when building the returned data URL. */
  dataUrlPrefix?: string;
  /** Optional app-level scope for separating token audiences that share a secret. */
  scope?: string;
}

export interface WriteSsrHydrationSidecarInput {
  /** Exact hydration payload produced during the server render. */
  data: unknown;
  /** Stable request variant inputs. Only a derived HMAC hash is stored. */
  variant: SsrHydrationSidecarVariantInput;
  /** Optional per-sidecar token lifetime override. */
  ttlSeconds?: number;
  /** Optional per-sidecar data URL prefix override. */
  dataUrlPrefix?: string;
}

export interface StoredSsrHydrationSidecar {
  /** Opaque signed URL token. */
  token: string;
  /** Same-origin URL suitable for `FaceExternalHydration.dataUrl`. */
  dataUrl: string;
  /** HtmlStore key for the serialized JSON sidecar. */
  key: string;
  /** HMAC-derived request variant binding written to token claims. */
  variantHash: string;
  issuedAtMs: number;
  notBeforeMs: number;
  expiresAtMs: number;
  etag: string | null;
}

export interface ReadSsrHydrationSidecarInput {
  /** Token returned by `write()`. */
  token: string;
  /** Stable request variant inputs for the current request. */
  variant: SsrHydrationSidecarVariantInput;
}

export interface VerifiedSsrHydrationSidecarToken {
  key: string;
  variantHash: string;
  bodyDigest: string;
  issuedAtMs: number;
  notBeforeMs: number;
  expiresAtMs: number;
}

export interface ReadSsrHydrationSidecarResult<
  T = unknown,
> extends VerifiedSsrHydrationSidecarToken {
  data: T;
  etag: string | null;
}

export interface SsrHydrationSidecarStore {
  write: (
    input: WriteSsrHydrationSidecarInput,
  ) => Promise<StoredSsrHydrationSidecar>;
  read: <T = unknown>(
    input: ReadSsrHydrationSidecarInput,
  ) => Promise<ReadSsrHydrationSidecarResult<T>>;
  verifyToken: (
    input: ReadSsrHydrationSidecarInput,
  ) => VerifiedSsrHydrationSidecarToken;
}

interface NormalizedSsrHydrationSidecarStoreOptions {
  htmlStore: HtmlStore;
  signingSecret: Buffer;
  now: () => number;
  ttlSeconds: number;
  keyPrefix: string;
  dataUrlPrefix: string;
  scope: string;
  scopeDigest: string;
}

interface SsrHydrationSidecarTokenClaims {
  v: typeof TOKEN_VERSION;
  scp: string;
  key: string;
  vh: string;
  bd: string;
  iat: number;
  nbf: number;
  exp: number;
}

export class SsrHydrationSidecarError extends Error {
  readonly reason: SsrHydrationSidecarRejectReason;

  constructor(reason: SsrHydrationSidecarRejectReason) {
    super(messageForRejectReason(reason));
    this.name = 'SsrHydrationSidecarError';
    this.reason = reason;
  }
}

export function createSsrHydrationSidecarStore(
  options: SsrHydrationSidecarStoreOptions,
): SsrHydrationSidecarStore {
  const normalized = normalizeStoreOptions(options);
  return {
    write: (input) => writeSsrHydrationSidecar(normalized, input),
    read: (input) => readSsrHydrationSidecar(normalized, input),
    verifyToken: (input) => verifySsrHydrationSidecarToken(normalized, input),
  };
}

export function serializeSsrHydrationSidecarJson(data: unknown): string {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(data);
  } catch {
    throw new TypeError('SSR hydration sidecar data must be JSON-serializable');
  }

  if (serialized === undefined) {
    throw new TypeError(
      'SSR hydration sidecar data must be JSON-serializable at the top level',
    );
  }

  return serialized
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

export function buildSsrHydrationSidecarDataUrl(
  token: string,
  options: { dataUrlPrefix?: string } = {},
): string {
  const normalizedToken = normalizeToken(token);
  const prefix = normalizeDataUrlPrefix(
    options.dataUrlPrefix ?? DEFAULT_DATA_URL_PREFIX,
  );
  const encodedToken = encodeURIComponent(normalizedToken);
  return prefix === '/' ? `/${encodedToken}` : `${prefix}/${encodedToken}`;
}

export function normalizeSsrHydrationSidecarDataUrlPrefix(
  dataUrlPrefix?: string,
): string {
  return normalizeDataUrlPrefix(dataUrlPrefix ?? DEFAULT_DATA_URL_PREFIX);
}

async function writeSsrHydrationSidecar(
  options: NormalizedSsrHydrationSidecarStoreOptions,
  input: WriteSsrHydrationSidecarInput,
): Promise<StoredSsrHydrationSidecar> {
  const issuedAtMs = normalizeNow(options.now);
  const ttlSeconds = normalizeTtlSeconds(
    input.ttlSeconds ?? options.ttlSeconds,
  );
  const expiresAtMs = issuedAtMs + ttlSeconds * 1000;
  const notBeforeMs = issuedAtMs;
  const json = serializeSsrHydrationSidecarJson(input.data);
  const body = utf8(json);
  const variantHash = digestVariant(options, input.variant);
  const bodyDigest = digestBody(options, body);
  const key = buildSidecarKey(options, {
    bodyDigest,
    expiresAtMs,
    issuedAtMs,
    variantHash,
  });
  const token = signToken(options, {
    bd: bodyDigest,
    exp: expiresAtMs,
    iat: issuedAtMs,
    key,
    nbf: notBeforeMs,
    scp: options.scopeDigest,
    v: TOKEN_VERSION,
    vh: variantHash,
  });
  const write = await options.htmlStore.write({
    key,
    body,
    contentType: JSON_CONTENT_TYPE,
    cacheControl: HYDRATION_SIDECAR_CACHE_CONTROL,
    metadata: {
      'facetheory-kind': 'ssr-hydration-sidecar',
      'facetheory-version': String(TOKEN_VERSION),
      'facetheory-scope': options.scopeDigest,
      'facetheory-variant': variantHash,
      'facetheory-body': bodyDigest,
      'facetheory-expires-at': String(expiresAtMs),
    },
  });

  return {
    token,
    dataUrl: buildSsrHydrationSidecarDataUrl(token, {
      dataUrlPrefix: input.dataUrlPrefix ?? options.dataUrlPrefix,
    }),
    key,
    variantHash,
    issuedAtMs,
    notBeforeMs,
    expiresAtMs,
    etag: write.etag ?? null,
  };
}

async function readSsrHydrationSidecar<T = unknown>(
  options: NormalizedSsrHydrationSidecarStoreOptions,
  input: ReadSsrHydrationSidecarInput,
): Promise<ReadSsrHydrationSidecarResult<T>> {
  const verified = verifySsrHydrationSidecarToken(options, input);
  const sidecar = await options.htmlStore.read(verified.key);
  if (!sidecar) throw new SsrHydrationSidecarError('missing-sidecar');

  const body = Uint8Array.from(sidecar.body);
  const actualBodyDigest = digestBody(options, body);
  if (!constantTimeEqualString(actualBodyDigest, verified.bodyDigest)) {
    throw new SsrHydrationSidecarError('tampered-sidecar');
  }

  let data: T;
  try {
    data = JSON.parse(new TextDecoder().decode(body)) as T;
  } catch {
    throw new SsrHydrationSidecarError('invalid-sidecar');
  }

  return {
    ...verified,
    data,
    etag: sidecar.etag ?? null,
  };
}

function verifySsrHydrationSidecarToken(
  options: NormalizedSsrHydrationSidecarStoreOptions,
  input: ReadSsrHydrationSidecarInput,
): VerifiedSsrHydrationSidecarToken {
  const token = normalizeToken(input.token);
  const parts = token.split('.');
  if (parts.length !== 2) {
    throw new SsrHydrationSidecarError('malformed-token');
  }

  const [payloadSegment, signatureSegment] = parts;
  if (
    !isBase64UrlSegment(payloadSegment) ||
    !isBase64UrlSegment(signatureSegment)
  ) {
    throw new SsrHydrationSidecarError('malformed-token');
  }

  const expectedSignature = signPayloadSegment(options, payloadSegment);
  if (!constantTimeEqualString(signatureSegment, expectedSignature)) {
    throw new SsrHydrationSidecarError('tampered-token');
  }

  const claims = parseTokenClaims(payloadSegment);
  assertTokenClaims(options, claims);

  const nowMs = normalizeNow(options.now);
  if (nowMs < claims.nbf) {
    throw new SsrHydrationSidecarError('not-yet-valid-token');
  }
  if (nowMs >= claims.exp) {
    throw new SsrHydrationSidecarError('expired-token');
  }

  const expectedVariantHash = digestVariant(options, input.variant);
  if (!constantTimeEqualString(claims.vh, expectedVariantHash)) {
    throw new SsrHydrationSidecarError('wrong-variant');
  }

  return {
    key: claims.key,
    variantHash: claims.vh,
    bodyDigest: claims.bd,
    issuedAtMs: claims.iat,
    notBeforeMs: claims.nbf,
    expiresAtMs: claims.exp,
  };
}

function parseTokenClaims(
  payloadSegment: string,
): SsrHydrationSidecarTokenClaims {
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      Buffer.from(payloadSegment, 'base64url').toString('utf8'),
    );
  } catch {
    throw new SsrHydrationSidecarError('malformed-token');
  }

  if (!isTokenClaims(parsed)) {
    throw new SsrHydrationSidecarError('malformed-token');
  }
  return parsed;
}

function isTokenClaims(
  value: unknown,
): value is SsrHydrationSidecarTokenClaims {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<SsrHydrationSidecarTokenClaims>;
  return (
    candidate.v === TOKEN_VERSION &&
    typeof candidate.scp === 'string' &&
    typeof candidate.key === 'string' &&
    typeof candidate.vh === 'string' &&
    typeof candidate.bd === 'string' &&
    Number.isSafeInteger(candidate.iat) &&
    Number.isSafeInteger(candidate.nbf) &&
    Number.isSafeInteger(candidate.exp)
  );
}

function assertTokenClaims(
  options: NormalizedSsrHydrationSidecarStoreOptions,
  claims: SsrHydrationSidecarTokenClaims,
): void {
  if (!constantTimeEqualString(claims.scp, options.scopeDigest)) {
    throw new SsrHydrationSidecarError('wrong-scope');
  }
  if (!isSidecarDigest(claims.vh) || !isSidecarDigest(claims.bd)) {
    throw new SsrHydrationSidecarError('malformed-token');
  }
  if (claims.iat > claims.nbf || claims.nbf >= claims.exp) {
    throw new SsrHydrationSidecarError('malformed-token');
  }
  if (!isValidSidecarKey(claims.key, options.keyPrefix)) {
    throw new SsrHydrationSidecarError('malformed-token');
  }
}

function signToken(
  options: NormalizedSsrHydrationSidecarStoreOptions,
  claims: SsrHydrationSidecarTokenClaims,
): string {
  const payloadSegment = Buffer.from(JSON.stringify(claims), 'utf8').toString(
    'base64url',
  );
  return `${payloadSegment}.${signPayloadSegment(options, payloadSegment)}`;
}

function signPayloadSegment(
  options: NormalizedSsrHydrationSidecarStoreOptions,
  payloadSegment: string,
): string {
  return createHmac('sha256', options.signingSecret)
    .update(TOKEN_SIGNATURE_CONTEXT)
    .update('\0')
    .update(options.scope)
    .update('\0')
    .update(payloadSegment)
    .digest('base64url');
}

function digestVariant(
  options: NormalizedSsrHydrationSidecarStoreOptions,
  variant: SsrHydrationSidecarVariantInput,
): string {
  return digestString(
    options,
    VARIANT_DIGEST_CONTEXT,
    stableJson(variant, new WeakSet<object>()),
  );
}

function digestBody(
  options: NormalizedSsrHydrationSidecarStoreOptions,
  body: Uint8Array,
): string {
  return createHmac('sha256', options.signingSecret)
    .update(BODY_DIGEST_CONTEXT)
    .update('\0')
    .update(options.scope)
    .update('\0')
    .update(body)
    .digest('base64url');
}

function digestString(
  options: Pick<
    NormalizedSsrHydrationSidecarStoreOptions,
    'scope' | 'signingSecret'
  >,
  context: string,
  value: string,
): string {
  return createHmac('sha256', options.signingSecret)
    .update(context)
    .update('\0')
    .update(options.scope)
    .update('\0')
    .update(value)
    .digest('base64url');
}

function buildSidecarKey(
  options: NormalizedSsrHydrationSidecarStoreOptions,
  input: {
    bodyDigest: string;
    expiresAtMs: number;
    issuedAtMs: number;
    variantHash: string;
  },
): string {
  const digest = digestString(
    options,
    KEY_DIGEST_CONTEXT,
    [
      input.variantHash,
      input.bodyDigest,
      String(input.issuedAtMs),
      String(input.expiresAtMs),
    ].join('\0'),
  ).slice(0, 32);
  return `${options.keyPrefix}${digest}/${input.issuedAtMs}-${input.expiresAtMs}.json`;
}

function normalizeStoreOptions(
  options: SsrHydrationSidecarStoreOptions,
): NormalizedSsrHydrationSidecarStoreOptions {
  const signingSecret = normalizeSigningSecret(options.signingSecret);
  const scope = normalizeScope(options.scope ?? DEFAULT_TOKEN_SCOPE);
  const normalized: Omit<
    NormalizedSsrHydrationSidecarStoreOptions,
    'scopeDigest'
  > = {
    htmlStore: options.htmlStore,
    signingSecret,
    now: options.now ?? (() => Date.now()),
    ttlSeconds: normalizeTtlSeconds(
      options.ttlSeconds ?? DEFAULT_SSR_HYDRATION_SIDECAR_TTL_SECONDS,
    ),
    keyPrefix: normalizeObjectPrefix(options.keyPrefix ?? DEFAULT_KEY_PREFIX),
    dataUrlPrefix: normalizeDataUrlPrefix(
      options.dataUrlPrefix ?? DEFAULT_DATA_URL_PREFIX,
    ),
    scope,
  };
  return {
    ...normalized,
    scopeDigest: digestString(normalized, SCOPE_DIGEST_CONTEXT, scope),
  };
}

function normalizeSigningSecret(
  secret: SsrHydrationSidecarSigningSecret,
): Buffer {
  const normalized =
    typeof secret === 'string'
      ? Buffer.from(secret, 'utf8')
      : Buffer.from(secret);
  if (normalized.byteLength === 0) {
    throw new TypeError(
      'SSR hydration sidecar signing secret must not be empty',
    );
  }
  return normalized;
}

function normalizeScope(scope: string): string {
  const normalized = String(scope ?? '').trim();
  if (!normalized) {
    throw new TypeError('SSR hydration sidecar scope must not be empty');
  }
  return normalized;
}

function normalizeTtlSeconds(value: number): number {
  const normalized = Math.trunc(Number(value));
  if (!Number.isSafeInteger(normalized) || normalized <= 0) {
    throw new TypeError('SSR hydration sidecar ttlSeconds must be positive');
  }
  return normalized;
}

function normalizeNow(now: () => number): number {
  const normalized = Math.trunc(Number(now()));
  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    throw new TypeError('SSR hydration sidecar clock must return a timestamp');
  }
  return normalized;
}

function normalizeObjectPrefix(prefix: string): string {
  const raw = String(prefix ?? '');
  if (containsAsciiControlCharacter(raw)) {
    throw new TypeError(
      'SSR hydration sidecar keyPrefix must be an object prefix',
    );
  }
  const trimmed = raw.trim();
  const withoutOuterSlashes = trimOuterSlashes(trimmed);
  if (!withoutOuterSlashes) return '';
  if (
    withoutOuterSlashes.includes('\\') ||
    withoutOuterSlashes.includes('?') ||
    withoutOuterSlashes.includes('#')
  ) {
    throw new TypeError(
      'SSR hydration sidecar keyPrefix must be an object prefix',
    );
  }
  for (const part of withoutOuterSlashes.split('/')) {
    if (!part || part === '.' || part === '..') {
      throw new TypeError(
        'SSR hydration sidecar keyPrefix must be an object prefix',
      );
    }
  }
  return `${withoutOuterSlashes}/`;
}

function normalizeDataUrlPrefix(prefix: string): string {
  const raw = String(prefix ?? '');
  if (containsAsciiControlCharacter(raw)) {
    throw new TypeError(
      'SSR hydration sidecar dataUrlPrefix must be a same-origin path prefix',
    );
  }
  const trimmed = raw.trim();
  if (!trimmed) return DEFAULT_DATA_URL_PREFIX;
  if (trimmed.startsWith('//')) {
    throw new TypeError(
      'SSR hydration sidecar dataUrlPrefix must be a same-origin path prefix',
    );
  }
  if (
    trimmed.includes('\\') ||
    trimmed.includes('?') ||
    trimmed.includes('#')
  ) {
    throw new TypeError(
      'SSR hydration sidecar dataUrlPrefix must be a same-origin path prefix',
    );
  }
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  const withoutTrailingSlash = trimTrailingSlashes(withLeadingSlash);
  return withoutTrailingSlash || '/';
}

function containsAsciiControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const charCode = value.charCodeAt(index);
    if (charCode <= 0x1f || charCode === 0x7f) return true;
  }
  return false;
}

function normalizeToken(token: string): string {
  const normalized = String(token ?? '');
  if (!normalized || normalized !== normalized.trim()) {
    throw new SsrHydrationSidecarError('malformed-token');
  }
  return normalized;
}

function isBase64UrlSegment(value: string | undefined): value is string {
  return (
    typeof value === 'string' && value.length > 0 && BASE64URL_RE.test(value)
  );
}

function isSidecarDigest(value: string): boolean {
  return SIDE_CAR_DIGEST_RE.test(value);
}

function isValidSidecarKey(key: string, keyPrefix: string): boolean {
  const normalized = String(key ?? '');
  if (!normalized || normalized.startsWith('/') || normalized.includes('\\')) {
    return false;
  }
  if (keyPrefix && !normalized.startsWith(keyPrefix)) return false;
  if (!normalized.endsWith('.json')) return false;

  const relative = keyPrefix ? normalized.slice(keyPrefix.length) : normalized;
  const parts = relative.split('/');
  if (
    parts.length !== 2 ||
    !/^[A-Za-z0-9_-]{24,64}$/.test(parts[0] ?? '') ||
    !/^\d+-\d+\.json$/.test(parts[1] ?? '')
  ) {
    return false;
  }

  for (const part of normalized.split('/')) {
    if (!part || part === '.' || part === '..') return false;
  }

  return true;
}

function constantTimeEqualString(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.byteLength === right.byteLength && timingSafeEqual(left, right);
}

function stableJson(value: unknown, seen: WeakSet<object>): string {
  if (value === null) return 'null';

  switch (typeof value) {
    case 'string':
      return JSON.stringify(value) as string;
    case 'number':
      if (!Number.isFinite(value)) {
        throw new TypeError(
          'SSR hydration sidecar variant must be JSON-serializable',
        );
      }
      return JSON.stringify(value) as string;
    case 'boolean':
      return value ? 'true' : 'false';
    case 'undefined':
    case 'function':
    case 'symbol':
    case 'bigint':
      throw new TypeError(
        'SSR hydration sidecar variant must be JSON-serializable',
      );
    case 'object':
      break;
  }

  if (seen.has(value)) {
    throw new TypeError('SSR hydration sidecar variant must not be circular');
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((entry) => stableJson(entry, seen)).join(',')}]`;
    }

    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      throw new TypeError(
        'SSR hydration sidecar variant must be a JSON-serializable plain object',
      );
    }

    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([left], [right]) => (left < right ? -1 : left > right ? 1 : 0),
    );
    return `{${entries
      .map(
        ([key, entryValue]) =>
          `${JSON.stringify(key)}:${stableJson(entryValue, seen)}`,
      )
      .join(',')}}`;
  } finally {
    seen.delete(value);
  }
}

function messageForRejectReason(
  reason: SsrHydrationSidecarRejectReason,
): string {
  switch (reason) {
    case 'malformed-token':
      return 'FaceTheory SSR hydration sidecar token was malformed';
    case 'tampered-token':
      return 'FaceTheory SSR hydration sidecar token was tampered';
    case 'wrong-scope':
      return 'FaceTheory SSR hydration sidecar token was outside this scope';
    case 'expired-token':
      return 'FaceTheory SSR hydration sidecar token expired';
    case 'not-yet-valid-token':
      return 'FaceTheory SSR hydration sidecar token is not yet valid';
    case 'wrong-variant':
      return 'FaceTheory SSR hydration sidecar token did not match this request variant';
    case 'missing-sidecar':
      return 'FaceTheory SSR hydration sidecar was not found';
    case 'invalid-sidecar':
      return 'FaceTheory SSR hydration sidecar JSON was invalid';
    case 'tampered-sidecar':
      return 'FaceTheory SSR hydration sidecar body did not match its token';
  }
}
