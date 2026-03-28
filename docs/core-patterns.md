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

## Pattern Selection Notes

- Prefer published package exports over private source imports.
- Keep AppTheory and TableTheory pinned to the documented GitHub release tarballs.
- If behavior is not explicit in source or tests, leave it out of the ingestible docs until the contract is confirmed.
