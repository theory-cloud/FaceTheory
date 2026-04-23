export type Headers = Record<string, string[]>;
export type Query = Record<string, string[]>;
export type CookieMap = Record<string, string>;

export type FaceAttributes = Record<
  string,
  string | number | boolean | null | undefined
>;

export type FaceHeadTag =
  | { type: 'title'; text: string }
  | { type: 'meta'; attrs: FaceAttributes }
  | { type: 'link'; attrs: FaceAttributes }
  | { type: 'script'; attrs: FaceAttributes; body?: string }
  | { type: 'style'; cssText: string; attrs?: FaceAttributes }
  /**
   * Raw HTML escape hatch. FaceTheory inserts this verbatim into `<head>`
   * without escaping or nonce augmentation.
   */
  | { type: 'raw'; html: string };

export interface FaceStyleTag {
  /**
   * Raw CSS text for a framework-safe `<style>` tag path. Prefer this over
   * injecting `<style>...</style>` through `head.html`.
   */
  cssText: string;
  attrs?: FaceAttributes;
}

export interface FaceRequest {
  method: string;
  path: string;
  query?: Query;
  headers?: Headers;
  cookies?: CookieMap;
  body?: Uint8Array;
  isBase64?: boolean;
  cspNonce?: string | null;
}

export type FaceBody = Uint8Array | AsyncIterable<Uint8Array>;

export interface FaceResponse {
  status: number;
  headers: Headers;
  cookies: string[];
  body: FaceBody;
  isBase64: boolean;
}

export type FaceMode = 'ssr' | 'ssg' | 'isr';

export interface FaceContext {
  request: Readonly<Required<FaceRequest>>;
  params: Readonly<Record<string, string>>;
  proxy: string | null;
}

export interface FaceHead {
  title?: string;
  /**
   * Raw HTML inserted verbatim into `<head>`. This bypasses FaceTheory's
   * escaped `headTags` / `styleTags` emission and should be treated as an
   * explicit unsafe escape hatch.
   */
  html?: string;
}

export interface FaceHydration {
  data: unknown;
  bootstrapModule: string;
}

export interface FaceRenderResult {
  status?: number;
  headers?: Record<string, string | string[]>;
  cookies?: string[];
  lang?: string;
  htmlAttrs?: FaceAttributes;
  bodyAttrs?: FaceAttributes;
  head?: FaceHead;
  headTags?: FaceHeadTag[];
  styleTags?: FaceStyleTag[];
  html: string | AsyncIterable<Uint8Array>;
  hydration?: FaceHydration;
}

export interface UIIntegrationContribution {
  headTags?: FaceHeadTag[];
  styleTags?: FaceStyleTag[];
}

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

export interface PreparedUIIntegration<
  TTree = unknown,
  TIntegration extends UIIntegration<TTree> = UIIntegration<TTree>,
> {
  integration: TIntegration;
  state: unknown;
}

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

export interface FaceModule {
  route: string;
  mode: FaceMode;
  generateStaticParams?: () => Promise<Array<Record<string, string>>>;
  revalidateSeconds?: number;
  load?: (ctx: FaceContext) => Promise<unknown>;
  render: (
    ctx: FaceContext,
    data: unknown,
  ) => Promise<FaceRenderResult> | FaceRenderResult;
}

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

export function trimLeadingSlashes(value: string): string {
  const normalized = String(value ?? '');
  let start = 0;
  while (start < normalized.length && normalized.charCodeAt(start) === 47)
    start += 1;
  return normalized.slice(start);
}

export function trimTrailingSlashes(value: string): string {
  const normalized = String(value ?? '');
  let end = normalized.length;
  while (end > 0 && normalized.charCodeAt(end - 1) === 47) end -= 1;
  return normalized.slice(0, end);
}

export function trimOuterSlashes(value: string): string {
  return trimTrailingSlashes(trimLeadingSlashes(value));
}

export function canonicalizeHeaders(headers: Headers | undefined): Headers {
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

export function cloneQuery(query: Query | undefined): Query {
  if (!query) return {};
  const out = new Map<string, string[]>();
  for (const [key, values] of Object.entries(query)) {
    out.set(key, Array.isArray(values) ? values.map(String) : [String(values)]);
  }
  return stringRecord(out);
}

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

export function cloneCookies(cookies: CookieMap | undefined): CookieMap {
  if (!cookies) return {};
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(cookies)) {
    out.set(key, String(value));
  }
  return stringRecord(out);
}

export function parseCookiesFromHeaders(
  headers: Headers | undefined,
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
