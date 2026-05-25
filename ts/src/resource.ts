import { utf8 } from './bytes.js';
import type {
  FaceResponse,
  FaceResponseHeaders,
  FaceResponseHeaderValue,
  Headers,
} from './types.js';

const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';
const TEXT_CONTENT_TYPE = 'text/plain; charset=utf-8';
const DEFAULT_CACHE_CONTROL = 'no-store';
const EMPTY_BODY = new Uint8Array();
const HEADER_NAME_RE = /^[!#$%&'*+\-.^_`|~0-9a-z]+$/;
const METHOD_TOKEN_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

export interface FaceResourceResponseOptions {
  /** HTTP status code. Defaults are helper-specific. */
  status?: number;
  /** Additional response headers. Header names are lower-cased and sorted. */
  headers?: FaceResponseHeaders;
  /** Set-Cookie values. Also mirrored into the normalized `set-cookie` header. */
  cookies?: readonly string[];
  /**
   * Cache-Control value. Defaults to `no-store`; pass `null` to omit the
   * header when the caller has an explicit external cache policy.
   */
  cacheControl?: string | null;
}

export interface FaceJsonResourceResponseOptions extends FaceResourceResponseOptions {
  /** Content-Type value. Defaults to `application/json; charset=utf-8`. */
  contentType?: string;
}

export interface FaceTextResourceResponseOptions extends FaceResourceResponseOptions {
  /** Content-Type value. Defaults to `text/plain; charset=utf-8`. */
  contentType?: string;
}

export type FaceEmptyResourceResponseOptions = FaceResourceResponseOptions;

export interface FaceMethodNotAllowedResourceResponseOptions extends Omit<
  FaceTextResourceResponseOptions,
  'status'
> {
  /** Stable plain-text response body. Defaults to `Method Not Allowed`. */
  body?: string;
}

export function jsonResourceResponse(
  value: unknown,
  options: FaceJsonResourceResponseOptions = {},
): FaceResponse {
  return resourceResponse({
    status: options.status ?? 200,
    headers: options.headers,
    cookies: options.cookies,
    cacheControl: options.cacheControl,
    contentType: options.contentType ?? JSON_CONTENT_TYPE,
    body: utf8(safeResourceJson(value)),
  });
}

export function textResourceResponse(
  body: string,
  options: FaceTextResourceResponseOptions = {},
): FaceResponse {
  return resourceResponse({
    status: options.status ?? 200,
    headers: options.headers,
    cookies: options.cookies,
    cacheControl: options.cacheControl,
    contentType: options.contentType ?? TEXT_CONTENT_TYPE,
    body: utf8(String(body)),
  });
}

export function emptyResourceResponse(
  options: FaceEmptyResourceResponseOptions = {},
): FaceResponse {
  return resourceResponse({
    status: options.status ?? 204,
    headers: options.headers,
    cookies: options.cookies,
    cacheControl: options.cacheControl,
    contentType: null,
    body: EMPTY_BODY,
  });
}

export function methodNotAllowedResourceResponse(
  allowedMethods: Iterable<string>,
  options: FaceMethodNotAllowedResourceResponseOptions = {},
): FaceResponse {
  return resourceResponse({
    status: 405,
    headers: options.headers,
    cookies: options.cookies,
    cacheControl: options.cacheControl,
    contentType: options.contentType ?? TEXT_CONTENT_TYPE,
    protectedHeaders: {
      allow: [formatAllowHeader(allowedMethods)],
    },
    body: utf8(options.body ?? 'Method Not Allowed'),
  });
}

interface ResourceResponseInput {
  status: number;
  headers?: FaceResponseHeaders | undefined;
  cookies?: readonly string[] | undefined;
  cacheControl?: string | null | undefined;
  contentType: string | null;
  protectedHeaders?: Headers | undefined;
  body: Uint8Array;
}

function resourceResponse(input: ResourceResponseInput): FaceResponse {
  const headers = normalizeResourceHeaders(input.headers);
  const cookies = normalizeCookieValues(input.cookies);
  const headerCookies = headers['set-cookie'] ?? [];
  const allCookies = [...headerCookies, ...cookies];

  if (allCookies.length > 0) {
    headers['set-cookie'] = allCookies;
  }

  if (input.contentType === null) {
    delete headers['content-type'];
  } else {
    headers['content-type'] = [normalizeHeaderValue(input.contentType)];
  }

  if (input.cacheControl === null) {
    delete headers['cache-control'];
  } else {
    headers['cache-control'] = [
      normalizeHeaderValue(input.cacheControl ?? DEFAULT_CACHE_CONTROL),
    ];
  }

  for (const [key, values] of Object.entries(input.protectedHeaders ?? {})) {
    headers[normalizeHeaderName(key)] = values.map(normalizeHeaderValue);
  }

  return {
    status: normalizeStatus(input.status),
    headers: sortHeaders(headers),
    cookies: allCookies,
    body: input.body,
    isBase64: false,
  };
}

function normalizeResourceHeaders(
  input: FaceResponseHeaders | undefined,
): Headers {
  const headers: Headers = {};
  for (const [rawName, rawValue] of Object.entries(input ?? {})) {
    const name = normalizeHeaderName(rawName);
    const values = normalizeHeaderValues(rawValue);
    if (values.length === 0) continue;

    const existing = headers[name];
    if (existing) {
      existing.push(...values);
    } else {
      headers[name] = values;
    }
  }
  return headers;
}

function normalizeHeaderValues(value: FaceResponseHeaderValue): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values.map(normalizeHeaderValue);
}

function normalizeHeaderName(name: string): string {
  const normalized = String(name).trim().toLowerCase();
  if (!normalized || !HEADER_NAME_RE.test(normalized)) {
    throw new TypeError(
      `invalid resource response header name: ${String(name)}`,
    );
  }
  return normalized;
}

function normalizeHeaderValue(value: unknown): string {
  const normalized = String(value);
  if (normalized.includes('\r') || normalized.includes('\n')) {
    throw new TypeError(
      'resource response header values must not contain CR or LF',
    );
  }
  return normalized;
}

function normalizeCookieValues(
  values: readonly string[] | undefined,
): string[] {
  return (values ?? []).map(normalizeHeaderValue);
}

function normalizeStatus(status: number): number {
  const normalized = Math.trunc(Number(status));
  if (
    !Number.isSafeInteger(normalized) ||
    normalized < 100 ||
    normalized > 599
  ) {
    throw new TypeError('resource response status must be an HTTP status code');
  }
  return normalized;
}

function sortHeaders(headers: Headers): Headers {
  const sorted: Headers = {};
  for (const key of Object.keys(headers).sort()) {
    sorted[key] = headers[key] ?? [];
  }
  return sorted;
}

function formatAllowHeader(methods: Iterable<string>): string {
  const normalized = new Set<string>();
  for (const method of methods) {
    const value = String(method).trim().toUpperCase();
    if (!value || !METHOD_TOKEN_RE.test(value)) {
      throw new TypeError(`invalid allowed resource method: ${String(method)}`);
    }
    normalized.add(value);
  }

  const sorted = [...normalized].sort();
  if (sorted.length === 0) {
    throw new TypeError(
      'method-not-allowed resource response requires allowed methods',
    );
  }
  return sorted.join(', ');
}

function safeResourceJson(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new TypeError(
      'resource JSON response body must be JSON-serializable at the top level',
    );
  }

  // Mirrors html.safeJson so resource responses are safe beside HTML delivery
  // contexts such as hydration sidecars and script-adjacent fetch payloads.
  return serialized
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}
