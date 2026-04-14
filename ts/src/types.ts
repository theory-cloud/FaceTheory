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
  | { type: 'raw'; html: string };

export interface FaceStyleTag {
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

export interface UIIntegration<TTree = unknown> {
  name: string;
  wrapTree?: (tree: TTree, ctx: FaceContext) => TTree;
  contribute?: (
    ctx: FaceContext,
  ) => UIIntegrationContribution | Promise<UIIntegrationContribution>;
  finalize?: (
    out: FaceRenderResult,
    ctx: FaceContext,
  ) => FaceRenderResult | Promise<FaceRenderResult>;
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

function setOwnEnumerableValue<T>(
  record: Record<string, T>,
  key: string,
  value: T,
): void {
  Object.defineProperty(record, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function hasOwnEnumerableValue(record: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
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
  const out: Headers = {};
  if (!headers) return out;
  for (const [key, values] of Object.entries(headers)) {
    const lower = String(key).trim().toLowerCase();
    if (!lower) continue;
    setOwnEnumerableValue(
      out,
      lower,
      Array.isArray(values) ? values.map(String) : [String(values)],
    );
  }
  return out;
}

export function cloneQuery(query: Query | undefined): Query {
  const out: Query = {};
  if (!query) return out;
  for (const [key, values] of Object.entries(query)) {
    setOwnEnumerableValue(
      out,
      key,
      Array.isArray(values) ? values.map(String) : [String(values)],
    );
  }
  return out;
}

export function parseQueryString(queryString: string): Query {
  const out: Query = {};
  if (!queryString) return out;

  const params = new URLSearchParams(
    queryString.startsWith('?') ? queryString.slice(1) : queryString,
  );
  for (const [key, value] of params) {
    const existingValues = hasOwnEnumerableValue(out, key)
      ? out[key]
      : undefined;
    if (existingValues) {
      existingValues.push(value);
    } else {
      setOwnEnumerableValue(out, key, [value]);
    }
  }

  return out;
}

export function cloneCookies(cookies: CookieMap | undefined): CookieMap {
  const out: CookieMap = {};
  if (!cookies) return out;
  for (const [key, value] of Object.entries(cookies)) {
    setOwnEnumerableValue(out, key, String(value));
  }
  return out;
}

export function parseCookiesFromHeaders(
  headers: Headers | undefined,
): CookieMap {
  const out: CookieMap = {};
  if (!headers) return out;

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
        setOwnEnumerableValue(out, name, decodeURIComponent(value));
      } catch {
        setOwnEnumerableValue(out, name, value);
      }
    }
  }

  return out;
}
