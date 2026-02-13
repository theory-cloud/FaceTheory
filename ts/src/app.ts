import { utf8 } from './bytes.js';
import { renderFaceHead } from './head.js';
import { renderHTMLDocument, streamHTMLDocument } from './html.js';
import {
  createIsrRuntime,
  InMemoryHtmlStore,
  InMemoryIsrMetaStore,
  type FaceIsrOptions,
  type IsrRuntime,
} from './isr.js';
import { Router } from './router.js';
import type {
  FaceContext,
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
}

const HTML_CONTENT_TYPE = 'text/html; charset=utf-8';
const SAFE_INTERNAL_ERROR_HTML = renderHTMLDocument({
  head: '<title>Internal Server Error</title>',
  body: '<h1>Internal Server Error</h1><template data-facetheory-error="true"></template>',
});

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

  constructor(options: FaceAppOptions) {
    this.router = new Router();
    this.faceByPattern = new Map();

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
    const normalizedReq = normalizeRequest(request);
    const match = this.router.match(normalizedReq.path);

    if (!match) {
      return textResponse(404, 'Not Found', { 'content-type': ['text/plain; charset=utf-8'] });
    }

    const face = this.faceByPattern.get(match.pattern);
    if (!face) {
      return textResponse(500, 'Internal Error', {
        'content-type': ['text/plain; charset=utf-8'],
      });
    }

    const ctx: FaceContext = {
      request: normalizedReq,
      params: match.params,
      proxy: match.proxy ?? null,
    };

    try {
      const renderFresh = async (): Promise<FaceResponse> => {
        const data = face.load ? await face.load(ctx) : null;
        const out = await face.render(ctx, data);
        return toHTTPResponse(out, normalizedReq);
      };

      if (face.mode === 'isr') {
        if (!this.isrRuntime) {
          throw new Error(`ISR runtime is not configured for route "${match.pattern}"`);
        }
        return await this.isrRuntime.handleFace({
          face,
          ctx,
          routePattern: match.pattern,
          renderFresh,
        });
      }

      return await renderFresh();
    } catch {
      return internalErrorResponse();
    }
  }
}

export function createFaceApp(options: FaceAppOptions): FaceApp {
  return new FaceApp(options);
}

function normalizeRequest(req: FaceRequest): Required<FaceRequest> {
  const rawPath = String(req.path ?? '').trim();
  const headers = canonicalizeHeaders(req.headers);

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

  if (typeof out.html === 'string') {
    return {
      status,
      headers,
      cookies,
      body: utf8(
        renderHTMLDocument({
          head,
          body: out.html,
        }),
      ),
      isBase64: false,
    };
  }

  const body = streamHTMLDocument({
    head,
    body: await preflightStream(out.html),
  });

  return { status, headers, cookies, body, isBase64: false };
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
