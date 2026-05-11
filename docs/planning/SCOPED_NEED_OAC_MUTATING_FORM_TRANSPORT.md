# Scoped Need: OAC Mutating Form Transport

## Background

On May 11, 2026 the theory-mcp-server steward reported a lab control-plane regression in `https://control.lab.theorymcp.ai/agents/new`: the FaceTheory SSR page renders a browser HTML form, but submitting “Create agent” returns a CloudFront/AWS `InvalidSignatureException` before the request reaches Lambda. The app is deployed behind AppTheorySsrSite v1.4.0 with the intended fail-closed shape: Lambda Function URL `AuthType=AWS_IAM` plus CloudFront Lambda Function URL Origin Access Control (OAC). AWS requires mutating Lambda Function URL OAC requests, specifically POST/PUT payloads, to include `x-amz-content-sha256` computed over the exact request body bytes; native browser form submission cannot attach that header.

## Driver

TheoryMCP lab control plane, with reuse expected by other FaceTheory SSR control-plane surfaces deployed through AppTheorySsrSite with Lambda Function URL OAC. The immediate requester is the theory-mcp-server steward, who wants to avoid carrying a durable app-local workaround around FaceTheory.

## Problem

FaceTheory has a canonical AWS entrypoint story for SSR/SSG/ISR through AppTheorySsrSite, but it does not provide a canonical browser-side transport path for same-origin mutating forms behind Lambda Function URL OAC. Consumers can render a standard `<form method="post">`, but the browser cannot include the required payload hash header. The result is a request-path failure below the app: CloudFront forwards an unsigned mutating payload to a signed Lambda Function URL origin and Lambda rejects the request before FaceTheory, AppTheory route dispatch, Autheory validation, TableTheory persistence, or application validation can run.

This is a framework contract gap, not an AppTheory hardening bug. AppTheorySsrSite should continue to fail closed with `AWS_IAM` + OAC. FaceTheory should own the client-delivery helper that turns an SSR-rendered same-origin form into the exact hashed request AWS expects, without bypassing CloudFront or weakening Function URL auth.

## Render modes affected

Primarily SSR, with mode-agnostic client-delivery implications:

- **SSR:** primary target. Server-rendered forms that submit to same-origin SSR action routes need a framework-supported mutating transport path behind OAC.
- **SPA:** applicable when the initial deterministic shell installs the same helper and later UI interactions submit forms or form-equivalent payloads.
- **ISR:** only for pages that render forms while the action route itself remains dynamic/SSR. ISR cache identity and lease behavior are not changed.
- **SSG:** static pages can include forms, but mutating action routes must still be routed to Lambda/SSR and use the helper when deployed behind OAC.

## Adapters affected

Adapter-agnostic core browser helper and documentation. React, Vue, and Svelte consumers should all be able to opt into the same transport path without framework-specific semantics. Optional adapter examples may demonstrate usage, but the primitive belongs outside React/Vue/Svelte internals.

## Shape impact

Additive core capability inside the existing four-mode, three-adapter shape. This does not add a render mode, an adapter, a storage backend, or a non-AWS deployment target. The likely shape is a browser-safe helper exported from the framework core that can be called from a client bootstrap module to intercept marked same-origin mutating forms, serialize supported form controls into deterministic URL-encoded bytes, compute SHA256 over exactly those bytes, and send the request with `x-amz-content-sha256` through CloudFront.

## Determinism impact

Preserves server/client render determinism if implemented as an opt-in submit-time helper rather than render-time mutation. Server-rendered HTML remains the source of truth. The helper must not generate server-visible markup, IDs, timestamps, random values, or head/style tags during hydration. It operates only after a user submits a form, so it is transport behavior rather than a new rendering path.

There is a navigation-semantics risk: replacing the document with a fetched validation/error page or following redirects can drift from native browser navigation if handled ad hoc. The helper must document and test its chosen behavior rather than silently inventing an app-specific client router.

## AWS-first posture

Preserves and reinforces the AWS-first posture. The need exists specifically because CloudFront Lambda Function URL OAC and Lambda `AWS_IAM` auth require signed payload hashes for mutating methods. The helper should name the AWS header explicitly and treat it as AWS signing plumbing, not as generic app-level integrity or authentication. It must not introduce Vercel/Cloudflare/Netlify portability abstractions, direct Lambda Function URL calls, or an unauthenticated compatibility path.

## Success criteria

- FaceTheory exposes a canonical browser-side mutating form transport helper for same-origin forms behind AppTheorySsrSite Lambda Function URL OAC.
- The helper computes SHA256 over the exact `application/x-www-form-urlencoded` bytes it sends and includes the lowercase `x-amz-content-sha256` header with the hex digest.
- Requests use the same-origin CloudFront URL, include same-origin credentials, and fail closed for cross-origin actions.
- The helper preserves native form intent where practical: form `action`, `method`, successful controls, submitter overrides, validation-page responses, and redirect outcomes are handled by a documented deterministic policy.
- Unsupported multipart/file-upload forms fail clearly or are ignored with documented fallback behavior; FaceTheory does not pre-hash browser-generated multipart bodies whose exact boundary bytes it did not construct.
- The helper treats the payload hash as AWS transport plumbing only. Authentication, authorization, CSRF protection, idempotency, and business validation remain application concerns.
- Unit tests verify URL-encoded body construction, duplicate field ordering, submitter inclusion, header hash value, credentials mode, same-origin rejection, unsupported multipart behavior, and redirect/error-page policy.
- Documentation explains why native forms fail behind Lambda Function URL OAC, how to opt into the FaceTheory helper, how to route mutating paths through AppTheorySsrSite `ssrPathPatterns`, and why `ssrUrlAuthType: NONE` is only an explicitly authorized temporary rollback.
- At least one example or reference snippet shows an SSR control-plane form using the helper without hard-coding theory-mcp-server business logic.
- No TableTheory schema, ISR cache model, AppTheory construct bypass, or adapter-specific core import is introduced.

## Nearest existing surface

- `ts/src/spa.ts`: browser-side same-origin navigation helpers, allowed-origin checks, document snapshot/application utilities, and client bootstrap patterns.
- `ts/src/vite.ts`: deterministic client asset and hydration bootstrap helpers for installing browser modules.
- `ts/src/head.ts`: deterministic module-script emission through `FaceRenderResult.hydration` / head tags and CSP nonce handling.
- `@theory-cloud/facetheory/apptheory`: AppTheory request adapter path for AWS Lambda Function URL handling.
- `docs/AWS_DEPLOYMENT_SHAPE.md` and `docs/cdk/aws-deployment.md`: current AWS deployment guidance for AppTheorySsrSite, CloudFront, S3, and Lambda Function URL origins.
- `infra/apptheory-ssr-site/`: reference stack that already models explicit `AWS_IAM` Function URL auth and CloudFront delivery.

## Out of scope

- Weakening AppTheorySsrSite OAC, changing `ssrUrlAuthType` defaults, or documenting `NONE` as a durable solution.
- Calling direct Lambda Function URLs from the browser.
- Adding a public unauthenticated mutation path.
- Implementing application authentication, authorization, CSRF, idempotency, or business validation.
- Supporting arbitrary cross-origin form posts.
- Supporting browser-generated `multipart/form-data` in the first pass unless FaceTheory explicitly constructs the full multipart body and boundary bytes itself.
- Replacing FaceTheory SPA navigation or introducing a new client router.
- Changing ISR cache metadata, TableTheory lease records, or cache invalidation semantics.
- Adding React/Vue/Svelte-specific form semantics to the framework core.

## Open questions

- What should the helper be named and where should it live? Default recommendation: a core browser helper such as `startAwsOacFormTransport` or `startOacFormTransport`, exported from the root package beside SPA helpers, with the AWS/OAC intent explicit in docs.
- Which form marker should opt in? Default recommendation: require an explicit attribute such as `data-facetheory-oac-form` so FaceTheory does not globally intercept all forms.
- Which mutating methods should be supported in v1? Default recommendation: support native POST forms first, with documented method override support only when the helper constructs the actual request method and body.
- How should redirect navigation be preserved? Default recommendation: for redirect responses, navigate the browser to the final same-origin URL; for non-redirect HTML responses, replace the document with the returned HTML using a documented full-document path rather than partial DOM patching.
- Should multipart uploads be a separate scoped need? Default recommendation: yes, if theory-mcp-server or another consumer needs file uploads behind OAC; the first helper should fail clearly for browser-generated multipart rather than pretending it can hash unknown boundary bytes.
