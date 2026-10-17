import { createSSRApp, h, type App, type VNode } from 'vue';
import { renderToSimpleStream, renderToString } from '@vue/server-renderer';

import { enforceAdapterStrictCspResult } from '../adapter-csp.js';
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

export interface VueUIIntegration<TState = unknown> extends UIIntegration<
  VNode,
  TState
> {
  /**
   * Optional Vue app hook that can install plugins/provide values before server
   * rendering while sharing the request-local integration state.
   */
  wrapApp?: (app: App, ctx: FaceContext, state: TState) => void | Promise<void>;
}

export interface RenderVueOptions {
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
  /** Vue UI integrations for wrapping the tree/app and contributing head/styles. */
  integrations?: Array<VueUIIntegration>;
}

/** Streaming Vue render options currently share the buffered Vue option shape. */
export type RenderVueStreamOptions = RenderVueOptions;

/**
 * Render a Vue vnode through the buffered adapter path and return a FaceTheory
 * `FaceRenderResult` with deterministic head, style, hydration, and strict-CSP
 * validation.
 */
export async function renderVue(
  ctx: FaceContext,
  vnode: VNode,
  options: RenderVueOptions = {},
): Promise<FaceRenderResult> {
  return renderVueInternal(ctx, vnode, options);
}

/**
 * Render a Vue vnode through FaceTheory's streaming adapter path. When an
 * integration contributes or finalizes, FaceTheory waits for Vue SSR completion
 * before assembling head/styles so async setup records are not dropped.
 */
export async function renderVueStream(
  ctx: FaceContext,
  vnode: VNode,
  options: RenderVueStreamOptions = {},
): Promise<FaceRenderResult> {
  return renderVueStreamInternal(ctx, vnode, options);
}

interface VueRenderValidationOptions {
  deferStrictCspHydrationValidation?: boolean;
}

async function renderVueInternal(
  ctx: FaceContext,
  vnode: VNode,
  options: RenderVueOptions,
  validationOptions: VueRenderValidationOptions = {},
): Promise<FaceRenderResult> {
  return runAdapterRenderPipeline<VNode, VueUIIntegration>({
    ctx,
    tree: vnode,
    options,
    integrations: options.integrations ?? [],
    renderTree: async (tree, pipelineContext) => {
      const app = createSSRApp({ render: () => tree });
      for (const {
        integration,
        state,
      } of pipelineContext.preparedIntegrations) {
        if (!integration.wrapApp) continue;
        await integration.wrapApp(app, ctx, state);
      }
      return renderToString(app);
    },
    enforceStrictCsp: (out) => {
      enforceAdapterStrictCspResult(out, {
        adapterName: 'Vue adapter',
        deferHydrationValidation:
          validationOptions.deferStrictCspHydrationValidation === true,
      });
    },
  });
}

async function renderVueStreamInternal(
  ctx: FaceContext,
  vnode: VNode,
  options: RenderVueStreamOptions,
  validationOptions: VueRenderValidationOptions = {},
): Promise<FaceRenderResult> {
  return runAdapterRenderPipeline<VNode, VueUIIntegration>({
    ctx,
    tree: vnode,
    options,
    integrations: options.integrations ?? [],
    renderTree: async (tree, pipelineContext) => {
      const app = createSSRApp({ render: () => tree });
      for (const {
        integration,
        state,
      } of pipelineContext.preparedIntegrations) {
        if (!integration.wrapApp) continue;
        await integration.wrapApp(app, ctx, state);
      }
      const stream = renderVueAppToAsyncIterable(app);
      const requiresAllReady = pipelineContext.preparedIntegrations.some(
        ({ integration }) =>
          typeof integration.contribute === 'function' ||
          typeof integration.finalize === 'function',
      );

      if (requiresAllReady) {
        await stream.completed;
      } else {
        void stream.completed.catch(() => undefined);
      }

      return stream.body;
    },
    enforceStrictCsp: (out) => {
      enforceAdapterStrictCspResult(out, {
        adapterName: 'Vue adapter',
        deferHydrationValidation:
          validationOptions.deferStrictCspHydrationValidation === true,
      });
    },
  });
}

// Vue's `renderToSimpleStream` pushes synchronously and exposes no pause hook,
// so the adapter bounds what it retains instead: pushes are coalesced into
// chunks, unread bytes are capped, and production stops (the next push throws)
// once the cap is exceeded or the consumer cancels.
const VUE_STREAM_CHUNK_TARGET_BYTES = 16 * 1024;
const VUE_STREAM_MAX_BUFFERED_BYTES = 5 * 1024 * 1024;

class VueStreamBufferLimitError extends Error {
  constructor(maxBytes: number) {
    super(
      `Vue adapter: streamed response exceeded ${maxBytes} buffered bytes awaiting consumption`,
    );
    this.name = 'VueStreamBufferLimitError';
  }
}

class VueStreamCancelledError extends Error {
  constructor() {
    super('Vue adapter: streamed response was cancelled by its consumer');
    this.name = 'VueStreamCancelledError';
  }
}

type VueStreamState = 'running' | 'done' | 'failed' | 'cancelled';

interface VueAppStream {
  body: AsyncIterable<Uint8Array>;
  completed: Promise<void>;
}

function renderVueAppToAsyncIterable(app: App): VueAppStream {
  const encoder = new TextEncoder();
  const queue: Uint8Array[] = [];
  let queuedBytes = 0;
  let pending: string[] = [];
  let pendingLength = 0;
  let state = 'running' as VueStreamState;
  let failure: unknown = null;
  let wake: (() => void) | null = null;
  let resolveCompleted: (() => void) | null = null;
  let rejectCompleted: ((error: unknown) => void) | null = null;

  const completed = new Promise<void>((resolve, reject) => {
    resolveCompleted = resolve;
    rejectCompleted = reject;
  });

  const wakeConsumer = (): void => {
    const resume = wake;
    wake = null;
    resume?.();
  };

  const flushPending = (): void => {
    if (pendingLength === 0) return;
    const chunk = encoder.encode(pending.join(''));
    pending = [];
    pendingLength = 0;
    queue.push(chunk);
    queuedBytes += chunk.byteLength;
  };

  const finish = (): void => {
    if (state !== 'running') return;
    flushPending();
    state = 'done';
    resolveCompleted?.();
    wakeConsumer();
  };

  const fail = (error: unknown): void => {
    if (state !== 'running') return;
    flushPending();
    state = 'failed';
    failure = error;
    rejectCompleted?.(error);
    wakeConsumer();
  };

  const cancel = (): void => {
    if (state !== 'running') return;
    state = 'cancelled';
    queue.length = 0;
    queuedBytes = 0;
    pending = [];
    pendingLength = 0;
    rejectCompleted?.(new VueStreamCancelledError());
    wakeConsumer();
  };

  try {
    renderToSimpleStream(
      app,
      {},
      {
        push(chunk) {
          if (chunk === null) {
            finish();
            return;
          }
          if (state === 'cancelled') throw new VueStreamCancelledError();
          if (state !== 'running') return;
          pending.push(chunk);
          pendingLength += chunk.length;
          if (pendingLength >= VUE_STREAM_CHUNK_TARGET_BYTES || wake !== null) {
            flushPending();
            wakeConsumer();
          }
          if (queuedBytes + pendingLength > VUE_STREAM_MAX_BUFFERED_BYTES) {
            const error = new VueStreamBufferLimitError(
              VUE_STREAM_MAX_BUFFERED_BYTES,
            );
            queue.length = 0;
            queuedBytes = 0;
            pending = [];
            pendingLength = 0;
            fail(error);
            throw error;
          }
        },
        destroy(error) {
          fail(error);
        },
      },
    );
  } catch (error) {
    fail(error);
  }

  return {
    body: (async function* () {
      try {
        for (;;) {
          if (queue.length === 0) flushPending();
          const chunk = queue.shift();
          if (chunk !== undefined) {
            queuedBytes -= chunk.byteLength;
            yield chunk;
            continue;
          }
          if (state === 'done') return;
          if (state === 'failed') throw failure;
          if (state === 'cancelled') return;
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
        }
      } finally {
        // The consumer stopped early (return/throw): drop retained bytes and
        // make Vue's next push throw so production stops.
        cancel();
      }
    })(),
    completed,
  };
}

export interface VueFaceOptions<Data = unknown> {
  /** Route pattern registered with `createFaceApp()`. */
  route: string;
  /** FaceTheory render mode for this Vue Face. */
  mode: FaceMode;
  /** Optional server-side data loader; cache behavior follows the selected mode. */
  load?: (ctx: FaceContext) => Promise<Data>;
  /** Returns the Vue vnode rendered for the request/build. */
  render: (ctx: FaceContext, data: Data) => VNode | Promise<VNode>;
  /** Static or request-derived render options passed to `renderVue()`. */
  renderOptions?:
    | RenderVueOptions
    | ((
        ctx: FaceContext,
        data: Data,
      ) => RenderVueOptions | Promise<RenderVueOptions>);
}

/**
 * Create a buffered Vue `FaceModule` while preserving FaceTheory's mode,
 * hydration, head/style, and strict-CSP contracts.
 */
export function createVueFace<Data = unknown>(
  options: VueFaceOptions<Data>,
): FaceModule {
  const mod: FaceModule = {
    route: options.route,
    mode: options.mode,
    render: async (ctx, data) => {
      const vnode = await options.render(ctx, data as Data);
      const renderOptions =
        typeof options.renderOptions === 'function'
          ? await options.renderOptions(ctx, data as Data)
          : (options.renderOptions ?? {});
      return renderVueInternal(ctx, vnode, renderOptions, {
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

export interface VueStreamFaceOptions<Data = unknown> {
  /** Route pattern registered with `createFaceApp()`. */
  route: string;
  /** FaceTheory render mode for this streaming Vue Face. */
  mode: FaceMode;
  /** Optional server-side data loader; cache behavior follows the selected mode. */
  load?: (ctx: FaceContext) => Promise<Data>;
  /** Returns the Vue vnode rendered into a stream. */
  render: (ctx: FaceContext, data: Data) => VNode | Promise<VNode>;
  /** Static or request-derived render options passed to `renderVueStream()`. */
  renderOptions?:
    | RenderVueStreamOptions
    | ((
        ctx: FaceContext,
        data: Data,
      ) => RenderVueStreamOptions | Promise<RenderVueStreamOptions>);
}

/**
 * Create a streaming Vue `FaceModule` with the same adapter pipeline semantics
 * as buffered Vue rendering.
 */
export function createVueStreamFace<Data = unknown>(
  options: VueStreamFaceOptions<Data>,
): FaceModule {
  const mod: FaceModule = {
    route: options.route,
    mode: options.mode,
    render: async (ctx, data) => {
      const vnode = await options.render(ctx, data as Data);
      const renderOptions =
        typeof options.renderOptions === 'function'
          ? await options.renderOptions(ctx, data as Data)
          : (options.renderOptions ?? {});
      return renderVueStreamInternal(ctx, vnode, renderOptions, {
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

export { h };
