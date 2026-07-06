import { PassThrough } from 'node:stream';

import * as React from 'react';
import * as ReactDOMServer from 'react-dom/server';

import {
  enforceAdapterStrictCspResult,
  enforceReactStrictCspStreamingOptions,
} from '../adapter-csp.js';
import {
  modeUsesRuntimeHydrationSidecars,
  runAdapterRenderPipeline,
} from '../adapter-pipeline.js';
import type {
  FaceContext,
  FaceCspPolicy,
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
  /** HTTP status for the rendered Face response. */
  status?: number;
  /** Additional response headers merged into the Face response. */
  headers?: Record<string, string | string[]>;
  /** Set-Cookie header values emitted with the response. */
  cookies?: string[];
  /** Structured document head shortcut, usually `{ title }`. */
  head?: FaceHead;
  /** Deterministic head tags emitted through FaceTheory's head primitive. */
  headTags?: FaceHeadTag[];
  /** Deterministic style tags emitted by adapter integrations. */
  styleTags?: FaceStyleTag[];
  /** Hydration payload or external sidecar reference for the client bootstrap. */
  hydration?: FaceHydration;
  /** Strict-CSP policy requested by this render. */
  csp?: FaceCspPolicy;
  /** React UI integrations for wrapping the tree and contributing head/styles. */
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

/**
 * Render a React node through the buffered adapter path and return a
 * FaceTheory `FaceRenderResult` with deterministic head, style, hydration, and
 * strict-CSP validation.
 */
export async function renderReact(
  ctx: FaceContext,
  node: React.ReactNode,
  options: RenderReactOptions = {},
): Promise<FaceRenderResult> {
  return renderReactInternal(ctx, node, options);
}

interface ReactRenderValidationOptions {
  deferStrictCspHydrationValidation?: boolean;
}

async function renderReactInternal(
  ctx: FaceContext,
  node: React.ReactNode,
  options: RenderReactOptions,
  validationOptions: ReactRenderValidationOptions = {},
): Promise<FaceRenderResult> {
  return runAdapterRenderPipeline<
    React.ReactElement,
    UIIntegration<React.ReactElement>
  >({
    ctx,
    tree: React.createElement(React.Fragment, null, node),
    options,
    integrations: options.integrations ?? [],
    renderTree: (tree) => ReactDOMServer.renderToString(tree),
    enforceStrictCsp: (out) => {
      enforceAdapterStrictCspResult(out, {
        adapterName: 'React adapter',
        deferHydrationValidation:
          validationOptions.deferStrictCspHydrationValidation === true,
      });
    },
  });
}

/**
 * Render a React node through FaceTheory's streaming adapter path. The response
 * body remains an async iterable while head/style assembly and strict-CSP
 * checks stay on the shared adapter pipeline.
 */
export async function renderReactStream(
  ctx: FaceContext,
  node: React.ReactNode,
  options: RenderReactStreamOptions = {},
): Promise<FaceRenderResult> {
  return renderReactStreamInternal(ctx, node, options);
}

async function renderReactStreamInternal(
  ctx: FaceContext,
  node: React.ReactNode,
  options: RenderReactStreamOptions,
  validationOptions: ReactRenderValidationOptions = {},
): Promise<FaceRenderResult> {
  return runAdapterRenderPipeline<
    React.ReactElement,
    UIIntegration<React.ReactElement>
  >({
    ctx,
    tree: React.createElement(React.Fragment, null, node),
    options,
    integrations: options.integrations ?? [],
    renderTree: async (tree, pipelineContext) => {
      const stream = new PassThrough();
      const abortDelayMs = options.abortDelayMs ?? 5000;
      const styleStrategy = options.styleStrategy ?? 'all-ready';
      enforceReactStrictCspStreamingOptions({
        adapterName: 'React adapter',
        policy: options.csp,
        styleStrategy,
        hasFinalizeInlineStyleIntegration:
          pipelineContext.preparedIntegrations.some(
            ({ integration }) => typeof integration.finalize === 'function',
          ),
      });
      const startedAt = Date.now();
      const requestId =
        String(ctx.request.headers['x-request-id']?.[0] ?? '').trim() || null;

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

      return stream as unknown as AsyncIterable<Uint8Array>;
    },
    enforceStrictCsp: (out) => {
      enforceAdapterStrictCspResult(out, {
        adapterName: 'React adapter',
        deferHydrationValidation:
          validationOptions.deferStrictCspHydrationValidation === true,
      });
    },
  });
}

export interface ReactFaceOptions<Data = unknown> {
  /** Route pattern registered with `createFaceApp()`. */
  route: string;
  /** FaceTheory render mode for this React Face. */
  mode: FaceMode;
  /** Optional server-side data loader; cache behavior follows the selected mode. */
  load?: (ctx: FaceContext) => Promise<Data>;
  /** Returns the React node rendered for the request/build. */
  render: (
    ctx: FaceContext,
    data: Data,
  ) => React.ReactNode | Promise<React.ReactNode>;
  /** Static or request-derived render options passed to `renderReact()`. */
  renderOptions?:
    | RenderReactOptions
    | ((
        ctx: FaceContext,
        data: Data,
      ) => RenderReactOptions | Promise<RenderReactOptions>);
}

/**
 * Create a buffered React `FaceModule` while preserving FaceTheory's mode,
 * hydration, head/style, and strict-CSP contracts.
 */
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
      return renderReactInternal(ctx, tree, renderOptions, {
        deferStrictCspHydrationValidation: modeUsesRuntimeHydrationSidecars(
          options.mode,
        ),
      });
    },
  };

  if (options.load) {
    mod.load = options.load as unknown as (
      ctx: FaceContext,
    ) => Promise<unknown>;
  }

  return mod;
}

export interface ReactStreamFaceOptions<Data = unknown> {
  /** Route pattern registered with `createFaceApp()`. */
  route: string;
  /** FaceTheory render mode for this streaming React Face. */
  mode: FaceMode;
  /** Optional server-side data loader; cache behavior follows the selected mode. */
  load?: (ctx: FaceContext) => Promise<Data>;
  /** Returns the React node rendered into a stream. */
  render: (
    ctx: FaceContext,
    data: Data,
  ) => React.ReactNode | Promise<React.ReactNode>;
  /** Static or request-derived render options passed to `renderReactStream()`. */
  renderOptions?:
    | RenderReactStreamOptions
    | ((
        ctx: FaceContext,
        data: Data,
      ) => RenderReactStreamOptions | Promise<RenderReactStreamOptions>);
}

/**
 * Create a streaming React `FaceModule`. Use the default `all-ready` style
 * strategy when strict-CSP validation or finalize-time style extraction must
 * observe the complete React tree before response bytes are exposed.
 */
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
      return renderReactStreamInternal(ctx, tree, renderOptions, {
        deferStrictCspHydrationValidation: modeUsesRuntimeHydrationSidecars(
          options.mode,
        ),
      });
    },
  };

  if (options.load) {
    mod.load = options.load as unknown as (
      ctx: FaceContext,
    ) => Promise<unknown>;
  }

  return mod;
}
