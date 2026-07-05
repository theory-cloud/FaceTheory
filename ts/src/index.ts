export {
  DEFAULT_STRICT_CSP_STREAMING_BODY_LIMIT_BYTES,
  FaceApp,
  createFaceApp,
  defineFace,
} from './app.js';
export type {
  FaceAppLogHook,
  FaceAppLogRecord,
  FaceAppObservabilityHooks,
  FaceAppOptions,
  FaceSsrHydrationSidecarOptions,
  FaceSsrHydrationSidecarVariantCallback,
  FaceStrictCspOptions,
} from './app.js';

export {
  assembleFaceRenderResult,
  modeUsesRuntimeHydrationSidecars,
  runAdapterRenderPipeline,
} from './adapter-pipeline.js';
export type {
  AdapterFaceRenderOptions,
  AdapterRenderPipelineContext,
  AdapterRenderPipelineInput,
  AdapterRenderTreeOutput,
  AdapterRenderTreeResult,
  AssembleFaceRenderResultInput,
} from './adapter-pipeline.js';

export { streamFromString, utf8 } from './bytes.js';

export {
  canonical,
  jsonLd,
  metaTag,
  openGraph,
  renderFaceHead,
  titleTag,
  twitterCard,
} from './head.js';
export type {
  HeadLinkExtraAttributes,
  HeadMetaContent,
  HeadMetaExtraAttributes,
  HeadTitleTemplate,
  JsonLdOptions,
  OpenGraphOptions,
  RenderFaceHeadOptions,
  TitleTagOptions,
  TwitterCardOptions,
} from './head.js';

export {
  escapeHTML,
  escapeJsonForHtml,
  renderAttributes,
  renderHTMLDocument,
  safeJson,
  streamHTMLDocument,
} from './html.js';
export type { HTMLDocumentParts, HTMLDocumentStreamParts } from './html.js';

export {
  InMemoryHtmlStore,
  InMemoryIsrMetaStore,
  S3HtmlStore,
  blockingIsrCacheControl,
  createIsrRuntime,
  defaultIsrCacheKey,
  isFresh,
  tenantKeyFromTrustedHeader,
} from './isr.js';
export type {
  CommitIsrGenerationInput,
  FaceIsrOptions,
  HandleIsrFaceInput,
  HtmlStore,
  HtmlStoreReadResult,
  HtmlStoreWriteInput,
  HtmlStoreWriteResult,
  IsrCacheControlOptions,
  IsrCacheHeaderInput,
  IsrCacheKeyInput,
  IsrCacheState,
  IsrCachedStrictCspPolicy,
  IsrFailurePolicy,
  IsrHydrationSidecar,
  IsrLockContentionPolicy,
  IsrMetaRecord,
  IsrMetaStore,
  IsrRenderFreshOptions,
  IsrRuntime,
  ReleaseIsrLeaseInput,
  S3HtmlStoreClient,
  S3HtmlStoreOptions,
  TryAcquireIsrLeaseInput,
  TryAcquireIsrLeaseResult,
} from './isr.js';

export {
  createLambdaUrlStreamingHandler,
  faceResponseToLambdaUrlMetadata,
  faceResponseToLambdaUrlResult,
  handleLambdaUrlEvent,
  lambdaUrlEventToFaceRequest,
  writeFaceResponseToLambdaWriter,
} from './lambda-url.js';
export type {
  AwsLambdaGlobalLike,
  CreateLambdaUrlStreamingHandlerOptions,
  FaceRequestHandler,
  LambdaResponseWriter,
  LambdaUrlEvent,
  LambdaUrlHttpContext,
  LambdaUrlRequestContext,
  LambdaUrlResponseMetadata,
  LambdaUrlResult,
  LambdaWritableStream,
} from './lambda-url.js';

export { errorClassFor, logLevelForStatus, reportFaceError } from './ops.js';
export type {
  FaceErrorContext,
  FaceErrorPhase,
  FaceLogLevel,
  FaceMetricRecord,
  FaceObservabilityHooks,
  FaceObservabilityLogRecord,
  FaceRequestCompletedLogRecord,
  FaceStreamErrorLogRecord,
} from './ops.js';

export {
  emptyResourceResponse,
  jsonResourceResponse,
  methodNotAllowedResourceResponse,
  textResourceResponse,
} from './resource.js';
export type {
  FaceEmptyResourceResponseOptions,
  FaceJsonResourceResponseOptions,
  FaceMethodNotAllowedResourceResponseOptions,
  FaceResourceResponseOptions,
  FaceTextResourceResponseOptions,
} from './resource.js';

export {
  buildStrictCspHeader,
  createCspNonce,
  requiresStrictCspDocumentValidation,
  validateStrictCspDocument,
} from './security.js';
export type {
  StrictCspDirectiveExtensions,
  StrictCspDirectiveValue,
  StrictCspDirectiveValues,
  StrictCspDocumentValidationOptions,
  StrictCspHeaderOptions,
} from './security.js';

export {
  buildSsrHydrationSidecarDataUrl,
  createSsrHydrationSidecarStore,
  DEFAULT_SSR_HYDRATION_SIDECAR_TTL_SECONDS,
  normalizeSsrHydrationSidecarDataUrlPrefix,
  serializeSsrHydrationSidecarJson,
  SsrHydrationSidecarError,
} from './ssr-hydration.js';
export type {
  ReadSsrHydrationSidecarInput,
  ReadSsrHydrationSidecarResult,
  SsrHydrationSidecarRejectReason,
  SsrHydrationSidecarSigningSecret,
  SsrHydrationSidecarStore,
  SsrHydrationSidecarStoreOptions,
  SsrHydrationSidecarVariantInput,
  StoredSsrHydrationSidecar,
  VerifiedSsrHydrationSidecarToken,
  WriteSsrHydrationSidecarInput,
} from './ssr-hydration.js';

export {
  buildSsgSite,
  planSsgPages,
  ssgFilePathForRoute,
  ssgHydrationDataFilePathForRoute,
  SsgBuildFailedError,
} from './ssg.js';
export type {
  BuildSsgSiteOptions,
  BuildSsgSiteResult,
  SsgFailedRoute,
  SsgManifest,
  SsgPageEntry,
  SsgSkippedRoute,
  SsgTrailingSlashPolicy,
} from './ssg.js';

export type {
  CookieMap,
  FaceAttributes,
  FaceBody,
  FaceContext,
  FaceCspPolicy,
  FaceExternalHydration,
  FaceHead,
  FaceHeaders,
  FaceHeadTag,
  FaceHydration,
  FaceInlineHydration,
  FaceMode,
  FaceModule,
  FaceRenderResult,
  FaceRequest,
  FaceResourceHandler,
  FaceResourceRoute,
  FaceResponse,
  FaceResponseHeaders,
  FaceResponseHeaderValue,
  FaceStyleTag,
  PreparedUIIntegration,
  Query,
  TrailingSlashPolicy,
  UIIntegration,
  UIIntegrationContribution,
} from './types.js';

export {
  externalHydrationForEntry,
  viteAssetsForEntry,
  viteDevAssetsForEntry,
  viteDevHydrationForEntry,
  viteDynamicImportPolicy,
  viteHydrationForEntry,
} from './vite.js';
export type {
  DynamicImportPolicy,
  ViteAssetsOptions,
  ViteDevAssetsOptions,
  ViteExternalHydrationOptions,
  ViteManifest,
  ViteManifestChunk,
} from './vite.js';
