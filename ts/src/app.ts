import { randomUUID } from 'node:crypto';

import { utf8 } from './bytes.js';
import { renderFaceHead } from './head.js';
import {
  renderHTMLDocument,
  streamHTMLDocument,
  type HTMLDocumentParts,
} from './html.js';
import {
  createIsrRuntime,
  InMemoryHtmlStore,
  InMemoryIsrMetaStore,
  type FaceIsrOptions,
  type IsrRuntime,
} from './isr.js';
import { logLevelForStatus, type FaceObservabilityHooks } from './ops.js';
import { Router } from './router.js';
import type {
  FaceContext,
  FaceMode,
  FaceModule,
  FaceRenderResult,
  FaceRequest,
  FaceResponse,
  Headers,
} from './types.js';
import {
  canonicalizeHeaders,
  cloneCookies,
  cloneQuery,
  normalizePath,
  parseCookiesFromHeaders,
  parseQueryString,
} from './types.js';

export interface FaceAppOptions {
  faces: FaceModule[];
  isr?: FaceIsrOptions;
  observability?: FaceObservabilityHooks;
}

const HTML_CONTENT_TYPE = 'text/html; charset=utf-8';
const SAFE_INTERNAL_ERROR_HTML = renderHTMLDocument({
  head: '<title>Internal Server Error</title>',
  body: '<h1>Internal Server Error</h1><template data-facetheory-error="true"></template>',
});

const REQUEST_ID_HEADER = 'x-request-id';

class StreamPreflightError extends Error {
  constructor(cause: unknown) {
    super('stream body failed before first chunk');
    this.name = 'StreamPreflightError';
    this.cause = cause;
  }
}

export class FaceApp {
  private readonly router: Router;
  private readonly faceByPattern: Map<string, FaceModule>;
  private readonly isrRuntime: IsrRuntime | null;
  private readonly observability: FaceObservabilityHooks | null;

  constructor(options: FaceAppOptions) {
    this.router = new Router();
    this.faceByPattern = new Map();
    this.observability = options.observability ?? null;

    for (const face of options.faces) {
      const pattern = normalizePath(face.route);
      if (this.faceByPattern.has(pattern)) {
        throw new Error(`duplicate face route: ${pattern}`);
      }
      this.router.add(pattern);
      this.faceByPattern.set(pattern, face);
    }

    const hasIsrFace = options.faces.some((face) => face.mode === 'isr');
    if (!hasIsrFace) {
      this.isrRuntime = null;
      return;
    }

    const isrOptions = options.isr ?? {};
    this.isrRuntime = createIsrRuntime({
      ...isrOptions,
      htmlStore: isrOptions.htmlStore ?? new InMemoryHtmlStore(),
      metaStore: isrOptions.metaStore ?? new InMemoryIsrMetaStore(),
    });
  }

  async handle(request: FaceRequest): Promise<FaceResponse> {
    const hooks = this.observability;
    const now = hooks?.now ?? (() => Date.now());
    const startedAt = now();

    const normalizedReq = normalizeRequest(request);
    const requestId = normalizedReq.headers[REQUEST_ID_HEADER]?.[0] ?? '';

    let routePattern = '';
    let mode: FaceMode | 'none' = 'none';
    let renderMs: number | null = null;

    let response: FaceResponse;
    const match = this.router.match(normalizedReq.path);

    if (!match) {
      response = textResponse(404, 'Not Found', { 'content-type': ['text/plain; charset=utf-8'] });
      return finishResponse(hooks, now, startedAt, requestId, normalizedReq, response, {
        routePattern,
        mode,
        renderMs,
      });
    }

    const face = this.faceByPattern.get(match.pattern);
    if (!face) {
      response = textResponse(500, 'Internal Error', {
        'content-type': ['text/plain; charset=utf-8'],
      });
      return finishResponse(hooks, now, startedAt, requestId, normalizedReq, response, {
        routePattern,
        mode,
        renderMs,
      });
    }

    routePattern = match.pattern;
    mode = face.mode;

    const ctx: FaceContext = {
      request: normalizedReq,
      params: match.params,
      proxy: match.proxy ?? null,
    };

    try {
      const renderFresh = async (): Promise<FaceResponse> => {
        const renderStartedAt = now();
        const data = face.load ? await face.load(ctx) : null;
        try {
          const out = await face.render(ctx, data);
          return await toHTTPResponse(out, normalizedReq);
        } finally {
          renderMs = Math.max(0, now() - renderStartedAt);
        }
      };

      if (face.mode === 'isr') {
        if (!this.isrRuntime) {
          throw new Error(`ISR runtime is not configured for route "${match.pattern}"`);
        }
        response = await this.isrRuntime.handleFace({
          face,
          ctx,
          routePattern: match.pattern,
          renderFresh,
        });
        return finishResponse(hooks, now, startedAt, requestId, normalizedReq, response, {
          routePattern,
          mode,
          renderMs,
        });
      }

      response = await renderFresh();
      return finishResponse(hooks, now, startedAt, requestId, normalizedReq, response, {
        routePattern,
        mode,
        renderMs,
      });
    } catch {
      response = internalErrorResponse();
      return finishResponse(hooks, now, startedAt, requestId, normalizedReq, response, {
        routePattern,
        mode,
        renderMs,
      });
    }
  }
}

export function createFaceApp(options: FaceAppOptions): FaceApp {
  return new FaceApp(options);
}

function normalizeRequest(req: FaceRequest): Required<FaceRequest> {
  const rawPath = String(req.path ?? '').trim();
  const headers = canonicalizeHeaders(req.headers);
  ensureRequestId(headers);

  return {
    method: String(req.method ?? '').trim().toUpperCase() || 'GET',
    path: normalizePath(rawPath),
    headers,
    query: req.query ? cloneQuery(req.query) : queryFromPath(rawPath),
    cookies: req.cookies ? cloneCookies(req.cookies) : parseCookiesFromHeaders(headers),
    body: req.body ?? new Uint8Array(),
    isBase64: Boolean(req.isBase64),
    cspNonce: req.cspNonce ?? null,
  };
}

function ensureRequestId(headers: Headers): void {
  const existing = headers[REQUEST_ID_HEADER] ?? [];
  const first = String(existing[0] ?? '').trim();
  headers[REQUEST_ID_HEADER] = [first || randomUUID()];
}

function finishResponse(
  hooks: FaceObservabilityHooks | null,
  now: () => number,
  startedAt: number,
  requestId: string,
  req: Readonly<Required<FaceRequest>>,
  response: FaceResponse,
  context: {
    routePattern: string;
    mode: FaceMode | 'none';
    renderMs: number | null;
  },
): FaceResponse {
  const headers: Headers = { ...(response.headers ?? {}) };
  headers[REQUEST_ID_HEADER] = [requestId];

  const sorted: Headers = {};
  for (const key of Object.keys(headers).sort()) {
    sorted[key] = headers[key] ?? [];
  }

  const out: FaceResponse = { ...response, headers: sorted };

  const durationMs = Math.max(0, now() - startedAt);
  const isrState = String(out.headers['x-facetheory-isr']?.[0] ?? '').trim() || null;
  const isStream = !(out.body instanceof Uint8Array);

  const level = logLevelForStatus(out.status);

  hooks?.log?.({
    level,
    event: 'facetheory.request.completed',
    requestId,
    method: req.method,
    path: req.path,
    routePattern: context.routePattern,
    mode: context.mode,
    status: out.status,
    durationMs,
    renderMs: context.renderMs,
    isrState,
    isStream,
  });

  hooks?.metric?.({
    name: 'facetheory.request',
    value: 1,
    tags: {
      method: req.method,
      route_pattern: context.routePattern || req.path,
      mode: String(context.mode),
      status: String(out.status),
      isr_state: isrState ?? '',
      is_stream: isStream ? '1' : '0',
    },
  });

  if (context.renderMs !== null) {
    hooks?.metric?.({
      name: 'facetheory.render_ms',
      value: context.renderMs,
      tags: {
        method: req.method,
        route_pattern: context.routePattern || req.path,
        mode: String(context.mode),
      },
    });
  }

  return out;
}

function queryFromPath(path: string): Record<string, string[]> {
  const idx = path.indexOf('?');
  if (idx < 0 || idx === path.length - 1) return {};
  return parseQueryString(path.slice(idx + 1));
}

function toHeaders(input: FaceRenderResult['headers'], cookies: string[] | undefined): Headers {
  const headers: Headers = {};
  const setCookieValues: string[] = [];

  for (const [key, value] of Object.entries(input ?? {})) {
    const lower = String(key).trim().toLowerCase();
    if (!lower) continue;

    const normalizedValues = (Array.isArray(value) ? value : [value]).map(String);
    if (lower === 'set-cookie') {
      setCookieValues.push(...normalizedValues);
      continue;
    }

    const existingValues = headers[lower];
    if (existingValues) {
      existingValues.push(...normalizedValues);
    } else {
      headers[lower] = [...normalizedValues];
    }
  }

  if (cookies?.length) {
    setCookieValues.push(...cookies.map(String));
  }

  if (setCookieValues.length > 0) {
    headers['set-cookie'] = setCookieValues;
  }

  const sortedHeaders: Headers = {};
  for (const key of Object.keys(headers).sort()) {
    sortedHeaders[key] = headers[key] ?? [];
  }
  return sortedHeaders;
}

async function toHTTPResponse(
  out: FaceRenderResult,
  req: Readonly<Required<FaceRequest>>,
): Promise<FaceResponse> {
  const status = out.status ?? 200;
  const headers = toHeaders(out.headers, out.cookies);
  const cookies = headers['set-cookie'] ?? [];

  if (!headers['content-type']) {
    headers['content-type'] = [HTML_CONTENT_TYPE];
  }

  const head = renderFaceHead(out, { cspNonce: req.cspNonce });
  const documentParts = withDocumentShell(out);

  if (typeof out.html === 'string') {
    return {
      status,
      headers,
      cookies,
      body: utf8(
        renderHTMLDocument({
          ...documentParts,
          head,
          body: out.html,
        }),
      ),
      isBase64: false,
    };
  }

  const body = streamHTMLDocument({
    ...documentParts,
    head,
    body: await preflightStream(out.html),
  });

  return { status, headers, cookies, body, isBase64: false };
}

function withDocumentShell(
  out: FaceRenderResult,
): Pick<HTMLDocumentParts, 'lang' | 'htmlAttrs' | 'bodyAttrs'> {
  const parts: Pick<HTMLDocumentParts, 'lang' | 'htmlAttrs' | 'bodyAttrs'> = {};
  if (out.lang !== undefined) parts.lang = out.lang;
  if (out.htmlAttrs !== undefined) parts.htmlAttrs = out.htmlAttrs;
  if (out.bodyAttrs !== undefined) parts.bodyAttrs = out.bodyAttrs;
  return parts;
}

async function preflightStream(
  input: AsyncIterable<Uint8Array>,
): Promise<AsyncIterable<Uint8Array>> {
  const iterator = input[Symbol.asyncIterator]();

  let firstChunk: IteratorResult<Uint8Array>;
  try {
    firstChunk = await iterator.next();
  } catch (err) {
    throw new StreamPreflightError(err);
  }

  return (async function* () {
    if (!firstChunk.done) {
      yield firstChunk.value;
    }

    for (;;) {
      const next = await iterator.next();
      if (next.done) break;
      yield next.value;
    }
  })();
}

function textResponse(status: number, body: string, headers: Headers): FaceResponse {
  return { status, headers, cookies: headers['set-cookie'] ?? [], body: utf8(body), isBase64: false };
}

function internalErrorResponse(): FaceResponse {
  return {
    status: 500,
    headers: { 'content-type': [HTML_CONTENT_TYPE] },
    cookies: [],
    body: utf8(SAFE_INTERNAL_ERROR_HTML),
    isBase64: false,
  };
}
