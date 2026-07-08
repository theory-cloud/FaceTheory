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

type VueStreamQueueItem =
  | { kind: 'chunk'; chunk: Uint8Array }
  | { kind: 'done' }
  | { kind: 'error'; error: unknown };

interface VueAppStream {
  body: AsyncIterable<Uint8Array>;
  completed: Promise<void>;
}

function renderVueAppToAsyncIterable(app: App): VueAppStream {
  const encoder = new TextEncoder();
  const queue: VueStreamQueueItem[] = [];
  let wake: (() => void) | null = null;
  let settled = false;
  let resolveCompleted: (() => void) | null = null;
  let rejectCompleted: ((error: unknown) => void) | null = null;

  const completed = new Promise<void>((resolve, reject) => {
    resolveCompleted = resolve;
    rejectCompleted = reject;
  });

  const enqueue = (item: VueStreamQueueItem): void => {
    queue.push(item);
    wake?.();
    wake = null;
  };

  const finish = (): void => {
    if (settled) return;
    settled = true;
    enqueue({ kind: 'done' });
    resolveCompleted?.();
  };

  const fail = (error: unknown): void => {
    if (settled) return;
    settled = true;
    enqueue({ kind: 'error', error });
    rejectCompleted?.(error);
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
          if (settled) return;
          enqueue({ kind: 'chunk', chunk: encoder.encode(chunk) });
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
      for (;;) {
        while (queue.length === 0) {
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
        }

        const item = queue.shift()!;
        if (item.kind === 'chunk') {
          yield item.chunk;
          continue;
        }
        if (item.kind === 'error') throw item.error;
        return;
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
