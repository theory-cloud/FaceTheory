import { createSSRApp, h, type App, type VNode } from 'vue';
import { renderToString } from '@vue/server-renderer';

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

export interface VueUIIntegration extends UIIntegration<VNode> {
  wrapApp?: (app: App, ctx: FaceContext) => void | Promise<void>;
}

export interface RenderVueOptions {
  status?: number;
  headers?: Record<string, string | string[]>;
  cookies?: string[];
  head?: FaceHead;
  headTags?: FaceHeadTag[];
  styleTags?: FaceStyleTag[];
  hydration?: FaceHydration;
  integrations?: Array<VueUIIntegration>;
}

export async function renderVue(
  ctx: FaceContext,
  vnode: VNode,
  options: RenderVueOptions = {},
): Promise<FaceRenderResult> {
  const integrations = options.integrations ?? [];

  let tree = vnode;
  for (const integration of integrations) {
    if (!integration.wrapTree) continue;
    tree = integration.wrapTree(tree, ctx);
  }

  const app = createSSRApp({ render: () => tree });
  for (const integration of integrations) {
    if (!integration.wrapApp) continue;
    await integration.wrapApp(app, ctx);
  }

  const integrationHeadTags: FaceHeadTag[] = [];
  const integrationStyleTags: FaceStyleTag[] = [];
  for (const integration of integrations) {
    if (!integration.contribute) continue;
    const contribution = await integration.contribute(ctx);
    if (contribution.headTags) integrationHeadTags.push(...contribution.headTags);
    if (contribution.styleTags) integrationStyleTags.push(...contribution.styleTags);
  }

  const html = await renderToString(app);

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

  for (const integration of integrations) {
    if (!integration.finalize) continue;
    out = await integration.finalize(out, ctx);
  }

  return out;
}

export interface VueFaceOptions<Data = unknown> {
  route: string;
  mode: FaceMode;
  load?: (ctx: FaceContext) => Promise<Data>;
  render: (ctx: FaceContext, data: Data) => VNode | Promise<VNode>;
  renderOptions?:
    | RenderVueOptions
    | ((ctx: FaceContext, data: Data) => RenderVueOptions | Promise<RenderVueOptions>);
}

export function createVueFace<Data = unknown>(options: VueFaceOptions<Data>): FaceModule {
  const mod: FaceModule = {
    route: options.route,
    mode: options.mode,
    render: async (ctx, data) => {
      const vnode = await options.render(ctx, data as Data);
      const renderOptions =
        typeof options.renderOptions === 'function'
          ? await options.renderOptions(ctx, data as Data)
          : (options.renderOptions ?? {});
      return renderVue(ctx, vnode, renderOptions);
    },
  };

  if (options.load) {
    mod.load = options.load as unknown as (ctx: FaceContext) => Promise<unknown>;
  }

  return mod;
}

export { h };
