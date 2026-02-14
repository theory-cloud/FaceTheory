import type {
  Context as AppTheoryContext,
  Handler as AppTheoryHandler,
  Request as AppTheoryRequest,
  Response as AppTheoryResponse,
} from '@theory-cloud/apptheory';

import type { FaceRequest, FaceResponse, Headers } from '../types.js';

export interface FaceRequestHandler {
  handle: (request: FaceRequest) => Promise<FaceResponse>;
}

export function appTheoryRequestToFaceRequest(request: AppTheoryRequest): FaceRequest {
  return {
    method: request.method,
    path: request.path,
    ...(request.query !== undefined ? { query: request.query } : {}),
    ...(request.headers !== undefined ? { headers: request.headers } : {}),
    ...(request.body !== undefined ? { body: request.body } : {}),
    ...(request.isBase64 !== undefined ? { isBase64: request.isBase64 } : {}),
  };
}

export function appTheoryContextToFaceRequest(ctx: AppTheoryContext): FaceRequest {
  // We intentionally omit `cookies` so FaceApp parses from headers using FaceTheory semantics
  // (including URL-decoding). AppTheory's cookie parsing does not decode percent-encoding.
  const req = appTheoryRequestToFaceRequest({
    method: ctx.request.method,
    path: ctx.request.path,
    query: ctx.request.query,
    headers: ctx.request.headers,
    body: ctx.request.body,
    isBase64: ctx.request.isBase64,
  });

  // AppTheory selects a request ID even if the inbound request omitted one. Propagate it to FaceTheory
  // so logs/headers correlate across the adapter boundary.
  const requestId = String(ctx.requestId ?? '').trim();
  if (requestId) {
    const headers: Headers = { ...(req.headers ?? {}) };
    headers['x-request-id'] = [requestId];
    req.headers = headers;
  }

  return req;
}

function cloneHeadersWithoutSetCookie(input: Headers): Headers {
  const out: Headers = {};
  for (const [key, values] of Object.entries(input ?? {})) {
    if (String(key).trim().toLowerCase() === 'set-cookie') continue;
    out[key] = Array.isArray(values) ? values.map(String) : [String(values)];
  }
  return out;
}

export function faceResponseToAppTheoryResponse(response: FaceResponse): AppTheoryResponse {
  const isStream = !(response.body instanceof Uint8Array);
  if (isStream && response.isBase64) {
    throw new TypeError('FaceTheory: cannot convert streamed FaceResponse with isBase64=true');
  }

  const body = response.body instanceof Uint8Array ? response.body : new Uint8Array();
  const bodyStream = response.body instanceof Uint8Array ? null : response.body;

  return {
    status: response.status,
    // AppTheory normalizes set-cookie from headers into cookies, but FaceTheory mirrors set-cookie into
    // both `headers['set-cookie']` and `response.cookies`. Drop the header representation to avoid
    // duplicates when AppTheory normalizes.
    headers: cloneHeadersWithoutSetCookie(response.headers),
    cookies: response.cookies.map(String),
    body,
    bodyStream,
    isBase64: response.isBase64,
  };
}

export interface CreateAppTheoryFaceHandlerOptions {
  app: FaceRequestHandler;
}

export function createAppTheoryFaceHandler(
  options: CreateAppTheoryFaceHandlerOptions,
): AppTheoryHandler {
  return async (ctx) => {
    const request = appTheoryContextToFaceRequest(ctx);
    const response = await options.app.handle(request);
    return faceResponseToAppTheoryResponse(response);
  };
}
