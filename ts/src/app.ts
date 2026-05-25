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
  type IsrRenderFreshOptions,
  type IsrRuntime,
} from './isr.js';
import { logLevelForStatus, type FaceObservabilityHooks } from './ops.js';
import {
  requiresStrictCspDocumentValidation,
  validateStrictCspDocument,
} from './security.js';
import { routePatternConflict, Router } from './router.js';
import type {
  FaceContext,
  FaceExternalHydration,
  FaceHydration,
  FaceMode,
  FaceModule,
  FaceResourceRoute,
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
  resources?: FaceResourceRoute[];
  isr?: FaceIsrOptions;
  observability?: FaceObservabilityHooks;
  strictCsp?: FaceStrictCspOptions;
}

export interface FaceStrictCspOptions {
  /**
   * Maximum raw stream bytes FaceTheory will collect for strict no-inline CSP
   * document validation. Strict streaming responses must be buffered before
   * validation so this limit prevents unbounded body collection.
   */
  maxStreamingBodyBytes?: number;
}

const HTML_CONTENT_TYPE = 'text/html; charset=utf-8';
export const DEFAULT_STRICT_CSP_STREAMING_BODY_LIMIT_BYTES = 5 * 1024 * 1024;
const SAFE_INTERNAL_ERROR_HTML = renderHTMLDocument({
  head: '<title>Internal Server Error</title>',
  body: '<h1>Internal Server Error</h1><template data-facetheory-error="true"></template>',
});
const SAFE_PAYLOAD_TOO_LARGE_HTML = renderHTMLDocument({
  head: '<title>Payload Too Large</title>',
  body: '<h1>Payload Too Large</h1><template data-facetheory-error="strict-csp-stream-body-too-large"></template>',
});

const REQUEST_ID_HEADER = 'x-request-id';

class StreamPreflightError extends Error {
  constructor(cause: unknown) {
    super('stream body failed before first chunk');
    this.name = 'StreamPreflightError';
    this.cause = cause;
  }
}

class StrictCspStreamBodyTooLargeError extends Error {
  constructor(
    readonly limitBytes: number,
    readonly receivedBytes: number,
  ) {
    super(
      `strict CSP streaming body exceeded ${String(limitBytes)} byte limit after ${String(receivedBytes)} bytes`,
    );
    this.name = 'StrictCspStreamBodyTooLargeError';
  }
}

export class FaceApp {
  private readonly router: Router;
  private readonly faceByPattern: Map<string, FaceModule>;
  private readonly resourceByPattern: Map<string, FaceResourceRoute>;
  private readonly isrRuntime: IsrRuntime | null;
  private readonly observability: FaceObservabilityHooks | null;
  private readonly strictCspMaxStreamingBodyBytes: number;

  constructor(options: FaceAppOptions) {
    this.router = new Router();
    this.faceByPattern = new Map();
    this.resourceByPattern = new Map();
    this.observability = options.observability ?? null;
    this.strictCspMaxStreamingBodyBytes =
      normalizeStrictCspMaxStreamingBodyBytes(
        options.strictCsp?.maxStreamingBodyBytes,
      );

    for (const face of options.faces) {
      const pattern = normalizePath(face.route);
      if (this.faceByPattern.has(pattern)) {
        throw new Error(`duplicate face route: ${pattern}`);
      }
      this.router.add(pattern);
      this.faceByPattern.set(pattern, face);
    }

    for (const resource of options.resources ?? []) {
      const pattern = normalizePath(resource.route);
      if (this.resourceByPattern.has(pattern)) {
        throw new Error(`duplicate resource route: ${pattern}`);
      }

      for (const facePattern of this.faceByPattern.keys()) {
        const conflict = routePatternConflict(facePattern, pattern);
        if (conflict === 'duplicate') {
          throw new Error(`duplicate face/resource route: ${pattern}`);
        }
        if (conflict === 'ambiguous') {
          throw new Error(
            `ambiguous face/resource routes: ${facePattern} and ${pattern}`,
          );
        }
      }

      this.router.add(pattern);
      this.resourceByPattern.set(pattern, resource);
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
      response = textResponse(404, 'Not Found', {
        'content-type': ['text/plain; charset=utf-8'],
      });
      return finishResponse(
        hooks,
        now,
        startedAt,
        requestId,
        normalizedReq,
        response,
        {
          routePattern,
          mode,
          renderMs,
        },
      );
    }

    const routePatternForMatch = match.pattern;
    const resource = this.resourceByPattern.get(routePatternForMatch);

    const ctx: FaceContext = {
      request: normalizedReq,
      params: match.params,
      proxy: match.proxy ?? null,
    };

    if (resource) {
      routePattern = routePatternForMatch;
      try {
        response = await resource.handle(ctx);
      } catch {
        response = internalErrorResponse();
      }

      return finishResponse(
        hooks,
        now,
        startedAt,
        requestId,
        normalizedReq,
        response,
        {
          routePattern,
          mode,
          renderMs,
        },
      );
    }

    const face = this.faceByPattern.get(routePatternForMatch);
    if (!face) {
      response = textResponse(500, 'Internal Error', {
        'content-type': ['text/plain; charset=utf-8'],
      });
      return finishResponse(
        hooks,
        now,
        startedAt,
        requestId,
        normalizedReq,
        response,
        {
          routePattern,
          mode,
          renderMs,
        },
      );
    }

    routePattern = routePatternForMatch;
    mode = face.mode;

    try {
      const renderFresh = async (
        isrOptions?: IsrRenderFreshOptions,
      ): Promise<FaceResponse> => {
        const renderStartedAt = now();
        const data = face.load ? await face.load(ctx) : null;
        try {
          const out = prepareRenderResultForIsr(
            await face.render(ctx, data),
            isrOptions,
          );
          return await toHTTPResponse(
            out,
            normalizedReq,
            this.strictCspMaxStreamingBodyBytes,
          );
        } finally {
          renderMs = Math.max(0, now() - renderStartedAt);
        }
      };

      if (face.mode === 'isr') {
        if (!this.isrRuntime) {
          throw new Error(
            `ISR runtime is not configured for route "${match.pattern}"`,
          );
        }
        response = await this.isrRuntime.handleFace({
          face,
          ctx,
          routePattern: match.pattern,
          renderFresh,
        });
        return finishResponse(
          hooks,
          now,
          startedAt,
          requestId,
          normalizedReq,
          response,
          {
            routePattern,
            mode,
            renderMs,
          },
        );
      }

      response = await renderFresh();
      return finishResponse(
        hooks,
        now,
        startedAt,
        requestId,
        normalizedReq,
        response,
        {
          routePattern,
          mode,
          renderMs,
        },
      );
    } catch (err) {
      response =
        err instanceof StrictCspStreamBodyTooLargeError
          ? strictCspStreamBodyTooLargeResponse()
          : internalErrorResponse();
      return finishResponse(
        hooks,
        now,
        startedAt,
        requestId,
        normalizedReq,
        response,
        {
          routePattern,
          mode,
          renderMs,
        },
      );
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
    method:
      String(req.method ?? '')
        .trim()
        .toUpperCase() || 'GET',
    path: normalizePath(rawPath),
    headers,
    query: req.query ? cloneQuery(req.query) : queryFromPath(rawPath),
    cookies: req.cookies
      ? cloneCookies(req.cookies)
      : parseCookiesFromHeaders(headers),
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
  const isrState =
    String(out.headers['x-facetheory-isr']?.[0] ?? '').trim() || null;
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

function toHeaders(
  input: FaceRenderResult['headers'],
  cookies: string[] | undefined,
): Headers {
  const headers: Headers = {};
  const setCookieValues: string[] = [];

  for (const [key, value] of Object.entries(input ?? {})) {
    const lower = String(key).trim().toLowerCase();
    if (!lower) continue;

    const normalizedValues = (Array.isArray(value) ? value : [value]).map(
      String,
    );
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

function prepareRenderResultForIsr(
  out: FaceRenderResult,
  options: IsrRenderFreshOptions | undefined,
): FaceRenderResult {
  const dataUrl = options?.strictExternalHydrationDataUrl;
  if (
    dataUrl === undefined ||
    out.csp?.inlineScripts !== false ||
    out.hydration === undefined
  ) {
    return out;
  }

  const hydration = externalizeHydrationForIsr(out.hydration, dataUrl);
  options?.onHydrationSidecar?.({
    data: hydration.data,
    dataUrl: hydration.dataUrl,
  });

  return {
    ...out,
    hydration,
  };
}

function externalizeHydrationForIsr(
  hydration: FaceHydration,
  dataUrl: string,
): FaceExternalHydration {
  return {
    type: 'external',
    data: hydration.data,
    dataUrl,
    bootstrapModule: hydration.bootstrapModule,
  };
}

async function toHTTPResponse(
  out: FaceRenderResult,
  req: Readonly<Required<FaceRequest>>,
  strictCspMaxStreamingBodyBytes: number,
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
    const documentHtml = renderHTMLDocument({
      ...documentParts,
      head,
      body: out.html,
    });
    validateStrictCspDocument(documentHtml, { policy: out.csp });

    return {
      status,
      headers,
      cookies,
      body: utf8(documentHtml),
      isBase64: false,
    };
  }

  if (requiresStrictCspDocumentValidation(out.csp)) {
    const strictBody = await collectStreamAsUtf8Text(
      out.html,
      strictCspMaxStreamingBodyBytes,
    );
    const documentHtml = renderHTMLDocument({
      ...documentParts,
      head,
      body: strictBody,
    });
    validateStrictCspDocument(documentHtml, { policy: out.csp });

    return {
      status,
      headers,
      cookies,
      body: utf8(documentHtml),
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

async function collectStreamAsUtf8Text(
  input: AsyncIterable<Uint8Array>,
  maxBytes: number,
): Promise<string> {
  const chunks: Uint8Array[] = [];
  let total = 0;

  for await (const chunk of input) {
    const normalizedChunk =
      chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    total += normalizedChunk.byteLength;
    if (total > maxBytes) {
      throw new StrictCspStreamBodyTooLargeError(maxBytes, total);
    }
    chunks.push(normalizedChunk);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
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

function textResponse(
  status: number,
  body: string,
  headers: Headers,
): FaceResponse {
  return {
    status,
    headers,
    cookies: headers['set-cookie'] ?? [],
    body: utf8(body),
    isBase64: false,
  };
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

function strictCspStreamBodyTooLargeResponse(): FaceResponse {
  return {
    status: 413,
    headers: { 'content-type': [HTML_CONTENT_TYPE] },
    cookies: [],
    body: utf8(SAFE_PAYLOAD_TOO_LARGE_HTML),
    isBase64: false,
  };
}

function normalizeStrictCspMaxStreamingBodyBytes(
  value: number | undefined,
): number {
  if (value === undefined) {
    return DEFAULT_STRICT_CSP_STREAMING_BODY_LIMIT_BYTES;
  }

  const normalized = Math.trunc(Number(value));
  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    throw new Error(
      'strictCsp.maxStreamingBodyBytes must be a non-negative safe integer',
    );
  }

  return normalized;
}
