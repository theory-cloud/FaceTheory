export type Headers = Record<string, string[]>;
export type Query = Record<string, string[]>;

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
  render: (ctx: FaceContext, data: unknown) => Promise<FaceRenderResult> | FaceRenderResult;
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

export function canonicalizeHeaders(headers: Headers | undefined): Headers {
  const out: Headers = {};
  if (!headers) return out;
  for (const [key, values] of Object.entries(headers)) {
    const lower = String(key).trim().toLowerCase();
    if (!lower) continue;
    out[lower] = Array.isArray(values) ? values.map(String) : [String(values)];
  }
  return out;
}

export function cloneQuery(query: Query | undefined): Query {
  const out: Query = {};
  if (!query) return out;
  for (const [key, values] of Object.entries(query)) {
    out[key] = Array.isArray(values) ? values.map(String) : [String(values)];
  }
  return out;
}
