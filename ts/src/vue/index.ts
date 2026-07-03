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
  wrapApp?: (app: App, ctx: FaceContext, state: TState) => void | Promise<void>;
}

export interface RenderVueOptions {
  status?: number;
  headers?: Record<string, string | string[]>;
  cookies?: string[];
  head?: FaceHead;
  headTags?: FaceHeadTag[];
  styleTags?: FaceStyleTag[];
  hydration?: FaceHydration;
  csp?: FaceCspPolicy;
  integrations?: Array<VueUIIntegration>;
}

export type RenderVueStreamOptions = RenderVueOptions;

export async function renderVue(
  ctx: FaceContext,
  vnode: VNode,
  options: RenderVueOptions = {},
): Promise<FaceRenderResult> {
  return renderVueInternal(ctx, vnode, options);
}

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
  route: string;
  mode: FaceMode;
  load?: (ctx: FaceContext) => Promise<Data>;
  render: (ctx: FaceContext, data: Data) => VNode | Promise<VNode>;
  renderOptions?:
    | RenderVueOptions
    | ((
        ctx: FaceContext,
        data: Data,
      ) => RenderVueOptions | Promise<RenderVueOptions>);
}

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
  route: string;
  mode: FaceMode;
  load?: (ctx: FaceContext) => Promise<Data>;
  render: (ctx: FaceContext, data: Data) => VNode | Promise<VNode>;
  renderOptions?:
    | RenderVueStreamOptions
    | ((
        ctx: FaceContext,
        data: Data,
      ) => RenderVueStreamOptions | Promise<RenderVueStreamOptions>);
}

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
