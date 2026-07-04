/**
 * HTTP headers normalized to lowercase names, preserving each field value separately
 * so Set-Cookie and repeated headers do not collapse during Lambda or test-harness
 * serialization.
 */
export type FaceHeaders = Record<string, string[]>;

/**
 * @deprecated Use `FaceHeaders`. The legacy `Headers` alias remains for 3.x
 * compatibility and will be removed in v4.0.0.
 */
export type Headers = FaceHeaders;
/**
 * Caller-facing response header value accepted from a Face render result before
 * FaceTheory canonicalizes it into `FaceHeaders`.
 */
export type FaceResponseHeaderValue = string | readonly string[];
/**
 * Header map shape accepted from `FaceRenderResult.headers`; keys are canonicalized
 * and scalar values are promoted to arrays at response conversion time.
 */
export type FaceResponseHeaders = Record<string, FaceResponseHeaderValue>;
/**
 * Parsed query string map where every key keeps all submitted values in order for
 * deterministic routing, ISR cache keys, and hydration sidecar variants.
 */
export type Query = Record<string, string[]>;
/**
 * Request cookie map used by Face loaders and ISR cache-key partitioning; raw cookie
 * values must not be embedded into cache keys or logs.
 */
export type CookieMap = Record<string, string>;

/**
 * HTML attribute bag accepted by head/style/document-shell primitives; `false`,
 * `null`, and `undefined` values are omitted during deterministic rendering.
 */
export type FaceAttributes = Record<
  string,
  string | number | boolean | null | undefined
>;

/**
 * Structured head element declaration emitted through FaceTheory's deterministic head
 * primitive; use this instead of placing head tags inside framework component trees.
 */
export type FaceHeadTag =
  | { type: 'title'; text: string }
  | { type: 'meta'; attrs: FaceAttributes }
  | { type: 'link'; attrs: FaceAttributes }
  | { type: 'script'; attrs: FaceAttributes; body?: string }
  | { type: 'style'; cssText: string; attrs?: FaceAttributes }
  /**
   * Raw HTML escape hatch. FaceTheory inserts this verbatim into `<head>`
   * without escaping or nonce augmentation. Prefer structured tags unless the
   * caller fully owns the HTML.
   */
  | { type: 'raw'; html: string };

/**
 * Structured style element produced by adapters or integrations and emitted with the
 * head primitive so server HTML and client hydration see matching style tags.
 */
export interface FaceStyleTag {
  /**
   * Raw CSS text for a framework-safe `<style>` tag path. Prefer this over
   * injecting `<style>...</style>` through `head.html`.
   */
  cssText: string;
  attrs?: FaceAttributes;
}

/**
 * Per-response CSP capability contract used by strict render paths to decide whether
 * inline scripts, inline styles, or raw head HTML are permitted.
 */
export interface FaceCspPolicy {
  /**
   * Whether FaceTheory-owned `<script>` tags may contain inline body text.
   * Set this to `false` for strict no-inline CSP routes.
   */
  inlineScripts?: boolean;
  /**
   * Whether FaceTheory-owned `<style>` tags may contain inline CSS text or
   * structured head attributes may contain inline style declarations.
   * Set this to `false` for strict no-inline CSP routes.
   */
  inlineStyles?: boolean;
  /**
   * Whether raw, caller-owned head HTML may be emitted through
   * `headTags: [{ type: "raw", html }]`.
   */
  rawHead?: boolean;
}

/**
 * Hydration payload shape for legacy/non-strict routes that intentionally inline
 * server render data into the HTML document.
 */
export interface FaceInlineHydration {
  /**
   * Optional for backward compatibility: the legacy hydration object shape is
   * still `{ data, bootstrapModule }`, and is treated as inline hydration.
   */
  type?: 'inline';
  data: unknown;
  bootstrapModule: string;
}

/**
 * Hydration payload shape for strict routes that keep render data outside the document
 * and load it from a same-origin sidecar before client hydration.
 */
export interface FaceExternalHydration {
  type: 'external';
  /**
   * The exact data used for the server render. Strict renderers do not inline
   * this value, but SSG/ISR/SSR sidecar helpers can persist it at `dataUrl`.
   */
  data: unknown;
  /**
   * Same-origin JSON URL from which the client loads `data` before hydration.
   */
  dataUrl: string;
  bootstrapModule: string;
}

/**
 * Framework-neutral request passed to resources, loaders, and renderers after
 * Lambda/test adapters normalize path, query, headers, cookies, and CSP nonce state.
 */
export interface FaceRequest {
  method: string;
  path: string;
  query?: Query;
  headers?: FaceHeaders;
  cookies?: CookieMap;
  body?: Uint8Array;
  isBase64?: boolean;
  cspNonce?: string | null;
}

/**
 * Response body contract for buffered bytes or streaming byte iterables; streaming
 * bodies are document-wrapped before the first chunk is flushed.
 */
export type FaceBody = Uint8Array | AsyncIterable<Uint8Array>;

/**
 * Framework-neutral HTTP response returned by FaceTheory handlers, resource routes,
 * and test harnesses before Lambda URL serialization.
 */
export interface FaceResponse {
  status: number;
  headers: FaceHeaders;
  cookies: string[];
  body: FaceBody;
  isBase64: boolean;
}

/**
 * Server render-mode selector for a Face: `ssr` renders every request, `ssg` renders
 * at build time, and `isr` serves cached HTML with blocking regeneration. SPA is a
 * client runtime layered on SSR, not a fourth Face mode.
 */
export type FaceMode = 'ssr' | 'ssg' | 'isr';

/**
 * Route matching policy for slash variants: strict preserves exact paths, redirect
 * emits canonical 308s, and normalize accepts both without redirecting.
 */
export type TrailingSlashPolicy = 'strict' | 'redirect' | 'normalize';

/**
 * Construction-time warning code emitted for soft contract gaps that remain warnings
 * in 3.x and are candidates for stricter enforcement in v4.
 */
export type FaceContractWarningCode =
  | 'isr.revalidate_seconds_missing'
  | 'ssg.generate_static_params_missing';

/**
 * Structured observability record describing a Face contract warning discovered while
 * constructing a FaceApp.
 */
export interface FaceContractWarningLogRecord {
  level: 'warn';
  event: 'facetheory.app.contract.warning';
  warningCode: FaceContractWarningCode;
  routePattern: string;
  mode: FaceMode;
  message: string;
}

/**
 * Per-request render context supplied to resource handlers, `load`, and `render`;
 * `proxy` is the catch-all route suffix captured by `{name+}`/`{name*}` patterns, or
 * `null` for non-proxy matches.
 */
export interface FaceContext {
  request: Readonly<Required<FaceRequest>>;
  params: Readonly<Record<string, string>>;
  proxy: string | null;
}

/**
 * Handler for a raw resource route that bypasses document wrapping and returns a
 * complete `FaceResponse`.
 */
export type FaceResourceHandler = (
  ctx: FaceContext,
) => Promise<FaceResponse> | FaceResponse;

/**
 * Raw resource route registered beside Faces for sidecars, JSON endpoints, or assets
 * that must use FaceTheory routing without HTML document assembly.
 */
export interface FaceResourceRoute {
  route: string;
  handle: FaceResourceHandler;
}

/**
 * Legacy high-level head fields accepted by `FaceRenderResult`; prefer `headTags` and
 * `styleTags` for deterministic structured head emission.
 */
export interface FaceHead {
  title?: string;
  /**
   * Legacy head text inserted into `<head>` after HTML escaping. Use
   * structured `headTags` / `styleTags` for actual tags. The explicit
   * `headTags: [{ type: 'raw', html }]` escape hatch remains available only
   * for caller-owned HTML.
   */
  html?: string;
}

/**
 * Union of inline and external hydration payloads; strict CSP routes should prefer the
 * external variant so data is not embedded in executable document context.
 */
export type FaceHydration = FaceInlineHydration | FaceExternalHydration;

/**
 * Output of a Face render pass before HTTP conversion, including document attrs,
 * deterministic head/style tags, CSP policy, body HTML/stream, and optional hydration
 * data.
 */
export interface FaceRenderResult {
  status?: number;
  headers?: FaceResponseHeaders;
  cookies?: string[];
  lang?: string;
  htmlAttrs?: FaceAttributes;
  bodyAttrs?: FaceAttributes;
  head?: FaceHead;
  headTags?: FaceHeadTag[];
  styleTags?: FaceStyleTag[];
  csp?: FaceCspPolicy;
  html: string | AsyncIterable<Uint8Array>;
  hydration?: FaceHydration;
}

/**
 * Head/style contribution returned by an adapter-neutral UI integration after the
 * framework render path has prepared request-local state.
 */
export interface UIIntegrationContribution {
  headTags?: FaceHeadTag[];
  styleTags?: FaceStyleTag[];
}

/**
 * Adapter-neutral integration hook contract for wrapping framework trees, collecting
 * deterministic head/style tags, and finalizing render output without leaking
 * framework specifics into core.
 */
export interface UIIntegration<TTree = unknown, TState = unknown> {
  name: string;
  createState?: (ctx: FaceContext) => TState | Promise<TState>;
  wrapTree?: (tree: TTree, ctx: FaceContext, state: TState) => TTree;
  contribute?: (
    ctx: FaceContext,
    state: TState,
  ) => UIIntegrationContribution | Promise<UIIntegrationContribution>;
  finalize?: (
    out: FaceRenderResult,
    ctx: FaceContext,
    state: TState,
  ) => FaceRenderResult | Promise<FaceRenderResult>;
}

/**
 * Request-local integration state paired with the integration that produced it,
 * preserving isolation across overlapping renders.
 */
export interface PreparedUIIntegration<
  TTree = unknown,
  TIntegration extends UIIntegration<TTree> = UIIntegration<TTree>,
> {
  integration: TIntegration;
  state: unknown;
}

/**
 * Runs each integration's optional state factory for one request before an adapter
 * wraps or renders the tree.
 */
export async function prepareUIIntegrations<
  TTree,
  TIntegration extends UIIntegration<TTree>,
>(
  integrations: ReadonlyArray<TIntegration>,
  ctx: FaceContext,
): Promise<Array<PreparedUIIntegration<TTree, TIntegration>>> {
  const prepared: Array<PreparedUIIntegration<TTree, TIntegration>> = [];
  for (const integration of integrations) {
    prepared.push({
      integration,
      state: integration.createState
        ? await integration.createState(ctx)
        : undefined,
    });
  }
  return prepared;
}

/**
 * Route module registered with `createFaceApp`. `load` runs on the server before
 * `render` for SSR requests, SSG builds, and ISR regenerations; ISR cache hits do not
 * rerun it. `generateStaticParams` enumerates SSG paths, and `revalidateSeconds`
 * controls ISR freshness.
 */
export interface FaceModule<TData = unknown> {
  route: string;
  mode: FaceMode;
  generateStaticParams?: () => Promise<Array<Record<string, string>>>;
  revalidateSeconds?: number;
  load?: (ctx: FaceContext) => Promise<TData> | TData;
  render(
    ctx: FaceContext,
    data: TData,
  ): Promise<FaceRenderResult> | FaceRenderResult;
}

/**
 * Normalizes a route or request path to a leading-slash pathname with query text
 * removed for deterministic routing.
 */
export function normalizePath(path: string): string {
  let value = String(path ?? '').trim();
  if (!value) value = '/';
  const idx = value.indexOf('?');
  if (idx >= 0) value = value.slice(0, idx);
  if (!value.startsWith('/')) value = `/${value}`;
  if (!value) value = '/';
  return value;
}

function stringRecord<T>(
  entries: Iterable<readonly [string, T]> = [],
): Record<string, T> {
  return Object.fromEntries(entries) as Record<string, T>;
}

/**
 * Removes leading slash characters without regular-expression backtracking, used by
 * URL and storage-key normalization.
 */
export function trimLeadingSlashes(value: string): string {
  const normalized = String(value ?? '');
  let start = 0;
  while (start < normalized.length && normalized.charCodeAt(start) === 47)
    start += 1;
  return normalized.slice(start);
}

/**
 * Removes trailing slash characters without touching interior path separators.
 */
export function trimTrailingSlashes(value: string): string {
  const normalized = String(value ?? '');
  let end = normalized.length;
  while (end > 0 && normalized.charCodeAt(end - 1) === 47) end -= 1;
  return normalized.slice(0, end);
}

/**
 * Removes both leading and trailing slash characters while preserving the interior
 * path segment sequence.
 */
export function trimOuterSlashes(value: string): string {
  return trimTrailingSlashes(trimLeadingSlashes(value));
}

/**
 * Canonicalizes a header map to lowercase names and array values while preserving
 * repeated header values.
 */
export function canonicalizeHeaders(headers: FaceHeaders | undefined): FaceHeaders {
  if (!headers) return {};
  const out = new Map<string, string[]>();
  for (const [key, values] of Object.entries(headers)) {
    const lower = String(key).trim().toLowerCase();
    if (!lower) continue;
    out.set(
      lower,
      Array.isArray(values) ? values.map(String) : [String(values)],
    );
  }
  return stringRecord(out);
}

/**
 * Clones a parsed query map so handlers can normalize request state without retaining
 * caller-owned arrays.
 */
export function cloneQuery(query: Query | undefined): Query {
  if (!query) return {};
  const out = new Map<string, string[]>();
  for (const [key, values] of Object.entries(query)) {
    out.set(key, Array.isArray(values) ? values.map(String) : [String(values)]);
  }
  return stringRecord(out);
}

/**
 * Parses a URL query string into FaceTheory's multi-value `Query` shape while
 * preserving repeated-key order.
 */
export function parseQueryString(queryString: string): Query {
  if (!queryString) return {};
  const out = new Map<string, string[]>();

  const params = new URLSearchParams(
    queryString.startsWith('?') ? queryString.slice(1) : queryString,
  );
  for (const [key, value] of params) {
    const existingValues = out.get(key);
    if (existingValues) {
      existingValues.push(value);
    } else {
      out.set(key, [value]);
    }
  }

  return stringRecord(out);
}

/**
 * Clones a cookie map into string values for immutable request context construction.
 */
export function cloneCookies(cookies: CookieMap | undefined): CookieMap {
  if (!cookies) return {};
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(cookies)) {
    out.set(key, String(value));
  }
  return stringRecord(out);
}

/**
 * Parses Cookie header values into a request cookie map, preserving undecodable values
 * rather than throwing during request normalization.
 */
export function parseCookiesFromHeaders(
  headers: FaceHeaders | undefined,
): CookieMap {
  if (!headers) return {};
  const out = new Map<string, string>();

  const cookieHeaderValues: string[] = [];
  for (const [headerName, headerValues] of Object.entries(headers)) {
    if (String(headerName).trim().toLowerCase() !== 'cookie') continue;
    cookieHeaderValues.push(
      ...(Array.isArray(headerValues)
        ? headerValues
        : [String(headerValues)]
      ).map(String),
    );
  }

  for (const cookieHeader of cookieHeaderValues) {
    for (const part of cookieHeader.split(';')) {
      const segment = part.trim();
      if (!segment) continue;

      const equalsIdx = segment.indexOf('=');
      if (equalsIdx <= 0) continue;

      const name = segment.slice(0, equalsIdx).trim();
      if (!name) continue;

      let value = segment.slice(equalsIdx + 1).trim();
      if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
        value = value.slice(1, -1);
      }

      try {
        out.set(name, decodeURIComponent(value));
      } catch {
        out.set(name, value);
      }
    }
  }

  return stringRecord(out);
}
