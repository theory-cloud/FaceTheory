import { utf8 } from './bytes.js';
import { renderFaceHead } from './head.js';
import { renderHTMLDocument } from './html.js';
import { Router } from './router.js';
import type {
  FaceContext,
  FaceModule,
  FaceRenderResult,
  FaceRequest,
  FaceResponse,
  Headers,
} from './types.js';
import { canonicalizeHeaders, cloneQuery, normalizePath } from './types.js';

export interface FaceAppOptions {
  faces: FaceModule[];
}

export class FaceApp {
  private readonly router: Router;
  private readonly faceByPattern: Map<string, FaceModule>;

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

    const data = face.load ? await face.load(ctx) : null;
    const out = await face.render(ctx, data);
    return toHTTPResponse(out, normalizedReq);
  }
}

export function createFaceApp(options: FaceAppOptions): FaceApp {
  return new FaceApp(options);
}

function normalizeRequest(req: FaceRequest): Required<FaceRequest> {
  return {
    method: String(req.method ?? '').trim().toUpperCase() || 'GET',
    path: normalizePath(req.path),
    headers: canonicalizeHeaders(req.headers),
    query: cloneQuery(req.query),
    body: req.body ?? new Uint8Array(),
    isBase64: Boolean(req.isBase64),
    cspNonce: req.cspNonce ?? null,
  };
}

function toHeaders(input: FaceRenderResult['headers']): Headers {
  const out: Headers = {};
  if (!input) return out;
  for (const [key, value] of Object.entries(input)) {
    const lower = String(key).trim().toLowerCase();
    if (!lower) continue;
    out[lower] = Array.isArray(value) ? value.map(String) : [String(value)];
  }
  return out;
}

function toHTTPResponse(
  out: FaceRenderResult,
  req: Readonly<Required<FaceRequest>>,
): FaceResponse {
  const status = out.status ?? 200;
  const headers = toHeaders(out.headers);
  const cookies = out.cookies ?? [];

  if (!headers['content-type']) {
    headers['content-type'] = ['text/html; charset=utf-8'];
  }

  const body =
    typeof out.html === 'string'
      ? utf8(
          renderHTMLDocument({
            head: renderFaceHead(out, { cspNonce: req.cspNonce }),
            body: out.html,
          }),
        )
      : out.html;

  return { status, headers, cookies, body, isBase64: false };
}

function textResponse(status: number, body: string, headers: Headers): FaceResponse {
  return { status, headers, cookies: [], body: utf8(body), isBase64: false };
}
