# FaceTheory Troubleshooting

Use this guide for recurring setup, build, and runtime failures that already have a verified diagnosis path.

## Quick Diagnosis

| Symptom                                                               | Likely cause                                                                                  | Where to look                                                       |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `npm ci` or scripts fail early                                        | Node.js is below the required baseline                                                        | `ts/package.json` (`engines.node: >=24`)                            |
| `npm run ssg` exits with usage errors                                 | Missing or invalid CLI flags                                                                  | `docs/api-reference.md` and `ts/src/ssg-cli.ts`                     |
| SSG build fails during page generation                                | Network access was attempted without opting in                                                | `buildSsgSite()` and SSG fetch guard behavior                       |
| SSG build fails with dot-segment output errors                        | `generateStaticParams()` returned `.` / `..` path segments                                    | `ts/src/ssg.ts` path validation and route params                    |
| ISR route returns a deterministic 500 when tenant headers are present | Known tenant boundary headers reached ISR without an explicit tenant/cache partition          | `docs/migration-guide.md` and `ts/src/isr.ts` tenant guard behavior |
| ISR object keys look duplicated                                       | `S3HtmlStore.keyPrefix` and `htmlPointerPrefix` repeat the same prefix                        | `docs/core-patterns.md` and `docs/cdk/aws-deployment.md`            |
| React streaming misses late styles                                    | `styleStrategy: shell` was used where `all-ready` was needed                                  | `docs/core-patterns.md`                                             |
| Form POST behind AppTheorySsrSite OAC returns 403 before Lambda       | Native browser form cannot provide `x-amz-content-sha256` for the Lambda URL OAC signing path | `startAwsOacFormTransport()` and `docs/core-patterns.md`            |

## Issue: Node.js Version Mismatch

Symptoms:

- `npm ci` warns or fails on engines
- local scripts fail before tests complete

Cause:

- FaceTheory requires Node.js `>=24`.

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

- same-origin redirects navigate the browser to the final response URL
- cross-origin redirect targets fail closed and call `onError`
- server-rendered HTML validation/error responses replace the whole document
- marked forms that resolve to `multipart/form-data`, `text/plain`, or another unsupported encoding fail closed through `onError` before sending
- use `onNavigate(context)` only when a host intentionally coordinates the outcome with `startFaceNavigation()` or another caller-owned navigation layer

Verification:

- the request reaches the AppTheory/FaceTheory handler instead of failing at CloudFront/Lambda URL auth
- request headers include `x-amz-content-sha256` and `content-type: application/x-www-form-urlencoded;charset=UTF-8`
- marked multipart or text/plain forms do not send a request and surface through `onError`
- redirect and validation responses stay same-origin and produce full-document outcomes

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
