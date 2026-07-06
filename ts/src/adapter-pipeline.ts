import { prepareUIIntegrations } from './types.js';
import type {
  FaceContext,
  FaceCspPolicy,
  FaceHead,
  FaceHeadTag,
  FaceHydration,
  FaceMode,
  FaceRenderResult,
  FaceResponseHeaders,
  FaceStyleTag,
  PreparedUIIntegration,
  UIIntegration,
} from './types.js';

export interface AdapterFaceRenderOptions {
  status?: number;
  headers?: FaceResponseHeaders;
  cookies?: string[];
  head?: FaceHead;
  headTags?: FaceHeadTag[];
  styleTags?: FaceStyleTag[];
  hydration?: FaceHydration;
  csp?: FaceCspPolicy;
}

export interface AssembleFaceRenderResultInput {
  html: FaceRenderResult['html'];
  options?: AdapterFaceRenderOptions;
  integrationHeadTags?: readonly FaceHeadTag[];
  integrationStyleTags?: readonly FaceStyleTag[];
  adapterHeadTags?: readonly FaceHeadTag[];
  adapterStyleTags?: readonly FaceStyleTag[];
}

export interface AdapterRenderTreeOutput {
  html: FaceRenderResult['html'];
  headTags?: readonly FaceHeadTag[];
  styleTags?: readonly FaceStyleTag[];
}

export type AdapterRenderTreeResult =
  | FaceRenderResult['html']
  | AdapterRenderTreeOutput;

export interface AdapterRenderPipelineContext<
  TTree,
  TIntegration extends UIIntegration<TTree>,
> {
  ctx: FaceContext;
  preparedIntegrations: ReadonlyArray<
    PreparedUIIntegration<TTree, TIntegration>
  >;
}

export interface AdapterRenderPipelineInput<
  TTree,
  TIntegration extends UIIntegration<TTree> = UIIntegration<TTree>,
> {
  ctx: FaceContext;
  tree: TTree;
  options?: AdapterFaceRenderOptions;
  integrations?: ReadonlyArray<TIntegration>;
  renderTree: (
    tree: TTree,
    context: AdapterRenderPipelineContext<TTree, TIntegration>,
  ) => AdapterRenderTreeResult | Promise<AdapterRenderTreeResult>;
  enforceStrictCsp?: (
    out: FaceRenderResult,
    context: AdapterRenderPipelineContext<TTree, TIntegration>,
  ) => void | Promise<void>;
}

export function modeUsesRuntimeHydrationSidecars(
  mode: FaceMode | 'spa',
): boolean {
  return mode === 'ssr' || mode === 'isr' || mode === 'ssg';
}

export function assembleFaceRenderResult(
  input: AssembleFaceRenderResultInput,
): FaceRenderResult {
  const options = input.options ?? {};
  const headTags = [
    ...(input.integrationHeadTags ?? []),
    ...(options.headTags ?? []),
    ...(input.adapterHeadTags ?? []),
  ];
  const styleTags = [
    ...(input.integrationStyleTags ?? []),
    ...(options.styleTags ?? []),
    ...(input.adapterStyleTags ?? []),
  ];

  const out: FaceRenderResult = { html: input.html };
  if (options.status !== undefined) out.status = options.status;
  if (options.headers !== undefined) out.headers = options.headers;
  if (options.cookies !== undefined) out.cookies = options.cookies;
  if (options.head !== undefined) out.head = options.head;
  if (headTags.length) out.headTags = headTags;
  if (styleTags.length) out.styleTags = styleTags;
  if (options.hydration !== undefined) out.hydration = options.hydration;
  if (options.csp !== undefined) out.csp = options.csp;
  return out;
}

export async function runAdapterRenderPipeline<
  TTree,
  TIntegration extends UIIntegration<TTree> = UIIntegration<TTree>,
>(
  input: AdapterRenderPipelineInput<TTree, TIntegration>,
): Promise<FaceRenderResult> {
  const preparedIntegrations = await prepareUIIntegrations<TTree, TIntegration>(
    input.integrations ?? [],
    input.ctx,
  );
  const context: AdapterRenderPipelineContext<TTree, TIntegration> = {
    ctx: input.ctx,
    preparedIntegrations,
  };

  let tree = input.tree;
  for (const { integration, state } of preparedIntegrations) {
    if (!integration.wrapTree) continue;
    tree = integration.wrapTree(tree, input.ctx, state);
  }

  const rendered = normalizeRenderTreeOutput(
    await input.renderTree(tree, context),
  );

  const integrationHeadTags: FaceHeadTag[] = [];
  const integrationStyleTags: FaceStyleTag[] = [];
  for (const { integration, state } of preparedIntegrations) {
    if (!integration.contribute) continue;
    const contribution = await integration.contribute(input.ctx, state);
    if (contribution.headTags)
      integrationHeadTags.push(...contribution.headTags);
    if (contribution.styleTags)
      integrationStyleTags.push(...contribution.styleTags);
  }

  const assembleInput: AssembleFaceRenderResultInput = {
    html: rendered.html,
    integrationHeadTags,
    integrationStyleTags,
  };
  if (input.options !== undefined) assembleInput.options = input.options;
  if (rendered.headTags !== undefined)
    assembleInput.adapterHeadTags = rendered.headTags;
  if (rendered.styleTags !== undefined)
    assembleInput.adapterStyleTags = rendered.styleTags;

  let out = assembleFaceRenderResult(assembleInput);

  for (const { integration, state } of preparedIntegrations) {
    if (!integration.finalize) continue;
    out = await integration.finalize(out, input.ctx, state);
  }

  await input.enforceStrictCsp?.(out, context);
  return out;
}

function normalizeRenderTreeOutput(
  rendered: AdapterRenderTreeResult,
): AdapterRenderTreeOutput {
  if (typeof rendered === 'string' || isAsyncIterable(rendered)) {
    return { html: rendered };
  }
  return rendered;
}

function isAsyncIterable(value: unknown): value is AsyncIterable<Uint8Array> {
  return (
    typeof value === 'object' && value !== null && Symbol.asyncIterator in value
  );
}
