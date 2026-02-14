import { utf8 } from './bytes.js';
import type { FaceBody, FaceRequest, FaceResponse, Headers, Query } from './types.js';
import { canonicalizeHeaders, parseCookiesFromHeaders, parseQueryString } from './types.js';

export interface LambdaUrlHttpContext {
  method?: string;
  path?: string;
}

export interface LambdaUrlRequestContext {
  http?: LambdaUrlHttpContext;
  requestId?: string;
}

export interface LambdaUrlEvent {
  rawPath?: string;
  rawQueryString?: string;
  queryStringParameters?: Record<string, string | undefined>;
  headers?: Record<string, string | undefined>;
  cookies?: string[];
  body?: string;
  isBase64Encoded?: boolean;
  requestContext?: LambdaUrlRequestContext;
}

export interface LambdaUrlResult {
  statusCode: number;
  headers?: Record<string, string>;
  cookies?: string[];
  body: string;
  isBase64Encoded: boolean;
}

export interface LambdaUrlResponseMetadata {
  statusCode: number;
  headers?: Record<string, string>;
  cookies?: string[];
}

export interface LambdaResponseWriter {
  writeHead: (metadata: LambdaUrlResponseMetadata) => void;
  write: (chunk: Uint8Array) => void;
  end: () => void;
}

export interface LambdaWritableStream {
  write: (chunk: Uint8Array | string) => void;
  end: (chunk?: Uint8Array | string) => void;
  setHeader?: (name: string, value: string | string[]) => void;
  statusCode?: number;
}

export interface AwsLambdaGlobalLike {
  streamifyResponse: <TEvent = LambdaUrlEvent, TContext = unknown>(
    handler: (
      event: TEvent,
      responseStream: LambdaWritableStream,
      context: TContext,
    ) => Promise<void> | void,
  ) => (event: TEvent, context: TContext) => Promise<void>;
  HttpResponseStream?: {
    from: (
      stream: LambdaWritableStream,
      metadata: LambdaUrlResponseMetadata,
    ) => LambdaWritableStream;
  };
}

export interface FaceRequestHandler {
  handle: (request: FaceRequest) => Promise<FaceResponse>;
}

export interface CreateLambdaUrlStreamingHandlerOptions {
  app: FaceRequestHandler;
  awslambda?: AwsLambdaGlobalLike;
}

export function lambdaUrlEventToFaceRequest(event: LambdaUrlEvent): FaceRequest {
  const headers = headersFromLambdaEvent(event.headers);
  appendCookieArrayToHeaders(headers, event.cookies);
  if (!findHeaderKey(headers, 'x-request-id')) {
    const requestId = String(event.requestContext?.requestId ?? '').trim();
    if (requestId) {
      headers['x-request-id'] = [requestId];
    }
  }

  return {
    method: String(event.requestContext?.http?.method ?? 'GET').trim().toUpperCase() || 'GET',
    path: String(event.rawPath ?? event.requestContext?.http?.path ?? '/'),
    query: queryFromLambdaEvent(event),
    headers,
    cookies: parseCookiesFromHeaders(headers),
    body: decodeLambdaBody(event.body, Boolean(event.isBase64Encoded)),
    isBase64: Boolean(event.isBase64Encoded),
  };
}

export async function handleLambdaUrlEvent(
  app: FaceRequestHandler,
  event: LambdaUrlEvent,
): Promise<LambdaUrlResult> {
  const request = lambdaUrlEventToFaceRequest(event);
  const response = await app.handle(request);
  return faceResponseToLambdaUrlResult(response);
}

export function faceResponseToLambdaUrlMetadata(response: FaceResponse): LambdaUrlResponseMetadata {
  const { headers, cookies } = lambdaHeadersAndCookiesFromFaceResponse(response);
  const metadata: LambdaUrlResponseMetadata = {
    statusCode: response.status,
  };

  if (Object.keys(headers).length > 0) {
    metadata.headers = headers;
  }
  if (cookies.length > 0) {
    metadata.cookies = cookies;
  }

  return metadata;
}

export async function faceResponseToLambdaUrlResult(
  response: FaceResponse,
): Promise<LambdaUrlResult> {
  const metadata = faceResponseToLambdaUrlMetadata(response);
  const bodyBytes = await collectFaceBodyBytes(response.body);
  const isBase64Encoded = Boolean(response.isBase64);

  const result: LambdaUrlResult = {
    statusCode: metadata.statusCode,
    body: isBase64Encoded
      ? Buffer.from(bodyBytes).toString('base64')
      : new TextDecoder().decode(bodyBytes),
    isBase64Encoded,
  };

  if (metadata.headers && Object.keys(metadata.headers).length > 0) {
    result.headers = metadata.headers;
  }
  if (metadata.cookies?.length) {
    result.cookies = [...metadata.cookies];
  }

  return result;
}

export async function writeFaceResponseToLambdaWriter(
  response: FaceResponse,
  writer: LambdaResponseWriter,
): Promise<void> {
  const metadata = faceResponseToLambdaUrlMetadata(response);
  writer.writeHead(metadata);

  if (response.body instanceof Uint8Array) {
    if (response.body.length > 0) {
      writer.write(response.body);
    }
    writer.end();
    return;
  }

  for await (const chunk of response.body) {
    writer.write(chunk);
  }
  writer.end();
}

export function createLambdaUrlStreamingHandler<
  TEvent extends LambdaUrlEvent = LambdaUrlEvent,
  TContext = unknown,
>(
  options: CreateLambdaUrlStreamingHandlerOptions,
): (event: TEvent, context: TContext) => Promise<void> {
  const awsLambda = options.awslambda ?? getDefaultAwsLambdaGlobal();
  return awsLambda.streamifyResponse(async (event, responseStream) => {
    const request = lambdaUrlEventToFaceRequest(event);
    const response = await options.app.handle(request);
    const metadata = faceResponseToLambdaUrlMetadata(response);

    const hasHttpMetadataWrapper = Boolean(awsLambda.HttpResponseStream?.from);
    const outputStream = hasHttpMetadataWrapper
      ? awsLambda.HttpResponseStream!.from(responseStream, metadata)
      : responseStream;

    const writer = createStreamWriter(outputStream, hasHttpMetadataWrapper);
    await writeFaceResponseToLambdaWriter(response, writer);
  });
}

function createStreamWriter(
  stream: LambdaWritableStream,
  metadataAlreadyApplied: boolean,
): LambdaResponseWriter {
  let didWriteHead = false;

  const writeHead = (metadata: LambdaUrlResponseMetadata): void => {
    if (didWriteHead) return;
    didWriteHead = true;

    if (metadataAlreadyApplied) return;

    if ('statusCode' in stream) {
      stream.statusCode = metadata.statusCode;
    }

    if (typeof stream.setHeader === 'function') {
      if (metadata.headers) {
        for (const [key, value] of Object.entries(metadata.headers)) {
          stream.setHeader(key, value);
        }
      }
      if (metadata.cookies?.length) {
        stream.setHeader('set-cookie', metadata.cookies);
      }
    }
  };

  const write = (chunk: Uint8Array): void => {
    stream.write(chunk);
  };

  const end = (): void => {
    stream.end();
  };

  return { writeHead, write, end };
}

function getDefaultAwsLambdaGlobal(): AwsLambdaGlobalLike {
  const candidate = (globalThis as { awslambda?: AwsLambdaGlobalLike }).awslambda;
  if (!candidate?.streamifyResponse) {
    throw new Error('awslambda.streamifyResponse is not available on globalThis');
  }
  return candidate;
}

function headersFromLambdaEvent(
  input: Record<string, string | undefined> | undefined,
): Headers {
  const headers: Headers = {};
  for (const [name, value] of Object.entries(input ?? {})) {
    const key = String(name).trim();
    if (!key || value === undefined) continue;
    headers[key] = [String(value)];
  }
  return headers;
}

function appendCookieArrayToHeaders(headers: Headers, cookies: string[] | undefined): void {
  if (!cookies?.length) return;

  const cookieHeaderKey = findHeaderKey(headers, 'cookie') ?? 'cookie';
  const cookieValues = headers[cookieHeaderKey];
  if (cookieValues) {
    cookieValues.push(...cookies.map(String));
  } else {
    headers[cookieHeaderKey] = cookies.map(String);
  }
}

function findHeaderKey(headers: Headers, lowerName: string): string | null {
  for (const key of Object.keys(headers)) {
    if (key.trim().toLowerCase() === lowerName) return key;
  }
  return null;
}

function queryFromLambdaEvent(event: LambdaUrlEvent): Query {
  if (event.rawQueryString && event.rawQueryString.length > 0) {
    return parseQueryString(event.rawQueryString);
  }

  const params = event.queryStringParameters;
  if (!params) return {};

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    search.append(key, String(value));
  }
  return parseQueryString(search.toString());
}

function decodeLambdaBody(body: string | undefined, isBase64Encoded: boolean): Uint8Array {
  if (!body) return new Uint8Array();
  if (isBase64Encoded) return new Uint8Array(Buffer.from(body, 'base64'));
  return utf8(body);
}

function lambdaHeadersAndCookiesFromFaceResponse(response: FaceResponse): {
  headers: Record<string, string>;
  cookies: string[];
} {
  const headers = canonicalizeHeaders(response.headers);
  const setCookies: string[] = [];
  const seen = new Set<string>();
  for (const raw of [...(headers['set-cookie'] ?? []), ...response.cookies.map(String)]) {
    const value = String(raw);
    if (seen.has(value)) continue;
    seen.add(value);
    setCookies.push(value);
  }

  const lambdaHeaders: Record<string, string> = {};
  for (const key of Object.keys(headers).sort()) {
    if (key === 'set-cookie') continue;
    const values = headers[key];
    if (!values?.length) continue;
    lambdaHeaders[key] = values.join(', ');
  }

  return {
    headers: lambdaHeaders,
    cookies: setCookies,
  };
}

async function collectFaceBodyBytes(body: FaceBody): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body;

  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of body) {
    chunks.push(chunk);
    total += chunk.length;
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}
