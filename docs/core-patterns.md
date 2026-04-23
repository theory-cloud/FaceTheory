# FaceTheory Core Patterns

These patterns describe the supported integration choices that show up repeatedly across the runtime, the framework adapters, and the AWS deployment path.

## Pattern: Use AppTheory for Lambda Function URL streaming

Problem:
You need a supported production entrypoint that preserves streaming behavior, request normalization, and request-id propagation.

**CORRECT**

```ts
import { createApp, createLambdaFunctionURLStreamingHandler } from '@theory-cloud/apptheory';
import { createFaceApp } from '@theory-cloud/facetheory';
import { createAppTheoryFaceHandler } from '@theory-cloud/facetheory/apptheory';

const faceApp = createFaceApp({ faces });
const app = createApp();
const faceHandler = createAppTheoryFaceHandler({ app: faceApp });

app.get('/', faceHandler);
app.get('/{proxy+}', faceHandler);

export const handler = createLambdaFunctionURLStreamingHandler(app);
```

Why this is correct:
- Uses the documented adapter surface.
- Preserves `x-request-id` correlation across AppTheory and FaceTheory.
- Keeps cookie and `set-cookie` behavior aligned with the tested runtime path.

**INCORRECT**

```ts
export const handler = async () => ({
  statusCode: 200,
  headers: { 'cache-control': 'public, max-age=31536000, immutable' },
  body: '<html>...</html>',
});
```

Why this is incorrect:
- It bypasses FaceTheory and AppTheory request and response translation.
- It applies an immutable cache policy to request-dependent HTML.

## Pattern: Select route mode by freshness model

Problem:
You need to map each route to `ssr`, `ssg`, or `isr`.

**CORRECT**

```ts
import type { FaceModule } from '@theory-cloud/facetheory';

export const faces: FaceModule[] = [
  { route: '/', mode: 'ssr', render: async () => ({ html: '<h1>Home</h1>' }) },
  { route: '/docs', mode: 'ssg', render: async () => ({ html: '<h1>Docs</h1>' }) },
  {
    route: '/news/{id}',
    mode: 'isr',
    revalidateSeconds: 60,
    render: async () => ({ html: '<h1>News</h1>' }),
  },
];
```

Why this is correct:
- `ssg` is reserved for build-time output.
- `generateStaticParams()` for SSG must resolve to normal path segments; dot-segments such as `.` and `..` are rejected rather than being written into the output tree.
- `isr` is only used where regeneration is explicit and bounded.
- `ssr` remains the fallback when freshness depends on request-time inputs.

**INCORRECT**

```ts
const app = createFaceApp({
  faces: [{ route: '/blog/{id}', mode: 'isr', render: async () => ({ html: '...' }) }],
});
```

Why this is incorrect:
- It omits the coordinated HTML and metadata stores that blocking ISR expects in production.

## Pattern: Keep ISR storage prefixes intentional

Problem:
ISR HTML pointers and S3 object keys need predictable shapes.

**CORRECT**

```ts
import { S3HtmlStore, createFaceApp } from '@theory-cloud/facetheory';

const htmlStore = new S3HtmlStore({
  client,
  bucket: 'example-bucket',
  keyPrefix: 'isr-html',
});

const app = createFaceApp({
  faces,
  isr: {
    htmlStore,
    metaStore,
    htmlPointerPrefix: 'pages',
  },
});
```

Why this is correct:
- The physical S3 prefix and logical pointer prefix are distinct.
- Generated keys stay understandable during verification and incident response.

**INCORRECT**

```ts
keyPrefix: 'isr'
htmlPointerPrefix: 'isr'
```

Why this is incorrect:
- It can produce duplicated key segments such as `isr/isr/...`.

## Pattern: Default React streaming to `all-ready`

Problem:
Streaming improves TTFB, but style extraction timing can change output completeness.

**CORRECT**

```ts
import { createReactStreamFace } from '@theory-cloud/facetheory/react';
import { createAntdEmotionTokenIntegration } from '@theory-cloud/facetheory/react/antd-emotion';
import { createAntdIntegration } from '@theory-cloud/facetheory/react/antd';
import { createEmotionIntegration } from '@theory-cloud/facetheory/react/emotion';

createReactStreamFace({
  route: '/',
  mode: 'ssr',
  render: async () => <App />,
  renderOptions: {
    styleStrategy: 'all-ready',
    integrations: [
      createAntdEmotionTokenIntegration(),
      createAntdIntegration({ hashed: false }),
      createEmotionIntegration(),
    ],
  },
});
```

Why this is correct:
- `all-ready` is the default and safest style extraction strategy.
- The AntD token bridge runs before `createAntdIntegration()`, which matches the adapter contract.
- Integrations can be declared once and reused because request-local mutable data should live in each integration's `createState()` hook rather than in module or closure state.

**INCORRECT**

```ts
createReactStreamFace({
  route: '/',
  mode: 'ssr',
  render: async () => <App />,
  renderOptions: {
    styleStrategy: 'shell',
  },
});
```

Why this can be incorrect:
- `shell` may emit before late styles from Suspense or async boundaries are available.
- FaceTheory drains late `all-ready` failures so shell mode does not leak unhandled readiness rejections, but it still intentionally trades away late-style capture.
- It is only appropriate when you have explicitly accepted that tradeoff.

## Pattern: Set document-shell attrs in the render contract

Problem:
The host needs root-level document semantics such as `lang`, `dir`, theme, or body classes without bypassing FaceTheory's HTML emitters.

**CORRECT**

```ts
{
  route: '/',
  mode: 'ssr',
  render: async () => ({
    lang: 'ar',
    htmlAttrs: { dir: 'rtl', 'data-theme': 'midnight' },
    bodyAttrs: { class: 'dashboard-shell' },
    html: '<div id="root">...</div>',
  }),
}
```

Why this is correct:
- It uses the public render contract instead of raw string surgery around `<html>` or `<body>`.
- The same attrs flow through buffered and streaming responses.
- Attr output stays escaped and deterministic.

**INCORRECT**

```ts
render: async () => ({
  html: '<html dir="rtl"><body class="dashboard-shell">...</body></html>',
})
```

Why this is incorrect:
- It bypasses FaceTheory's document shell and can produce nested or invalid HTML.
- It loses the shared escaping and merge rules that the runtime and tests enforce.

## Pattern: Host packaged Svelte component libraries through the client entry

Problem:
You need FaceTheory's Svelte adapter to SSR and hydrate components that come from an external Svelte package, while also delivering the package CSS and any Vite-discovered assets coherently.

**CORRECT**

```ts
// src/entry-client.ts
import '@theory-cloud/facetheory-svelte-library-example/styles.css';

// src/entry-server.ts
const { headTags } = viteAssetsForEntry(manifest, 'src/entry-client.ts', {
  includeAssets: true,
});

return {
  headTags,
  hydration: viteHydrationForEntry(manifest, 'src/entry-client.ts', data),
};
```

Why this is correct:
- The packaged library is imported like a normal dependency instead of being copied into the host app.
- Package CSS stays in the Vite client graph, so FaceTheory can emit deterministic stylesheet and asset tags from the manifest.
- The hydration bootstrap module matches the same client entry that pulled in the library code and CSS.

Reference example:
- `ts/examples/vite-ssr-svelte-library/`

**INCORRECT**

```ts
return {
  html: '<style>/* pasted library css */</style><div>...</div>',
}
```

Why this is incorrect:
- It bypasses the package asset graph and makes stylesheet delivery drift from the hydrated client bundle.
- It creates a second, undocumented integration path that tests will not cover.

## Pattern: Use `startFaceNavigation()` with a stable view container

Problem:
You want SPA-style navigation between FaceTheory routes without a full browser refresh, while keeping document attrs, head tags, and hydration data aligned with the server-rendered output.

**CORRECT**

```ts
import { startFaceNavigation } from '@theory-cloud/facetheory';

export async function hydrateFaceNavigation({ data, view }) {
  renderIntoExistingClientRoot(view, data);
}

startFaceNavigation({
  viewSelector: '[data-facetheory-view]',
});
```

Why this is correct:
- FaceTheory fetches the next route as HTML and reuses the existing server contract instead of inventing a second route payload format.
- `lang`, `htmlAttrs`, `bodyAttrs`, and non-executable head tags stay synchronized with the rendered document.
- Exporting `hydrateFaceNavigation(...)` lets the client module update an existing app root instead of forcing a hard reload.
- Same-origin boundaries stay intact: redirected cross-origin responses, remote bootstrap modules, and cross-origin programmatic navigations fail closed before the current document is mutated.

Compatibility note:
- If the bootstrap module does not export `hydrateFaceNavigation(...)`, FaceTheory can still reload that module as a fallback so existing side-effect-based entrypoints continue to work, but that fallback will not preserve long-lived client state.

**INCORRECT**

```ts
document.addEventListener('click', async (event) => {
  // fetch('/next') and manually patch random DOM nodes
});
```

Why this is incorrect:
- It bypasses the tested FaceTheory navigation helpers and leaves head tags, hydration payloads, and document attrs unsynchronized.
- It creates an ad hoc client router contract that other hosts and adapters cannot share.

## Pattern: Keep Stitch contracts shared and adapter imports matched

Problem:
You need dense control-plane UI across React, Vue, and Svelte without letting one framework invent a different tab/filter/log/status surface.

**CORRECT**

```ts
import type {
  FilterChipConfig,
  LogEntry,
  StatusVariant,
  TabItem,
} from '@theory-cloud/facetheory/stitch-admin';
import { Callout } from '@theory-cloud/facetheory/vue/stitch-shell';
import {
  CopyableCode,
  FilterChipGroup,
  InlineKeyValueList,
  LogStream,
  Tabs,
} from '@theory-cloud/facetheory/vue/stitch-admin';

const tabs: TabItem[] = [{ key: 'catalog', label: 'Catalog', count: 12 }];
const filters: FilterChipConfig[] = [{ key: 'status', label: 'status: active' }];
const logs: LogEntry[] = [{ id: '1', timestamp: '09:42:12', level: 'info', message: 'Created demo-sandbox-01' }];
const status: StatusVariant = 'allow';
```

Why this is correct:
- Shared data contracts and semantic variants come from the framework-neutral `stitch-admin` and `stitch-shell` subpaths.
- Visual primitives come from the matching framework adapter path.
- The same conceptual primitives now exist across React, Vue, and Svelte, so porting a control-plane screen does not require redesigning the UI contract.
- For shells and page frames, `path` remains the source of truth for SSR-safe anchor navigation, while `onNavigate` is only an optional interception layer for hydrated routers.

**INCORRECT**

```ts
import { Tabs, LogStream } from '@theory-cloud/facetheory/react/stitch-admin';

type StatusVariant = 'active' | 'paused' | 'mystery';
```

Why this is incorrect:
- Pulling React primitives into a Vue or Svelte host bypasses the adapter contract and breaks cross-framework parity.
- Re-declaring local tab/filter/log/status variants lets one application drift away from the shared Stitch surface.
- Ad hoc contracts make it harder to keep docs, tests, and framework adapters aligned in future changes.

## Pattern Selection Notes

- Prefer published package exports over private source imports.
- Keep AppTheory and TableTheory pinned to the documented GitHub release tarballs.
- If behavior is not explicit in source or tests, leave it out of the ingestible docs until the contract is confirmed.
