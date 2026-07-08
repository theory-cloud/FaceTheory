import { once } from 'node:events';
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';

import type { InlineConfig } from 'vite';

import type { FaceApp } from './app.js';
import type { FaceHeaders, FaceRequest, FaceResponse } from './types.js';

export type ViteMiddlewareDevNext = (err?: unknown) => void;

export interface ViteMiddlewareStack {
  (req: IncomingMessage, res: ServerResponse, next: ViteMiddlewareDevNext): void;
}

export interface ViteMiddlewareDevServerLike {
  middlewares: ViteMiddlewareStack;
  ssrLoadModule(id: string): Promise<unknown>;
  ssrFixStacktrace?: (err: Error) => void;
  close(): Promise<void>;
}

export type ViteCreateServer = (
  config: InlineConfig,
) => Promise<ViteMiddlewareDevServerLike>;

export interface ViteMiddlewareFaceAppContext<TModule = unknown> {
  module: TModule;
  vite: ViteMiddlewareDevServerLike;
  request: IncomingMessage;
}

export type ViteMiddlewareFaceAppFactory<TModule = unknown> = (
  context: ViteMiddlewareFaceAppContext<TModule>,
) => FaceApp | Promise<FaceApp>;

export interface ViteMiddlewareDevServerOptions<TModule = unknown> {
  root?: string;
  entry: string;
  createApp: ViteMiddlewareFaceAppFactory<TModule>;
  vite?: InlineConfig;
  createServer?: ViteCreateServer;
}

export interface ViteMiddlewareDevListenOptions {
  port?: number;
  host?: string;
}

export interface ViteMiddlewareDevListenResult {
  address: AddressInfo | string | null;
  url: string;
}

export interface ViteMiddlewareDevServer {
  vite: ViteMiddlewareDevServerLike;
  server: Server;
  listen(
    options?: ViteMiddlewareDevListenOptions,
  ): Promise<ViteMiddlewareDevListenResult>;
  close(): Promise<void>;
}

export interface StartedViteMiddlewareDevServer extends ViteMiddlewareDevServer {
  address: AddressInfo | string | null;
  url: string;
}

async function defaultCreateViteServer(
  config: InlineConfig,
): Promise<ViteMiddlewareDevServerLike> {
  const vite = await import('vite');
  return vite.createServer(config) as Promise<ViteMiddlewareDevServerLike>;
}

function normalizeViteModuleId(entry: string): string {
  const trimmed = String(entry ?? '').trim();
  if (!trimmed) {
    throw new Error('FaceTheory Vite dev server entry must not be empty');
  }
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function headersFromIncomingMessage(req: IncomingMessage): FaceHeaders {
  const headers: FaceHeaders = {};

  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    const headerName = name.toLowerCase();
    headers[headerName] = Array.isArray(value) ? [...value] : [value];
  }

  return headers;
}

async function readIncomingBody(req: IncomingMessage): Promise<Uint8Array> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }

  return Buffer.concat(chunks);
}

function faceRequestFromIncomingMessage(
  req: IncomingMessage,
  body: Uint8Array,
): FaceRequest {
  const request: FaceRequest = {
    method: req.method ?? 'GET',
    path: req.url ?? '/',
    headers: headersFromIncomingMessage(req),
  };

  if (body.byteLength > 0) {
    request.body = body;
  }

  return request;
}

function applyResponseHeaders(res: ServerResponse, response: FaceResponse) {
  const setCookieValues: string[] = [];

  for (const [name, values] of Object.entries(response.headers)) {
    if (name.toLowerCase() === 'set-cookie') {
      setCookieValues.push(...values);
      continue;
    }
    res.setHeader(name, values.length === 1 ? values[0] ?? '' : values.join(', '));
  }

  setCookieValues.push(...response.cookies);
  if (setCookieValues.length > 0) {
    res.setHeader('set-cookie', setCookieValues);
  }
}

async function writeChunk(res: ServerResponse, chunk: Uint8Array) {
  if (!res.write(chunk)) {
    await once(res, 'drain');
  }
}

async function writeFaceResponse(
  req: IncomingMessage,
  res: ServerResponse,
  response: FaceResponse,
) {
  res.statusCode = response.status;
  applyResponseHeaders(res, response);

  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  if (response.body instanceof Uint8Array) {
    res.end(response.body);
    return;
  }

  for await (const chunk of response.body) {
    await writeChunk(res, chunk);
  }
  res.end();
}

async function handleFaceAppRequest(
  app: FaceApp,
  req: IncomingMessage,
  res: ServerResponse,
) {
  const body = await readIncomingBody(req);
  const response = await app.handle(faceRequestFromIncomingMessage(req, body));
  await writeFaceResponse(req, res, response);
}

function devErrorBody(err: unknown): string {
  if (err instanceof Error) {
    const name = err.name.trim() || 'Error';
    const message = err.message.trim() || 'FaceTheory dev server request failed';
    return `${name}: ${message}`;
  }
  return 'FaceTheory dev server request failed';
}

function sendDevError(
  vite: ViteMiddlewareDevServerLike,
  err: unknown,
  res: ServerResponse,
) {
  if (err instanceof Error) {
    vite.ssrFixStacktrace?.(err);
  }

  if (!res.headersSent) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
  }
  res.end(devErrorBody(err));
}

function listenUrl(address: AddressInfo | string | null, host?: string): string {
  if (typeof address === 'string') return address;
  if (!address) return '';

  const rawHost = host ?? address.address;
  const hostname =
    rawHost === '' || rawHost === '::' || rawHost === '0.0.0.0'
      ? 'localhost'
      : rawHost.includes(':')
        ? `[${rawHost}]`
        : rawHost;

  return `http://${hostname}:${address.port}/`;
}

async function closeServer(server: Server, listening: boolean): Promise<void> {
  if (!listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export async function createViteMiddlewareDevServer<TModule = unknown>(
  options: ViteMiddlewareDevServerOptions<TModule>,
): Promise<ViteMiddlewareDevServer> {
  const entry = normalizeViteModuleId(options.entry);
  const createServer = options.createServer ?? defaultCreateViteServer;
  const viteConfig = options.vite ?? {};
  const viteServerConfig = viteConfig.server ?? {};
  const root = options.root ?? viteConfig.root;
  const mergedConfig: InlineConfig = {
    ...viteConfig,
    appType: 'custom',
    server: {
      ...viteServerConfig,
      middlewareMode: true,
    },
  };
  if (root !== undefined) {
    mergedConfig.root = root;
  }
  const vite = await createServer(mergedConfig);

  const server = createHttpServer((req, res) => {
    try {
      vite.middlewares(req, res, (middlewareErr?: unknown) => {
        if (res.writableEnded) return;
        if (middlewareErr) {
          sendDevError(vite, middlewareErr, res);
          return;
        }

        void (async () => {
          const module = (await vite.ssrLoadModule(entry)) as TModule;
          const app = await options.createApp({ module, vite, request: req });
          await handleFaceAppRequest(app, req, res);
        })().catch((err: unknown) => {
          sendDevError(vite, err, res);
        });
      });
    } catch (err) {
      sendDevError(vite, err, res);
    }
  });

  let listening = false;

  return {
    vite,
    server,
    async listen(
      listenOptions: ViteMiddlewareDevListenOptions = {},
    ): Promise<ViteMiddlewareDevListenResult> {
      const port = listenOptions.port ?? 5173;
      const host = listenOptions.host;
      await new Promise<void>((resolve, reject) => {
        const onError = (err: Error) => {
          server.off('listening', onListening);
          reject(err);
        };
        const onListening = () => {
          server.off('error', onError);
          listening = true;
          resolve();
        };

        server.once('error', onError);
        server.once('listening', onListening);
        if (host !== undefined) {
          server.listen(port, host);
        } else {
          server.listen(port);
        }
      });

      const address = server.address();
      return {
        address,
        url: listenUrl(address, host),
      };
    },
    async close(): Promise<void> {
      await closeServer(server, listening);
      listening = false;
      await vite.close();
    },
  };
}

export async function startViteMiddlewareDevServer<TModule = unknown>(
  options: ViteMiddlewareDevServerOptions<TModule>,
  listenOptions: ViteMiddlewareDevListenOptions = {},
): Promise<StartedViteMiddlewareDevServer> {
  const devServer = await createViteMiddlewareDevServer(options);
  const listened = await devServer.listen(listenOptions);
  return {
    ...devServer,
    address: listened.address,
    url: listened.url,
  };
}
