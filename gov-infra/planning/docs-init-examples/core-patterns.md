# FaceTheory Core Patterns

This example document is the target shape for `docs/core-patterns.md`.

## Canonical Patterns

### Pattern: Wire FaceTheory through AppTheory for Lambda Function URL streaming

**Problem:** You need a supported production entrypoint that preserves request normalization and streaming semantics.

**CORRECT**

```ts
import { createApp, createLambdaFunctionURLStreamingHandler } from '@theory-cloud/apptheory';
import { createFaceApp } from '@theory-cloud/facetheory';
import { createAppTheoryFaceHandler } from '@theory-cloud/facetheory/apptheory';

const faceApp = createFaceApp({ faces: [] });
const app = createApp();
const faceHandler = createAppTheoryFaceHandler({ app: faceApp });

app.get('/', faceHandler);
app.get('/{proxy+}', faceHandler);

export const handler = createLambdaFunctionURLStreamingHandler(app);
```

Why this is correct:
- Uses the documented adapter entrypoint (`ts/src/apptheory/index.ts`).
- Preserves request-id propagation and set-cookie normalization behavior.
- Matches repository examples and docs flow for Lambda URL deployment.

**INCORRECT**

```ts
// INCORRECT: bypasses FaceTheory/AppTheory adapters and invents a custom response shape
export const handler = async () => ({
  statusCode: 200,
  headers: { 'cache-control': 'public, max-age=31536000, immutable' },
  body: '<html>...</html>',
});
```

Why this is incorrect:
- Skips documented runtime contracts and can break cookies/headers/streaming semantics.
- Uses an immutable cache policy inappropriate for request-dependent SSR HTML.

---

### Pattern: Choose rendering mode by freshness requirements

**Problem:** You need to decide when to use `ssr`, `ssg`, or `isr` route modes.

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
- Aligns route behavior with the `FaceMode` contract in `ts/src/types.ts`.
- Enables static serving for SSG pages and controlled regeneration for ISR routes.

**INCORRECT**

```ts
// INCORRECT: uses ISR without documenting/provisioning required HTML + metadata stores
const app = createFaceApp({
  faces: [{ route: '/blog/{id}', mode: 'isr', render: async () => ({ html: '...' }) }],
});
```

Why this is incorrect:
- ISR correctness depends on HTML object storage and metadata/lease coordination.
- Can cause stale or inconsistent regeneration behavior in production.

## Pattern Selection Notes

- Prefer repository-exported interfaces from `ts/package.json` over private helper imports.
- Prefer deterministic, test-backed behavior (see `ts/test/unit/*.test.ts`) over undocumented shortcuts.
- If an adapter surface is unclear (for example exact Vue/Svelte helper names), keep a `TODO:` in docs rather than guessing.
