export const FACE_HYDRATION_DATA_SCRIPT_ID = '__FACETHEORY_DATA__';
export const FACE_HYDRATION_DATA_LINK_ID = '__FACETHEORY_DATA_URL__';
export const FACE_HYDRATION_DATA_LINK_REL = 'facetheory-hydration';

export interface ReadFaceHydrationDataOptions {
  document?: Document;
}

export type ReadFaceHydrationDataInput =
  | Document
  | ReadFaceHydrationDataOptions;

export interface ResolveFaceHydrationUrlOptions {
  allowedOrigin?: string | URL;
  baseUrl?: string | URL;
  document?: Document;
}

export interface FetchExternalFaceHydrationDataOptions extends ResolveFaceHydrationUrlOptions {
  fetcher?: typeof fetch;
  requestInit?: RequestInit;
}

export type LoadFaceHydrationDataOptions =
  FetchExternalFaceHydrationDataOptions;

export interface ReportHydrationFailureOptions extends ResolveFaceHydrationUrlOptions {
  endpoint: string | URL;
  framework?: string;
  route?: string;
  tags?: Record<string, string | number | boolean | null | undefined>;
  navigator?: Pick<Navigator, 'sendBeacon'>;
  window?: Pick<Window, 'location'>;
  fetcher?: typeof fetch;
}

export interface HydrationFailurePayload {
  event: 'facetheory.hydration_failure';
  framework: string;
  message: string;
  errorClass: string;
  path: string;
  componentStack?: string;
  digest?: string;
  tags?: Record<string, string>;
}

export type HydrationFailureReporter = (
  error: unknown,
  errorInfo?: unknown,
) => void;

interface FaceHydrationFetchResponse {
  headers: Pick<Headers, 'get'>;
  json: () => Promise<unknown>;
  ok: boolean;
  status: number;
  url: string;
}

export function readFaceInlineHydrationData<T = unknown>(
  doc?: Document,
): T | null;
export function readFaceInlineHydrationData<T = unknown>(
  options?: ReadFaceHydrationDataOptions,
): T | null;
export function readFaceInlineHydrationData<T = unknown>(
  input?: ReadFaceHydrationDataInput,
): T | null {
  const inline = readInlineHydrationScript(resolveReadHydrationDocument(input));
  if (!inline.present) return null;
  return parseHydrationJson<T>(inline.text);
}

export function readFaceExternalHydrationDataUrl(doc?: Document): string | null;
export function readFaceExternalHydrationDataUrl(
  options?: ReadFaceHydrationDataOptions,
): string | null;
export function readFaceExternalHydrationDataUrl(
  input?: ReadFaceHydrationDataInput,
): string | null {
  return readExternalHydrationUrl(resolveReadHydrationDocument(input));
}

export const readFaceHydrationData = readFaceInlineHydrationData;
export const readFaceHydrationDataUrl = readFaceExternalHydrationDataUrl;

export async function loadFaceHydrationData<T = unknown>(
  options: LoadFaceHydrationDataOptions = {},
): Promise<T | null> {
  const doc = resolveHydrationDocument(options.document);
  const inline = readInlineHydrationScript(doc);
  if (inline.present) return parseHydrationJson<T>(inline.text);

  const dataUrl = readExternalHydrationUrl(doc);
  if (dataUrl === null) return null;

  const fetchOptions: FetchExternalFaceHydrationDataOptions = { document: doc };
  if (options.allowedOrigin !== undefined)
    fetchOptions.allowedOrigin = options.allowedOrigin;
  if (options.baseUrl !== undefined) fetchOptions.baseUrl = options.baseUrl;
  if (options.fetcher !== undefined) fetchOptions.fetcher = options.fetcher;
  if (options.requestInit !== undefined)
    fetchOptions.requestInit = options.requestInit;
  return fetchExternalFaceHydrationData<T>(dataUrl, fetchOptions);
}

export async function fetchExternalFaceHydrationData<T = unknown>(
  dataUrl: string | URL,
  options: FetchExternalFaceHydrationDataOptions = {},
): Promise<T> {
  const requestUrl = resolveSameOriginFaceHydrationUrl(dataUrl, options);
  const fetcher = options.fetcher ?? globalThis.fetch;
  if (typeof fetcher !== 'function') {
    throw new Error(
      'FaceTheory hydration loader requires fetch in the current environment',
    );
  }

  const response = await fetcher(
    requestUrl.toString(),
    createHydrationRequestInit(options.requestInit),
  );
  assertHydrationFetchResponse(response);

  const finalUrl = response.url === '' ? requestUrl : response.url;
  const responseUrlOptions: ResolveFaceHydrationUrlOptions = {
    baseUrl: requestUrl,
  };
  if (options.allowedOrigin !== undefined) {
    responseUrlOptions.allowedOrigin = options.allowedOrigin;
  }
  if (options.document !== undefined) {
    responseUrlOptions.document = options.document;
  }
  try {
    resolveSameOriginFaceHydrationUrl(finalUrl, responseUrlOptions);
  } catch (error) {
    throw new Error(
      'FaceTheory hydration data fetch redirected or resolved cross-origin',
      { cause: error },
    );
  }

  if (!response.ok) {
    throw new Error(
      `FaceTheory hydration data fetch failed with HTTP ${String(response.status)}`,
    );
  }

  const contentType = response.headers.get('content-type');
  if (
    contentType !== null &&
    contentType.trim() !== '' &&
    !isJsonContentType(contentType)
  ) {
    throw new Error('FaceTheory hydration data response was not JSON');
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (error) {
    throw new Error('FaceTheory hydration data response was not valid JSON', {
      cause: error,
    });
  }

  if (data === undefined) {
    throw new Error('FaceTheory hydration data response shape was invalid');
  }

  return data as T;
}

export function reportHydrationFailure(
  options: ReportHydrationFailureOptions,
): HydrationFailureReporter {
  const endpoint = resolveSameOriginHydrationFailureEndpoint(options);

  return (error: unknown, errorInfo?: unknown): void => {
    const payload = JSON.stringify(
      buildHydrationFailurePayload(options, error, errorInfo),
    );

    const beaconNavigator = options.navigator ?? resolveGlobalNavigator();
    if (beaconNavigator?.sendBeacon?.(endpoint.toString(), payload)) {
      return;
    }

    const fetcher = options.fetcher ?? globalThis.fetch;
    if (typeof fetcher !== 'function') return;

    void Promise.resolve(
      fetcher(endpoint.toString(), {
        body: payload,
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        keepalive: true,
        method: 'POST',
        redirect: 'error',
      }),
    ).catch(() => undefined);
  };
}

export function resolveSameOriginFaceHydrationUrl(
  dataUrl: string | URL,
  options: ResolveFaceHydrationUrlOptions = {},
): URL {
  const raw = String(dataUrl);
  if (raw.trim() === '') {
    throw new Error('FaceTheory hydration data URL must not be empty');
  }

  const baseHref = resolveHydrationBaseHref(options);
  const allowedOrigin = resolveHydrationAllowedOrigin(options, baseHref);

  let resolved: URL;
  try {
    resolved = new URL(raw, baseHref);
  } catch (error) {
    throw new Error('FaceTheory hydration data URL is invalid', {
      cause: error,
    });
  }

  if (!isHttpUrl(resolved)) {
    throw new Error('FaceTheory hydration data URL must use http(s)');
  }

  if (resolved.origin !== allowedOrigin) {
    throw new Error('FaceTheory hydration data URL resolved cross-origin');
  }

  return resolved;
}

function resolveSameOriginHydrationFailureEndpoint(
  options: ReportHydrationFailureOptions,
): URL {
  try {
    return resolveSameOriginFaceHydrationUrl(options.endpoint, options);
  } catch (error) {
    throw new Error(
      'FaceTheory hydration failure endpoint must be a same-origin http(s) URL',
      { cause: error },
    );
  }
}

function buildHydrationFailurePayload(
  options: ReportHydrationFailureOptions,
  error: unknown,
  errorInfo: unknown,
): HydrationFailurePayload {
  const payload: HydrationFailurePayload = {
    event: 'facetheory.hydration_failure',
    framework: normalizeHydrationFailureLabel(options.framework, 'unknown'),
    message: hydrationFailureMessage(error),
    errorClass: hydrationFailureErrorClass(error),
    path: options.route ?? resolveHydrationFailurePath(options),
  };

  const componentStack = readHydrationFailureString(
    errorInfo,
    'componentStack',
  );
  if (componentStack) payload.componentStack = componentStack;
  const digest = readHydrationFailureString(errorInfo, 'digest');
  if (digest) payload.digest = digest;

  const tags = normalizeHydrationFailureTags(options.tags);
  if (Object.keys(tags).length > 0) payload.tags = tags;

  return payload;
}

function resolveHydrationFailurePath(
  options: ReportHydrationFailureOptions,
): string {
  const location =
    options.window?.location ??
    options.document?.defaultView?.location ??
    (typeof window !== 'undefined' ? window.location : null);
  if (!location) return '';
  return `${location.pathname}${location.search}`;
}

function hydrationFailureMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return String(error ?? 'Unknown hydration failure');
}

function hydrationFailureErrorClass(error: unknown): string {
  if (error && typeof error === 'object') {
    const name = normalizeHydrationFailureLabel(
      (error as { name?: unknown }).name,
      '',
    );
    if (name) return name;
    const ctorName = normalizeHydrationFailureLabel(
      (error as { constructor?: { name?: unknown } }).constructor?.name,
      '',
    );
    if (ctorName) return ctorName;
    return 'Object';
  }

  const typeName = normalizeHydrationFailureLabel(typeof error, 'Unknown');
  return typeName === 'Unknown' ? typeName : `NonError_${typeName}`;
}

function readHydrationFailureString(
  value: unknown,
  key: string,
): string | null {
  if (!value || typeof value !== 'object') return null;
  const raw = (value as Record<string, unknown>)[key];
  const normalized = String(raw ?? '').trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeHydrationFailureTags(
  tags:
    | Record<string, string | number | boolean | null | undefined>
    | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tags ?? {})) {
    const normalizedKey = normalizeHydrationFailureLabel(key, '');
    if (!normalizedKey || value === null || value === undefined) continue;
    out[normalizedKey] = String(value);
  }
  return out;
}

function normalizeHydrationFailureLabel(
  value: unknown,
  fallback: string,
): string {
  const normalized = String(value ?? '')
    .trim()
    .replace(/[^A-Za-z0-9_.:-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || fallback;
}

function resolveGlobalNavigator(): Pick<Navigator, 'sendBeacon'> | null {
  if (typeof navigator === 'undefined') return null;
  return navigator;
}

function resolveReadHydrationDocument(
  input: ReadFaceHydrationDataInput | undefined,
): Document {
  if (isDocumentLike(input)) return input;
  return resolveHydrationDocument(input?.document);
}

function resolveHydrationDocument(doc: Document | undefined): Document {
  if (doc !== undefined) return doc;
  if (typeof document !== 'undefined') return document;
  throw new Error(
    'FaceTheory hydration loader requires document in the current environment',
  );
}

function isDocumentLike(value: unknown): value is Document {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { getElementById?: unknown }).getElementById ===
      'function' &&
    typeof (value as { querySelector?: unknown }).querySelector === 'function'
  );
}

function readInlineHydrationScript(
  doc: Document,
): { present: false } | { present: true; text: string } {
  const el = doc.getElementById(FACE_HYDRATION_DATA_SCRIPT_ID);
  if (!isJsonHydrationScriptElement(el)) return { present: false };
  return { present: true, text: el.textContent ?? '' };
}

function isJsonHydrationScriptElement(
  el: Element | null,
): el is HTMLScriptElement {
  if (el?.tagName.toLowerCase() !== 'script') return false;
  return isJsonScriptType(el.getAttribute('type'));
}

function isJsonScriptType(type: string | null): boolean {
  const mediaType = String(type ?? '')
    .split(';', 1)[0]
    ?.trim()
    .toLowerCase();
  return (
    mediaType === 'application/json' || Boolean(mediaType?.endsWith('+json'))
  );
}

function readExternalHydrationUrl(doc: Document): string | null {
  const byId = doc.getElementById(FACE_HYDRATION_DATA_LINK_ID);
  if (byId?.tagName.toLowerCase() === 'link') {
    const href = byId.getAttribute('href');
    if (href) return href;
  }

  const byRel = doc.querySelector(
    `link[rel="${FACE_HYDRATION_DATA_LINK_REL}"]`,
  );
  if (!byRel) return null;
  const href = byRel.getAttribute('href');
  return href || null;
}

function parseHydrationJson<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new Error('FaceTheory inline hydration data was not valid JSON', {
      cause: error,
    });
  }
}

function resolveHydrationBaseHref(
  options: ResolveFaceHydrationUrlOptions,
): string {
  const fallback =
    resolveDocumentBaseHref(options.document) ?? resolveGlobalBaseHref();
  if (options.baseUrl !== undefined) {
    try {
      return fallback === null
        ? new URL(String(options.baseUrl)).toString()
        : new URL(String(options.baseUrl), fallback).toString();
    } catch (error) {
      throw new Error('FaceTheory hydration baseUrl is invalid', {
        cause: error,
      });
    }
  }

  if (fallback !== null) return fallback;
  if (options.allowedOrigin !== undefined) {
    return `${normalizeAllowedOrigin(options.allowedOrigin)}/`;
  }

  throw new Error(
    'FaceTheory hydration loader requires document, baseUrl, or allowedOrigin to resolve external hydration data',
  );
}

function resolveHydrationAllowedOrigin(
  options: ResolveFaceHydrationUrlOptions,
  baseHref: string,
): string {
  if (options.allowedOrigin !== undefined) {
    return normalizeAllowedOrigin(options.allowedOrigin);
  }

  const documentOrigin = options.document?.defaultView?.location.origin;
  if (documentOrigin && documentOrigin !== 'null') {
    return normalizeAllowedOrigin(documentOrigin);
  }

  const globalOrigin = resolveGlobalOrigin();
  if (globalOrigin !== null) return normalizeAllowedOrigin(globalOrigin);

  let base: URL;
  try {
    base = new URL(baseHref);
  } catch (error) {
    throw new Error('FaceTheory hydration baseUrl is invalid', {
      cause: error,
    });
  }

  if (!isHttpUrl(base)) {
    throw new Error('FaceTheory hydration allowed origin must use http(s)');
  }
  return base.origin;
}

function normalizeAllowedOrigin(origin: string | URL): string {
  let parsed: URL;
  try {
    parsed = new URL(String(origin));
  } catch (error) {
    throw new Error('FaceTheory hydration allowedOrigin is invalid', {
      cause: error,
    });
  }

  if (!isHttpUrl(parsed)) {
    throw new Error('FaceTheory hydration allowedOrigin must use http(s)');
  }
  return parsed.origin;
}

function resolveDocumentBaseHref(doc: Document | undefined): string | null {
  if (doc === undefined) return null;
  if (doc.baseURI) return doc.baseURI;
  if (doc.URL) return doc.URL;
  return doc.defaultView?.location.href ?? null;
}

function resolveGlobalBaseHref(): string | null {
  if (typeof window === 'undefined') return null;
  return window.location.href;
}

function resolveGlobalOrigin(): string | null {
  if (typeof window === 'undefined') return null;
  return window.location.origin;
}

function isHttpUrl(url: URL): boolean {
  return url.protocol === 'http:' || url.protocol === 'https:';
}

function createHydrationRequestInit(
  requestInit: RequestInit | undefined,
): RequestInit {
  return {
    credentials: 'same-origin',
    redirect: 'follow',
    ...(requestInit ?? {}),
    headers: withHydrationAcceptHeader(requestInit?.headers),
  };
}

function withHydrationAcceptHeader(
  headers: HeadersInit | undefined,
): HeadersInit {
  if (headers === undefined || isHeaderRecord(headers)) {
    return { accept: 'application/json', ...(headers ?? {}) };
  }

  const merged = new Headers(headers);
  if (!merged.has('accept')) merged.set('accept', 'application/json');
  return merged;
}

function isHeaderRecord(
  headers: HeadersInit,
): headers is Record<string, string> {
  return !Array.isArray(headers) && !isHeadersLike(headers);
}

function isHeadersLike(value: unknown): value is Headers {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { get?: unknown }).get === 'function' &&
    typeof (value as { set?: unknown }).set === 'function'
  );
}

function assertHydrationFetchResponse(
  response: unknown,
): asserts response is FaceHydrationFetchResponse {
  if (typeof response !== 'object' || response === null) {
    throw new Error(
      'FaceTheory hydration data fetch returned an invalid response',
    );
  }

  const candidate = response as Partial<FaceHydrationFetchResponse>;
  if (
    typeof candidate.ok !== 'boolean' ||
    typeof candidate.status !== 'number' ||
    typeof candidate.url !== 'string' ||
    typeof candidate.json !== 'function' ||
    !candidate.headers ||
    typeof candidate.headers.get !== 'function'
  ) {
    throw new Error(
      'FaceTheory hydration data fetch returned an invalid response',
    );
  }
}

function isJsonContentType(contentType: string): boolean {
  const mediaType = contentType.split(';', 1)[0]?.trim().toLowerCase();
  return (
    mediaType === 'application/json' || Boolean(mediaType?.endsWith('+json'))
  );
}
