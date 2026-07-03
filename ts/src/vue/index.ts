import { createSSRApp, h, type App, type VNode } from 'vue';
import { renderToString } from '@vue/server-renderer';

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

export async function renderVue(
  ctx: FaceContext,
  vnode: VNode,
  options: RenderVueOptions = {},
): Promise<FaceRenderResult> {
  return renderVueInternal(ctx, vnode, options);
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
      for (const { integration, state } of pipelineContext.preparedIntegrations) {
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

export { h };
