# FaceTheory Architecture (planning)

This document describes the intended FaceTheory architecture for **AWS Lambda Function URL + response streaming** and
**per-app** framework selection (React/Vue/Svelte).

## Goals

- **Streaming SSR** (time-to-first-byte first): stream HTML as soon as possible when the adapter supports it.
- **Per-app framework adapter**: a FaceTheory app targets one UI framework at a time, but FaceTheory’s runtime contract is
  consistent across adapters.
- **SSR + SSG/ISR**: generate static HTML when possible; support incremental regeneration via cache + revalidation.
- **AWS-first**: Lambda Function URL for the dynamic origin; S3(+CloudFront) for static assets; DynamoDB (via TableTheory)
  for ISR metadata, locks, and other small state.

## Non-goals (v1)

- No API Gateway in the request path (use Lambda Function URL).
- No “islands” / mixed frameworks on a single page (plan as a later milestone).
- No requirement to store full HTML in DynamoDB (size limit); prefer S3 for bodies.

## Deployment shape (recommended)

Even without API Gateway, a production SSR site usually needs one domain for both SSR + assets.

Recommended “two-origin” setup:

```
Browser
  -> CloudFront (custom domain, caching, compression)
      -> S3 origin (immutable assets: /assets/*)
      -> Lambda Function URL origin (SSR: everything else)
```

Notes:
- CloudFront is optional for early development; Lambda Function URL can be hit directly.
- For ISR/SSG, CloudFront caching strategy is part of correctness (headers, invalidations, stale handling).

## Build outputs

FaceTheory’s build should produce three artifacts:

1) **Server bundle** (Lambda): an entrypoint that can stream responses.
2) **Client assets** (S3): JS/CSS/images; content-hashed filenames preferred.
3) **Asset manifest**: deterministic mapping from “entrypoints” to emitted assets.

The runtime uses the manifest to inject `<link rel="modulepreload">`, `<script type="module">`, `<link rel="stylesheet">`
and any preloads required by the chosen adapter.

## Runtime request flow

1) Lambda Function URL receives request event.
2) AppTheory normalizes request → `Request` (method/path/headers/query/body/cookies).
3) FaceTheory selects a `Face` route and runs:
   - `load(ctx)` (optional; fetch data)
   - `render(ctx, data)` (required; returns streaming or buffered HTML + head + hydration info)
4) FaceTheory writes a streaming or buffered HTML response via the Lambda streaming response writer.

Conceptually:

```
AppTheory route -> FaceTheory handler -> Adapter render -> HTML stream -> client
```

## Routing (including catch-all)

Two routing layers matter:

1) **Lambda Function URL** routes all paths to the same function (no API Gateway routing needed).
2) **AppTheory/FaceTheory** must still support patterns that can express:
   - static routes (`/about`)
   - params (`/users/{id}`)
   - catch-all (`/{rest+}`) for “app shell” style routing and framework routers

FaceTheory should treat catch-all as a first-class primitive and define precedence rules:

1) static segments
2) `{param}` segments
3) `{name+}` / `{name*}` catch-all segments (must be last)

FaceTheory supports the legacy API Gateway-style `/{proxy+}` / `/{proxy*}` syntax as an alias for `/{name+}` /
`/{name*}` (where `name === "proxy"`).

This is an AppTheory router wishlist item (see `docs/WISHLIST.md`).

## Streaming response model

FaceTheory wants a portable “response body can be a stream” contract, even if only the TypeScript runtime ships first.

Proposed model:

- **Buffered response**: body is a `Uint8Array` (works today in AppTheory).
- **Streaming response**: body is an `AsyncIterable<Uint8Array>` (or a callback that writes to a `WritableStream`-like sink).

Adapters choose one:
- React: stream when using React 18 streaming APIs.
- Vue/Svelte: stream when supported; otherwise buffer and emit once (still uses streaming path but with a single chunk).

## Face and Adapter contracts (sketch)

```ts
export type FaceMode = "ssr" | "ssg" | "isr";

export interface FaceModule {
  route: string; // e.g. "/about", "/blog/{rest+}"
  mode: FaceMode;

  // SSG/ISR hooks
  generateStaticParams?: () => Promise<Array<Record<string, string>>>;
  revalidateSeconds?: number; // ISR

  // SSR hooks
  load?: (ctx: FaceContext) => Promise<unknown>;
  render: (ctx: FaceContext, data: unknown) => Promise<FaceRenderResult> | FaceRenderResult;
}

export interface FaceRenderResult {
  status?: number;
  headers?: Record<string, string | string[]>;
  head?: { title?: string; meta?: Array<Record<string, string>>; links?: Array<Record<string, string>> };

  // Either:
  html: string | AsyncIterable<Uint8Array>;

  // For hydration:
  hydration?: { data: unknown; bootstrapModule: string };
}
```

This contract is intentionally framework-neutral; adapter-specific details live behind the adapter.

## SSG + ISR model (high level)

### Storage

- **S3** stores generated HTML bodies and (optionally) JSON payloads needed for hydration.
- **DynamoDB (TableTheory)** stores small metadata:
  - cache key → S3 object key
  - `generatedAt`, `revalidateSeconds`, `etag`
  - lock owner + lease for regeneration

Reasoning: DynamoDB item size is not a good fit for full HTML.

### Freshness semantics

- SSG: generated at build time; served from S3 directly (via CloudFront behavior).
- ISR:
  - if fresh: serve cached HTML
  - if stale: choose policy
    - “blocking”: regenerate in-request and update S3 + metadata
    - “stale-while-revalidate”: serve stale and trigger async regeneration (Lambda Invoke / EventBridge / SQS)

The v1 plan should start with **blocking ISR** (simpler correctness), then add SWR later.

## Observability and safety

- Prefer AppTheory’s request-id + observability hooks as the unified mechanism.
- Streaming needs explicit “finalize” semantics (status + headers must be known early; late failures should map to an
  error footer or a best-effort abort).

## Open questions (to resolve before MVP)

- Canonical asset manifest format (per-adapter differences).
- CloudFront caching rules for ISR (TTL, headers, invalidation strategy).
- How to represent “head” deterministically across adapters (title/meta/link/script ordering).
- What the “FaceTheory contract tests” look like (inspired by AppTheory/TableTheory fixture-backed contracts).
