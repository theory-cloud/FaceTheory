import { PassThrough } from 'node:stream';

import * as React from 'react';
import * as ReactDOMServer from 'react-dom/server';

import { prepareUIIntegrations } from '../types.js';
import type {
  FaceContext,
  FaceHead,
  FaceHeadTag,
  FaceHydration,
  FaceMode,
  FaceModule,
  FaceRenderResult,
  FaceStyleTag,
  UIIntegration,
} from '../types.js';

export interface RenderReactOptions {
  status?: number;
  headers?: Record<string, string | string[]>;
  cookies?: string[];
  head?: FaceHead;
  headTags?: FaceHeadTag[];
  styleTags?: FaceStyleTag[];
  hydration?: FaceHydration;
  integrations?: Array<UIIntegration<React.ReactElement>>;
}

export interface RenderReactStreamOptions extends RenderReactOptions {
  /**
   * Abort delay passed to React's streaming renderer.
   * Default: 5000ms.
   */
  abortDelayMs?: number;

  /**
   * Head-style extraction strategy for streaming mode.
   *
   * - `all-ready` (default): wait for React `onAllReady` before finalizing integrations.
   *   This ensures late styles from Suspense/async boundaries are available in `<head>`.
   * - `shell`: finalize at `onShellReady` for lower TTFB.
   */
  styleStrategy?: ReactStreamStyleStrategy;

  /**
   * Optional readiness callback for observability.
   * - `shell`: React `onShellReady`
   * - `all-ready`: React `onAllReady`
   */
  onReadiness?: (event: ReactStreamReadinessEvent) => void;
}

export type ReactStreamStyleStrategy = 'all-ready' | 'shell';

export interface ReactStreamReadinessEvent {
  phase: 'shell' | 'all-ready';
  styleStrategy: ReactStreamStyleStrategy;
  requestId: string | null;
  ms: number;
}

export async function renderReact(
  ctx: FaceContext,
  node: React.ReactNode,
  options: RenderReactOptions = {},
): Promise<FaceRenderResult> {
  const integrations = await prepareUIIntegrations<
    React.ReactElement,
    UIIntegration<React.ReactElement>
  >(options.integrations ?? [], ctx);

  let tree: React.ReactElement = React.createElement(React.Fragment, null, node);

  for (const { integration, state } of integrations) {
    if (integration.wrapTree) {
      tree = integration.wrapTree(tree, ctx, state);
    }
  }

  const integrationHeadTags: FaceHeadTag[] = [];
  const integrationStyleTags: FaceStyleTag[] = [];

  for (const { integration, state } of integrations) {
    if (!integration.contribute) continue;
    const contribution = await integration.contribute(ctx, state);
    if (contribution.headTags) integrationHeadTags.push(...contribution.headTags);
    if (contribution.styleTags) integrationStyleTags.push(...contribution.styleTags);
  }

  const html = ReactDOMServer.renderToString(tree);
  const headTags = [...integrationHeadTags, ...(options.headTags ?? [])];
  const styleTags = [...integrationStyleTags, ...(options.styleTags ?? [])];

  let out: FaceRenderResult = { html };
  if (options.status !== undefined) out.status = options.status;
  if (options.headers !== undefined) out.headers = options.headers;
  if (options.cookies !== undefined) out.cookies = options.cookies;
  if (options.head !== undefined) out.head = options.head;
  if (headTags.length) out.headTags = headTags;
  if (styleTags.length) out.styleTags = styleTags;
  if (options.hydration !== undefined) out.hydration = options.hydration;

  for (const { integration, state } of integrations) {
    if (integration.finalize) {
      out = await integration.finalize(out, ctx, state);
    }
  }

  return out;
}

export async function renderReactStream(
  ctx: FaceContext,
  node: React.ReactNode,
  options: RenderReactStreamOptions = {},
): Promise<FaceRenderResult> {
  const integrations = await prepareUIIntegrations<
    React.ReactElement,
    UIIntegration<React.ReactElement>
  >(options.integrations ?? [], ctx);

  let tree: React.ReactElement = React.createElement(React.Fragment, null, node);

  for (const { integration, state } of integrations) {
    if (integration.wrapTree) {
      tree = integration.wrapTree(tree, ctx, state);
    }
  }

  const integrationHeadTags: FaceHeadTag[] = [];
  const integrationStyleTags: FaceStyleTag[] = [];

  for (const { integration, state } of integrations) {
    if (!integration.contribute) continue;
    const contribution = await integration.contribute(ctx, state);
    if (contribution.headTags) integrationHeadTags.push(...contribution.headTags);
    if (contribution.styleTags) integrationStyleTags.push(...contribution.styleTags);
  }

  const headTags = [...integrationHeadTags, ...(options.headTags ?? [])];
  const styleTags = [...integrationStyleTags, ...(options.styleTags ?? [])];

  const stream = new PassThrough();
  const abortDelayMs = options.abortDelayMs ?? 5000;
  const styleStrategy = options.styleStrategy ?? 'all-ready';
  const startedAt = Date.now();
  const requestId = String(ctx.request.headers['x-request-id']?.[0] ?? '').trim() || null;

  let didPipe = false;
  let shellSettled = false;
  let allReadySettled = false;

  let resolveShell: (() => void) | null = null;
  let rejectShell: ((err: unknown) => void) | null = null;
  let resolveAllReady: (() => void) | null = null;
  let rejectAllReady: ((err: unknown) => void) | null = null;

  const shellReady = new Promise<void>((resolve, reject) => {
    resolveShell = resolve;
    rejectShell = reject;
  });
  const allReady = new Promise<void>((resolve, reject) => {
    resolveAllReady = resolve;
    rejectAllReady = reject;
  });

  if (styleStrategy === 'shell') {
    void allReady.catch(() => undefined);
  }

  const settleShellReady = (): void => {
    if (shellSettled) return;
    shellSettled = true;
    resolveShell?.();
  };

  const settleAllReady = (): void => {
    if (allReadySettled) return;
    allReadySettled = true;
    resolveAllReady?.();
  };

  const rejectReadiness = (err: unknown): void => {
    if (!shellSettled) {
      shellSettled = true;
      rejectShell?.(err);
    }
    if (!allReadySettled) {
      allReadySettled = true;
      rejectAllReady?.(err);
    }
  };

  const pipeOnce = (pipe: (dest: NodeJS.WritableStream) => void): void => {
    if (didPipe) return;
    didPipe = true;
    pipe(stream);
  };

  const { pipe, abort } = ReactDOMServer.renderToPipeableStream(tree, {
    ...(ctx.request.cspNonce ? { nonce: ctx.request.cspNonce } : {}),
    onShellReady: () => {
      settleShellReady();
      options.onReadiness?.({
        phase: 'shell',
        styleStrategy,
        requestId,
        ms: Math.max(0, Date.now() - startedAt),
      });
      if (styleStrategy === 'shell') {
        pipeOnce(pipe);
      }
    },
    onAllReady: () => {
      settleAllReady();
      options.onReadiness?.({
        phase: 'all-ready',
        styleStrategy,
        requestId,
        ms: Math.max(0, Date.now() - startedAt),
      });
      if (styleStrategy === 'all-ready') {
        pipeOnce(pipe);
      }
    },
    onShellError: (err) => {
      rejectReadiness(err);
      stream.destroy(err as Error);
    },
    onError: (err) => {
      // Preserve React's default error reporting; surface the error if the stream is consumed.
      if (!stream.destroyed) {
        stream.destroy(err as Error);
      }
      rejectReadiness(err);
    },
  });

  const abortTimer = setTimeout(() => abort(), abortDelayMs);
  abortTimer.unref?.();
  stream.on('close', () => clearTimeout(abortTimer));
  stream.on('end', () => clearTimeout(abortTimer));
  stream.on('error', () => clearTimeout(abortTimer));

  // Ensure integrations can extract critical styles before FaceApp emits <head>.
  if (styleStrategy === 'all-ready') {
    await allReady;
  } else {
    await shellReady;
  }

  let out: FaceRenderResult = { html: stream as unknown as AsyncIterable<Uint8Array> };
  if (options.status !== undefined) out.status = options.status;
  if (options.headers !== undefined) out.headers = options.headers;
  if (options.cookies !== undefined) out.cookies = options.cookies;
  if (options.head !== undefined) out.head = options.head;
  if (headTags.length) out.headTags = headTags;
  if (styleTags.length) out.styleTags = styleTags;
  if (options.hydration !== undefined) out.hydration = options.hydration;

  for (const { integration, state } of integrations) {
    if (integration.finalize) {
      out = await integration.finalize(out, ctx, state);
    }
  }

  return out;
}

export interface ReactFaceOptions<Data = unknown> {
  route: string;
  mode: FaceMode;
  load?: (ctx: FaceContext) => Promise<Data>;
  render: (ctx: FaceContext, data: Data) => React.ReactNode | Promise<React.ReactNode>;
  renderOptions?:
    | RenderReactOptions
    | ((ctx: FaceContext, data: Data) => RenderReactOptions | Promise<RenderReactOptions>);
}

export function createReactFace<Data = unknown>(
  options: ReactFaceOptions<Data>,
): FaceModule {
  const mod: FaceModule = {
    route: options.route,
    mode: options.mode,
    render: async (ctx, data) => {
      const tree = await options.render(ctx, data as Data);
      const renderOptions =
        typeof options.renderOptions === 'function'
          ? await options.renderOptions(ctx, data as Data)
          : (options.renderOptions ?? {});
      return renderReact(ctx, tree, renderOptions);
    },
  };

  if (options.load) {
    mod.load = options.load as unknown as (ctx: FaceContext) => Promise<unknown>;
  }

  return mod;
}

export interface ReactStreamFaceOptions<Data = unknown> {
  route: string;
  mode: FaceMode;
  load?: (ctx: FaceContext) => Promise<Data>;
  render: (ctx: FaceContext, data: Data) => React.ReactNode | Promise<React.ReactNode>;
  renderOptions?:
    | RenderReactStreamOptions
    | ((
        ctx: FaceContext,
        data: Data,
      ) => RenderReactStreamOptions | Promise<RenderReactStreamOptions>);
}

export function createReactStreamFace<Data = unknown>(
  options: ReactStreamFaceOptions<Data>,
): FaceModule {
  const mod: FaceModule = {
    route: options.route,
    mode: options.mode,
    render: async (ctx, data) => {
      const tree = await options.render(ctx, data as Data);
      const renderOptions =
        typeof options.renderOptions === 'function'
          ? await options.renderOptions(ctx, data as Data)
          : (options.renderOptions ?? {});
      return renderReactStream(ctx, tree, renderOptions);
    },
  };

  if (options.load) {
    mod.load = options.load as unknown as (ctx: FaceContext) => Promise<unknown>;
  }

  return mod;
}
