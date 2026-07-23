---
title: Troubleshooting
---

# FaceTheory Troubleshooting

Use this guide for recurring setup, build, and runtime failures that already have a verified diagnosis path.

## Quick Diagnosis

| Symptom                                                               | Likely cause                                                                                  | Where to look                                                            |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `npm ci` or scripts fail early                                        | Node.js is below the required baseline                                                        | `ts/package.json` (`engines.node: >=20`)                                 |
| `npm run ssg` exits with usage errors                                 | Missing or invalid CLI flags                                                                  | `docs/api-reference.md` and `ts/src/ssg-cli.ts`                          |
| SSG build fails during page generation                                | Network access was attempted without opting in                                                | `buildSsgSite()` and SSG fetch guard behavior                            |
| SSG build fails with dot-segment output errors                        | `generateStaticParams()` returned `.` / `..` path segments                                    | `ts/src/ssg.ts` path validation and route params                         |
| ISR route returns a deterministic 500 when tenant headers are present | Known tenant boundary headers reached ISR without an explicit tenant/cache partition          | `docs/migration-guide.md` and `ts/src/isr.ts` tenant guard behavior      |
| ISR object keys look duplicated                                       | `S3HtmlStore.keyPrefix` and `htmlPointerPrefix` repeat the same prefix                        | `docs/core-patterns.md` and `docs/cdk/aws-deployment.md`                 |
| React streaming misses late styles                                    | `styleStrategy: shell` was used where `all-ready` was needed                                  | `docs/core-patterns.md`                                                  |
| Strict-CSP route fails before returning HTML                          | The route emitted inline hydration, inline styles/scripts, raw head, or unsafe body attrs     | `FaceRenderResult.csp` and `docs/core-patterns.md`                       |
| Browser receives 404 or HTML for an SSR hydration sidecar             | `/_facetheory/ssr-data/...` was not routed to the same FaceApp/Lambda handler as the SSR page | `ssrHydrationSidecars` and Lambda URL routing                            |
| Browser logs hydration mismatch warnings after SSR                    | Client hydrate output differs from server HTML or hydration data was refetched/recomputed     | `@theory-cloud/facetheory/testing` and the affected adapter hydrate path |
| Form POST behind AppTheorySsrSite OAC returns 403 before Lambda       | Native browser form cannot provide `x-amz-content-sha256` for the Lambda URL OAC signing path | `startAwsOacFormTransport()` and `docs/core-patterns.md`                 |
| `facetheory doctor` reports install failures                         | Node, peer package, or AppTheory/TableTheory override drift in the local app                  | `facetheory doctor` output and the fixes below                           |

## Issue: `facetheory doctor` Reports Install Failures

Symptoms:

- `facetheory doctor` exits non-zero
- output includes `[fail]` rows for Node.js, adapter peers, Svelte, or AppTheory/TableTheory overrides

Cause:

- the local app is not on the Node.js floor declared by the installed FaceTheory package `engines.node`
- or the selected adapter peer set is incomplete / outside the FaceTheory peer ranges
- or the app declares AppTheory and TableTheory tarballs but the npm `overrides` block does not force AppTheory to the same TableTheory tarball

Solution:

```bash
npx facetheory doctor
```

Apply each printed `Fix:` line. Common fixes are:

```bash
# Node floor: switch to the version range printed from FaceTheory's package engines.
node --version

# React peer set
npm install react react-dom

# Vue peer set
npm install vue @vue/server-renderer

# Svelte peer set; FaceTheory requires Svelte >=5.55.7 (Svelte 4 and 5.46.0-5.55.6 unsupported).
npm install svelte@^5.55.7
```

For AppTheory/TableTheory alignment, make the app's `package.json` use the same TableTheory GitHub Release tarball in both places:

```json
{
  "dependencies": {
    "@theory-cloud/apptheory": "https://github.com/theory-cloud/AppTheory/releases/download/v1.17.1/theory-cloud-apptheory-1.17.1.tgz",
    "@theory-cloud/tabletheory-ts": "https://github.com/theory-cloud/TableTheory/releases/download/v2.0.4/theory-cloud-tabletheory-ts-2.0.4.tgz"
  },
  "overrides": {
    "@theory-cloud/apptheory": {
      "@theory-cloud/tabletheory-ts": "https://github.com/theory-cloud/TableTheory/releases/download/v2.0.4/theory-cloud-tabletheory-ts-2.0.4.tgz"
    }
  }
}
```

Verification:

- `facetheory doctor` exits zero and prints `FaceTheory doctor passed.`
- `npm run check` still passes in the app

## Issue: Node.js Version Mismatch

Symptoms:

- `npm ci` warns or fails on engines
- local scripts fail before tests complete

Cause:

- FaceTheory requires Node.js `>=20`.

Solution:

```bash
node --version

# switch to a supported version, then rerun:
cd ts
npm ci
npm run typecheck
npm test
```

Verification:

- `npm run typecheck` passes
- `npm test` passes

## Issue: Browser Logs Hydration Mismatch Warnings

Symptoms:

- React reports hydration failed, Vue remounts over server DOM, or Svelte claim/hydration warnings appear in the browser console
- server-rendered HTML looks correct before hydration but changes during the first client boot
- style tags, head tags, IDs, dates, random values, or fetched data differ between server and client

Cause:

- the Face rendered non-deterministic output, or the client bootstrap hydrated with data that was not the exact data used during the server render
- common sources are `Date.now()`, `new Date()`, `Math.random()`, generated IDs, direct `window`/`document` reads during render, locale/time-zone formatting, direct head-tag emission, missing style extraction, or a client-side refetch during hydration

Solution:

- move head tags through FaceTheory's head primitive and framework style extraction path
- serialize server-loaded data into FaceTheory hydration data or strict external sidecars and load it before hydrate
- keep browser-only reads inside client-only effects/hooks rather than render functions
- add a consumer test with `@theory-cloud/facetheory/testing`:

```ts
import {
  assertHydrationEquivalent,
  renderFace,
} from "@theory-cloud/facetheory/testing";

const rendered = await renderFace(face, { path: "/checkout" });

await assertHydrationEquivalent({
  html: rendered.html,
  selector: "#root",
  hydrate: async ({ document }) => {
    // call the same hydrate primitive used by the app's client bootstrap
  },
});
```

Verification:

- the hydration-equivalence test passes without console mismatch messages
- repeated SSR renders for the same request produce byte-identical HTML for deterministic inputs
- strict-CSP routes fetch same-origin external hydration JSON before hydrate and do not recompute server-only data on the client

## Issue: SSR Hydration Sidecar URL Returns 404 or HTML

Symptoms:

- SSR HTML contains `<link rel="facetheory-hydration" href="/_facetheory/ssr-data/...">`
- the browser fetch for that exact URL returns `404`
- or the fetch returns an HTML document instead of `application/json`

Cause:

- FaceTheory SSR runtime sidecars use the reserved `/_facetheory/ssr-data/...` prefix.
- That prefix must reach the same Lambda/FaceApp handler that rendered the SSR HTML so the framework-owned resource route can read the stored render-time hydration payload.
- Do not route this prefix to S3/static SSG sidecar handling such as `/_facetheory/data/...`.

Solution:

- Keep SSR page requests and `/_facetheory/ssr-data/...` requests on the same Lambda URL / FaceApp handling path.
- Reserve S3/static handling for build-time SSG assets and sidecars.

Verification:

- a request for the emitted sidecar URL returns `content-type: application/json; charset=utf-8`
- the response includes `cache-control: no-store`
- the response body is raw JSON and not a rendered HTML document

## Issue: `npm run ssg` Fails With Argument Errors

Symptoms:

- `both --entry and --out are required`
- `invalid value for --trailing-slash`
- `unknown argument: ...`

Cause:

- The repository CLI wrapper only accepts the documented flag set.

Solution:

```bash
cd ts
npm run ssg -- --entry ./examples/ssg-basic/faces.ts --out ./tmp-ssg --trailing-slash always
```

Verification:

- The command prints `SSG complete: ...`
- Output files are written into `./tmp-ssg`

## Issue: SSG Build Fails Because `fetch()` Is Blocked

Symptoms:

- SSG route generation throws when page code tries to call the network

Cause:

- `buildSsgSite()` disables real network access by default.

Solution:

- Prefer injecting a mocked `fetch` in programmatic builds
- Or allow real network access explicitly when that is intentional:

```bash
cd ts
npm run ssg -- --entry ./examples/ssg-basic/faces.ts --out ./tmp-ssg --allow-network
```

Verification:

- The build completes without the network guard error

## Issue: SSG Build Fails With Dot-Segment Output Paths

Symptoms:

- `buildSsgSite()` throws about prohibited dot-segments
- a dynamic SSG route uses values such as `.` or `..`

Cause:

- `generateStaticParams()` returned path data that would collapse or escape the SSG output tree.

Solution:

- return only normal route segments from `generateStaticParams()`
- for catch-all routes, keep every segment inside the intended route subtree instead of using `.` / `..`

Verification:

- rerun the SSG build
- confirm the build succeeds and output files remain under the configured `outDir`

## Issue: ISR Fails Closed When Tenant Headers Are Present

Symptoms:

- an ISR route that previously rendered now returns a deterministic server error
- the request includes a tenant-like header such as `x-tenant-id` or `x-facetheory-tenant`
- the response does not include normal `x-facetheory-isr: miss|hit|wait-hit|stale` transitions
- expected ISR metadata or HTML objects are not written for that request

Cause:

- FaceTheory detected a tenant boundary signal on an ISR route that has neither an explicit `tenantKey` nor a custom
  `cacheKey`. The runtime fails closed before cache lookup, regeneration lease acquisition, metadata writes, or HTML
  writes so tenant-specific HTML cannot fall into the shared default cache partition.

Solution:

- If the route is actually tenant-invariant, strip viewer-supplied tenant-like headers at the CloudFront/AppTheory
  boundary before FaceTheory handles the request.
- If the route renders tenant-varying or personalized HTML, keep it as `mode: 'ssr'` unless the HTML is safe to cache
  independently for each partition.
- If tenant-varying ISR is intentional, configure `tenantKey: tenantKeyFromTrustedHeader('x-tenant-id')` only after a
  trusted boundary strips viewer-supplied values and injects trusted tenant context, or provide a custom `cacheKey`
  that includes every request-varying dimension that changes the rendered HTML.

Verification:

- tenant-invariant ISR reaches normal `x-facetheory-isr` states once tenant-like headers are removed
- an unpartitioned ISR request with tenant-like headers still fails closed and leaves no ISR cache writes behind
- explicitly partitioned tenant ISR returns separate cache entries for tenant A and tenant B

## Issue: ISR HTML Keys Are Duplicated

Symptoms:

- S3 object keys look like `prefix/prefix/...`
- ISR misses expected cached HTML objects

Cause:

- `S3HtmlStore.keyPrefix` and `htmlPointerPrefix` were configured with the same non-empty value.

Solution:

- Keep one prefix physical and the other logical, or leave one empty
- Re-run a known ISR route and inspect the written object keys

Verification:

- Repeated requests hit the same expected S3 object path
- Response headers show stable `x-facetheory-isr` transitions

## Issue: Mutating Form POST Behind OAC Returns 403 Before Lambda

Symptoms:

- a same-origin HTML form POST through an AppTheorySsrSite CloudFront distribution returns `403`
- the response mentions `InvalidSignatureException` or the request never reaches the AppTheory/FaceTheory Lambda logs
- the affected route works when called by a tool that can set AWS signing payload headers

Cause:

- AppTheorySsrSite's Lambda Function URL origin is protected by CloudFront Lambda URL OAC and `AWS_IAM`.
- Mutating requests such as `POST`, `PUT`, `PATCH`, and `DELETE` need the `x-amz-content-sha256` header so CloudFront can sign the exact payload bytes.
- Native browser forms cannot add that header, and direct Lambda Function URL form actions bypass the supported CloudFront/AppTheory path.

Solution:

```html
<form action="/agents/new" method="post" data-facetheory-oac-form>
  <input name="agentName" required />
  <button name="intent" value="create">Create agent</button>
</form>
```

```ts
import { startAwsOacFormTransport } from "@theory-cloud/facetheory";

startAwsOacFormTransport();
```

Keep the action same-origin. The helper computes the SHA256 digest over the exact URL-encoded bytes it sends, adds `x-amz-content-sha256`, and uses `credentials: 'same-origin'`.

Navigation behavior:

- the mutating fetch forces `redirect: "error"`, so HTTP redirects fail closed before a 307/308 can replay the URL-encoded body to another origin
- server-rendered HTML validation/error responses may replace the whole document when they are not protected by response CSP headers
- HTML responses with `Content-Security-Policy` headers fail closed for fetched document replacement and explicit SPA DOM navigation because fetched response headers cannot become the active document policy
- marked forms that resolve to `multipart/form-data`, `text/plain`, or another unsupported encoding fail closed through `onError` before sending
- use `navigationPolicy: "full-page"`, `onNavigate(context)`, or `onResponse(response, context)` when a host intentionally coordinates CSP-protected responses, post-submit redirects to safe GET URLs, `startFaceNavigation()`, or another caller-owned navigation layer

Verification:

- the request reaches the AppTheory/FaceTheory handler instead of failing at CloudFront/Lambda URL auth
- request headers include `x-amz-content-sha256` and `content-type: application/x-www-form-urlencoded;charset=UTF-8`
- marked multipart or text/plain forms do not send a request and surface through `onError`
- redirects fail before body replay, and validation responses either stay same-origin with full-document outcomes or fail closed when response CSP cannot be preserved

Release handoff:

- validate the FaceTheory RC from its GitHub Release tarball in the consuming app rather than from a workspace link
- verify the same-origin action path is routed through AppTheory/CloudFront to Lambda, not S3 or a direct Function URL
- confirm Lambda receives the request with `AWS_IAM` + CloudFront OAC still enabled
- confirm any app-local workaround or disabled-form path is removed only after the helper succeeds in the deployed
  CloudFront flow
- for the original theory-mcp-server lab driver, validate `POST /agents/new` through CloudFront OAC before stable
  promotion
- if emergency rollback is needed, pin the previous FaceTheory tarball or remove the opt-in marker/bootstrap; do not
  keep `ssrUrlAuthType: NONE` as a durable solution

## Issue: Strict-CSP Route Fails Before Returning HTML

Symptoms:

- a route with `csp: { inlineScripts: false, inlineStyles: false, rawHead: false }` returns a deterministic server error
- the error mentions strict CSP rejecting inline script tags, inline style tags, raw head output, event handler
  attributes, style attributes, or non-external hydration
- a React streaming route errors when `styleStrategy: "shell"` is used
- a Svelte strict route errors after adding `<svelte:head>` or component `<style>` output

Cause:

- Strict no-inline CSP is fail-closed. FaceTheory validates structured head output, adapter contributions, and the final
  rendered body before returning a strict document.
- Legacy `viteHydrationForEntry()` emits inline `__FACETHEORY_DATA__` and is incompatible with `inlineScripts:false`.
- React shell streaming can flush bytes before whole-document validation and is therefore rejected under strict
  `inlineScripts:false`.
- Adapter style extraction that emits `<style>` tags, including Emotion/AntD inline extraction, is incompatible with
  `inlineStyles:false`.

Solution:

- Move hydration data to `externalHydrationForEntry(...)` and serve the JSON from a same-origin URL.
- Attach an explicit CSP header such as `buildStrictCspHeader()` from the Face response.
- Move CSS into the Vite client entry so `viteAssetsForEntry()` emits external stylesheet links.
- Replace raw head HTML and `<svelte:head>` strict output with structured FaceTheory `headTags`.
- For React streaming strict routes, use `styleStrategy: "all-ready"` or buffer the route so validation completes before
  bytes flush.

Verification:

```bash
cd ts
npm run example:vite:svelte:strict-csp:build
node --import tsx test/unit/strict-csp-harness.test.ts
node --import tsx test/unit/vite-strict-csp-svelte-example.test.ts
```

If this is an AWS or release handoff, treat the local commands as runtime evidence only. They do not prove a release was
published, a Simulacrum RC ran, or a CloudFront/S3/Lambda deployment is serving the route.

## Issue: Streaming HTML Ships Without Expected Late Styles

Symptoms:

- HTML renders, but styles from async boundaries are missing from `<head>`

Cause:

- React streaming was finalized at `shell` instead of `all-ready`.

Solution:

```ts
renderOptions: {
  styleStrategy: 'all-ready',
}
```

Verification:

- Re-run the affected route
- Confirm the expected style tags are present in server-rendered output

## Getting Help

- Add newly repeated incidents here with a verified fix and a verification step.
- If a behavior is not formally documented yet, keep it out of the canonical troubleshooting guidance until it is confirmed.
