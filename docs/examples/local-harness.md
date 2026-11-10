---
title: Local examples harness
---

# Local examples harness

`make examples-local` builds every FaceTheory example, serves each Node-runtime
surface on its own port, invokes the handler-only examples in the Lambda runtime
image, and asserts the real HTTP or Lambda response. Nothing reaches AWS: the
harness removes inherited AWS and proxy variables, installs static dummy
credentials, and points every AWS endpoint at a loopback port it owns. The FT1
rows start no containers; the FT2 rows run real Lambda handlers and the SSR
site in the official, digest-pinned Lambda runtime image through the released
`apptheory-local` v7.1.0 and gateway; the FT3 rows start digest-pinned DynamoDB
Local and s3proxy, run the same examples with their real-storage stores, and
read the stored S3 objects and DynamoDB items back directly.

```bash
make examples-local                 # build, serve and assert every classified row
make examples-local ONLY=<row-id>   # build and assert one classified row
make examples-local-down            # stop processes this checkout's harness started
make examples-local-selftest        # prove the manifest, discovery and ledger rules
```

`make examples-local` runs `make ts-build`, so `ts/dist` matches the
checked-in sources, installs any missing `infra/*` dependencies, and then runs
the harness serially, row by row. Setting `ONLY` forwards the row id to the
harness's `--only`, after those same build and install steps.

## What the harness owns

| Piece                       | Where it lives                                                 |
| --------------------------- | -------------------------------------------------------------- |
| Harness                     | `scripts/local/run-examples-local.mjs`                         |
| Discovery and validation    | `scripts/local/lib/tree.mjs`, `scripts/local/lib/manifest.mjs` |
| HTTP runners and assertions | `scripts/local/lib/runners.mjs`                                |
| AppTheory runner control    | `scripts/local/lib/apptheory.mjs`                              |
| FT3 storage backends        | `scripts/local/lib/storage.mjs`                                |
| FT3 by-hand helper          | `scripts/local/isr-storage.mjs`                                |
| Process, state and cleanup  | `scripts/local/lib/runtime.mjs`                                |
| Classification manifest     | `scripts/local/examples-local.json`                            |
| Pending-producer ledger     | `scripts/local/examples-local-ledger.json`                     |
| Runner image/backend pins   | `scripts/local/apptheory-local-profile.json`                   |
| Self-tests                  | `scripts/local/test-examples-local.mjs`                        |
| CI job                      | `.github/workflows/examples-local.yml`                         |

## Requirements

- Node.js 24 or newer and npm.
- `cd ts && npm ci` once per checkout, to install the example dependencies.
- The two `infra/*` stacks need their own dependencies. `make examples-local`
  installs them with `npm ci --ignore-scripts` when `node_modules` is absent; a
  direct harness invocation fails with a named prerequisite error instead.
- Go 1.27.3 or newer, to install the released `apptheory-local` for the FT2
  rows. The version is pinned in `scripts/local/examples-local.json`
  (`profile.apptheoryRunner`) as `v7.1.0`, and the repository's `.go-version`
  supplies the toolchain.
- No AppTheory or TableTheory checkout. The harness runs
  `go install github.com/theory-cloud/apptheory/v7/cmd/apptheory-local@v7.1.0`
  with `GOBIN` pointed at its own cache, verifies the installed command with
  `go version -m`, and fails closed unless it reports the pinned module and
  version. The install path and flags are the ones AppTheory documents in
  `docs/examples/local-runner.md` ("Install the command").
- Docker (on macOS, colima) with the daemon running, for the FT2 and FT3 rows.
  The FT2 runner starts one private network per row and serves the Function URL
  and CloudFront listeners on `127.0.0.1` only. The FT3 rows start this
  checkout's `ad3-` prefixed DynamoDB Local and s3proxy containers on the
  reserved `8250`/`8251` ports, and the SSG+ISR gateway row starts both
  backends inside the runner's own private network. Every image is pinned by
  digest in `scripts/local/examples-local.json` or
  `scripts/local/apptheory-local-profile.json`.
- The SSR stack's own CDK CLI is a dev dependency (`aws-cdk`), because the
  runner synthesizes `infra/apptheory-ssr-site` with the app's
  `node_modules/.bin/cdk`.

The harness sets its own runtime environment. It does not need an AWS profile,
AWS credentials, or an operator-set endpoint variable.

## Ports

The harness reserves `8210-8259`:

| Range                       | Use                                                                                                                                                                                                   |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `8210-8249`                 | one deterministic port per serving example row (the SSR gateway row uses `8240`, the SSG+ISR gateway row `8246`, the five real-storage rows `8241-8245`)                                              |
| `8250-8251`                 | the FT3 example rows' DynamoDB Local and s3proxy host ports                                                                                                                                           |
| `8252-8259`                 | reserved for FT3 storage backends; no row may use them                                                                                                                                                |
| `8000`, `8123`, `8130-8199` | reserved away from this harness: the shared default, 8123 to match AppTheory's harness convention (TableTheory publishes DynamoDB Local on an ephemeral loopback port), and AppTheory's harness range |
| `8299`                      | the harness's dummy AWS endpoint; preflight fails if it is in use                                                                                                                                     |

The manifest validation fails when a row's port is outside `8210-8259`, collides
with another row, or falls in a reserved range. The preflight also fails when a
serving port is already in use, and the harness holds an exclusive lock for the
checkout so two runs cannot meet on the same ports.

The two gateway rows pass their row port as the runner's `--port-base` and then
send viewer requests to the CloudFront listener the runner reports in its log;
they do not assume a listener order. Since `apptheory-local` v7.1.0 the Function
URL takes the port base and CloudFront the next port, and the `AWS_IAM` Function
URL refuses unsigned viewer requests, so the gateway signs the origin request
locally.

## Classes and gaps

Every row declares one class:

- **L1** — the example runs fully locally and its HTTP assertions pass.
- **L2** — the example runs locally with an emulator; its fidelity limits are
  recorded in the row's gap.
- **L3** — the locally executable part runs, and the row names the cloud
  capability that cannot be exercised locally.
- **I** — infrastructure-only: the CDK stack is synthesized and its snapshot is
  asserted; there is no runtime row.

An L2, L3 or I row must name its gap or fidelity limit in the manifest. An L1 row
must not declare one. There are no L3 rows: the two former L3 Lambda Function
URL streaming rows moved to L2 when the released runner began forwarding each
streamed chunk, leaving only the managed Function URL edge, a docs/125 true
limit.

The manifest has no pending rows. The three FT2 rows and the SSG+ISR gateway row
run through the released `apptheory-local` v7.1.0 pinned in the manifest; the
five FT3 example rows run on the FT3 storage backends. No row executes against a
sibling checkout, and the ledger is empty. A `pending` row would still be listed
and counted separately, never as passing, and only a ledger entry for that
pending row could make it non-failing.

## Discovery and the manifest

The harness derives the example surface from the tree:

- every directory under `ts/examples/` is an example and must be classified;
- every top-level `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.mjs`, `.cjs` and
  `.svelte` file in an example directory is an entrypoint, except `*.d.ts` and
  test files;
- every directory under `infra/` that contains a `package.json` is a stack and
  must be classified.

An unmanifested example directory, an unmanifested entrypoint, a manifest row
whose file does not exist, a duplicate port, an unknown runner, a skip field, or
a pending row without a gap fails the run. The self-tests build throwaway trees
and pin these rules. `src/` files are the example's application code compiled by
its own build command, not separate harness entrypoints.

## The pending-producer ledger

`scripts/local/examples-local-ledger.json` records rows that cannot run because
they need an unreleased producer. It is empty: the AppTheory v7.1.0 release
contains every capability the former `record` entries named, so the four rows
(`lambda-url-streaming#serve`, `apptheory-lambda-url-streaming#serve`,
`infra/apptheory-ssr-site#local-run` and `infra/apptheory-ssg-isr-site#local-run`)
now run against the released pin and their entries are deleted.

A `pending` row would still have to be named here with its capability, owner and
release-cycle resolution; an unmatched pending row or a stale entry fails with a
named error. The harness has no producer-ancestry check and no git dependency:
the released-version gate in `lib/apptheory.mjs` is the replacement, and it
fails closed unless `go version -m` reports the exact pinned module and release
tag.

The five FT3 example rows (`isr-blocking#real-storage`,
`react-isr#real-storage` and the three `vite-strict-csp-*#real-storage` rows)
have no ledger entry. They run the example's own Node server against the FT3
storage backends; they do not consume a producer capability.

## What the rows verify

The serving rows build and serve the example's own code, then assert status,
content type and body content. The assertions include:

- rendered markup and hydration data (`__FACETHEORY_DATA__`, external sidecars,
  module preloads and stylesheet tags);
- actual chunk boundaries for the React and Vue streaming examples: the document
  head arrives before the body, and the buffered React example arrives as one
  complete body;
- incremental delivery for the two Lambda Function URL rows and the SSR gateway
  row: a first chunk carries the document start while the handler is still
  running, the document end appears only in a later chunk, and a fully buffered
  response fails the same assertion (the harness self-test is the negative
  control). Lambda streams a response "as your function generates it" once the
  runtime sends a chunked body
  ([response streaming](https://docs.aws.amazon.com/lambda/latest/dg/configuration-response-streaming.html));
- CloudFront caching for the two infra rows: a cacheable object misses then hits
  with `x-cache: Hit from cloudfront` and an `age`, a `CACHING_DISABLED` or
  `s-maxage=0` path reaches the origin every time, and an invalidation through
  the local CloudFront API turns a hit back into a miss. CloudFront documents the
  `x-cache`/`age` signal on
  [response headers](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/response-headers.html),
  the cache-policy TTL rules on
  [Expiration](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Expiration.html)
  and the API on
  [CreateInvalidation](https://docs.aws.amazon.com/CloudFront/latest/APIReference/API_CreateInvalidation.html);
- the strict-CSP header without `unsafe-inline` or `unsafe-eval`, no inline
  `<script>` or `<style>`, external assets, and the `no-store` hydration sidecar;
- the control-plane preset's four relaxed/strict and client-fill/streaming
  variants, including the client-fill section endpoint and the bootstrap `HEAD`
  response;
- ISR miss/hit headers and identical cached bytes for the in-memory
  `isr-blocking` and `react-isr` rows;
- for the five real-storage rows, the same miss/generation/hit behaviour read
  back from the emulated S3 bucket and DynamoDB table, including the model's
  `ttl` attribute, a real lease, the `invalidate()` refusal and a lease held by
  another writer;
- an error or refusal path for every row that has one, usually a 404; the
  SSG row also asserts the generated `404.html` content and the missing-route
  status.

`control-plane-host-owned-contracts` keeps its host-contract stubs: a host-owned
gate and bounded section read are the subject of the example. The row asserts
that FaceTheory renders the shell and the section data through the real
control-plane pipeline, and it does not add an identity bypass. FaceTheory does
not own that auth; there is no real auth implementation in this example to use
instead.

The Vite dev row runs the documented `npm run dev` from
`ts/examples/vite-ssr-react/` and asserts the Vite middleware response, so the
`facetheory-dev` resolution is covered by the harness.

The FT2 rows are described in the next section: two handler-only examples run in
the official Lambda Node image, and the SSR stack runs through the local
CloudFront gateway with its real generated CloudFront Functions.

## The FT2 rows: real Lambda handlers and the local gateway

The three FT2 rows do not start a Node server. They run the examples' real
handlers in the official AWS Lambda Node runtime image through the released
`apptheory-local` v7.1.0.

### Installing and verifying the released runner

For a row whose runner is in `FT2_RUNNERS`, the harness:

1. reads `profile.apptheoryRunner` from the committed manifest
   (`github.com/theory-cloud/apptheory/v7/cmd/apptheory-local` at `v7.1.0`);
2. installs it with
   `go install github.com/theory-cloud/apptheory/v7/cmd/apptheory-local@v7.1.0`
   and `GOBIN=~/.cache/facetheory-examples-local/apptheory-local/v7.1.0/bin`;
3. runs `go version -m` on the installed binary and fails closed unless the
   `path` is the pinned command and the `mod` line is the pinned module at the
   pinned version.

The binary and the example bundles live under the harness cache, never in git.
Nothing is installed into `ts/`, and no `file:` dependency, override, vendored
binary or floating ref is committed. `node scripts/local/run-examples-local.mjs
--install-runner` performs the same install and verification without starting a
row; CI uses it, and `make examples-local` re-verifies before each FT2 row. A
missing Go toolchain, a failed install or a version mismatch fails the row by
name instead of skipping it. No AppTheory checkout is read.

Runtime images come from `scripts/local/apptheory-local-profile.json`, which
pins the official images by digest:

- `public.ecr.aws/lambda/nodejs:24@sha256:8466f1…` for both handler rows and
  the SSR function;
- `public.ecr.aws/lambda/python:3.14@sha256:51985f…` for the runner's preflight;
- `andrewgaul/s3proxy@sha256:1f8915…` for the gateway's S3 origin.

### Handler-only rows

`ts/examples/lambda-url-streaming` and
`ts/examples/apptheory-lambda-url-streaming` ship a handler but no CDK
definition. The harness bundles each example's own `handler.ts` with esbuild,
resolving `@theory-cloud/facetheory` to this checkout's `ts/dist` exactly as the
example's Node self-reference does. It then starts one warm container:

```bash
apptheory-local invoke --handler-dir <bundle> --runtime nodejs24.x \
  --handler index.handler --profile scripts/local/apptheory-local-profile.json \
  --name-prefix ad3-<row> --stdio --stream-chunks
```

and sends Function URL payload 2.0 events with the producer's Function URL shape
(`routeKey: "$default"`, `requestContext.routeKey` and `.stage` of `$default`,
and a `.lambda-url.us-east-1.on.aws` domain). The `awslambda` global and
`awslambda.streamifyResponse` come from the runtime image; the harness never
injects a shim. Both rows assert the complete root body, the complete catch-all
body and the response headers; the direct row also asserts that the handler
echoes the event's request id, and the AppTheory row asserts the example's 405
refusal for a `POST` (with `allow: GET, HEAD`). The direct example has no
refusal path — its catch-all answers the `POST` too — and the row reports that.

**Streaming is incremental.** The warm session starts with `--stream-chunks`, so
the runner writes one `{"event":"chunk",…}` line per streamed response chunk
before the result line. Both rows prove that a first chunk carrying the document
start was observed while the handler was still running, that the document end
appears only in a later chunk, and that the first chunk arrived before the
result line. A buffered response produces no chunk event and fails the
assertion; the harness self-test uses exactly that buffered shape as its
negative control. Both rows are class L2. The managed Function URL edge (TLS,
auth, the edge network) is a docs/125 true limit and is the only named gap.
Lambda streams "as your function generates it" once the runtime sends a chunked
body
([response streaming](https://docs.aws.amazon.com/lambda/latest/dg/configuration-response-streaming.html)).

### The SSR site through the gateway

`infra/apptheory-ssr-site` is served with the stack's own CDK definition:

```bash
apptheory-local run --app infra/apptheory-ssr-site \
  --profile scripts/local/apptheory-local-profile.json --backend s3proxy \
  --port-base 8240
```

The runner synthesizes the stack with the app's `node_modules/.bin/cdk`, starts
the SSR function in the Node image, provisions the stack's buckets and bucket
deployments in s3proxy, and serves the synthesized CloudFront distribution on
`http://127.0.0.1:8240`. The gateway selects the cache behavior, runs the exact
generated viewer-request and viewer-response CloudFront Functions, applies the
origin request and response headers policies, and invokes the `AWS_IAM`
Function URL origin through the runner's signed local path.

Through the gateway the row asserts:

- the SSR HTML from the Function URL origin, including the document title, the
  real FaceTheory-rendered body, the stylesheet and module-script tags, the
  handler's `cache-control: private, no-store`, and the edge policy headers
  (`x-frame-options`, `x-content-type-options`, `referrer-policy`,
  `strict-transport-security`);
- the viewer-request function's `x-request-id` passthrough (a request header is
  echoed on the response, on a cache miss and on a hit);
- `/assets/entry.css` from the S3 origin with `content-type: text/css`, the
  immutable cache-control metadata and bytes equal to the deployed source;
- the Vite manifest at `/.vite/manifest.json` and the SSG data path at
  `/_facetheory/data/index.json`, with their content types, cache-control
  metadata and deployed bytes;
- a missing asset (`/assets/missing.css`) as the 403 `AccessDenied` the OAC S3
  origin produces when it has no `s3:ListBucket`, and a missing SSR route as the
  handler's 404 page;
- real CloudFront caching: `/assets/entry.css` is a miss on its first request,
  a `x-cache: Hit from cloudfront` with an `age` on the second, a miss again
  after an invalidation through the local CloudFront API, and a hit when it is
  fetched again. The `/` behavior is `CACHING_DISABLED`, so every request is a
  miss and reaches the origin; two requests carry distinct request ids and each
  is echoed, which only the origin can produce;
- incremental streaming through the gateway: a raw HTTP request shows
  `transfer-encoding: chunked`, the first chunk carries the document start and
  not `</html>`, and the complete body carries the document end.

The row is class L2. Named gaps: the edge network and TLS (a docs/125 true
limit), IAM policy evaluation (the `AWS_IAM` Function URL request is signed
locally but its policy is not evaluated), S3 bucket policies and CORS, and
viewer protocol enforcement. The stack configures no `CustomErrorResponses`, so
there is no custom error page to assert; the origin 403 and the handler 404 are
the behaviours the distribution exposes.

Both the manifest and the SSG data deployments write at the bucket root, so they
must not prune: a root prune would delete the other deployment's objects. The
stack sets `prune: false` on those two deployments and the snapshot test pins
it; the prefix-scoped assets deployment still prunes stale assets.

## The FT3 rows: real local storage

The five `#real-storage` example rows run the example's own Node server with the
same environment names a deployed `AppTheorySsrSite` sets:

| Variable                      | Use                                                   |
| ----------------------------- | ----------------------------------------------------- |
| `FACETHEORY_ISR_BUCKET`       | S3 bucket for rendered HTML and SSR sidecars          |
| `FACETHEORY_ISR_PREFIX`       | optional S3 key prefix                                |
| `FACETHEORY_CACHE_TABLE_NAME` | TableTheory ISR metadata and lease table              |
| `APPTHEORY_CACHE_TABLE_NAME`  | alias for the cache table name                        |
| `AWS_ENDPOINT_URL_S3`         | the standard SDK endpoint override for s3proxy        |
| `AWS_ENDPOINT_URL_DYNAMODB`   | the standard SDK endpoint override for DynamoDB Local |

The in-memory stores remain the default: with none of those names set, the
example behaves exactly as its unit tests expect. Setting only the bucket or
only the table fails closed instead of silently reverting to memory. The seam is
`ts/examples/local-storage.ts`; nothing in `ts/src` changed.

`scripts/local/examples-local.json`'s `profile.storage` pins the two backends by
digest: `amazon/dynamodb-local@sha256:7ef4a2…` on `8250` and
`andrewgaul/s3proxy@sha256:1f8915…` on `8251`. The harness starts one pair per
checkout, named `ad3-<checkout-id>-dynamodb-local`, `ad3-<checkout-id>-s3proxy`
and `ad3-<checkout-id>-net`, labelled with the checkout id. It creates one
bucket (`ad3-<row-slug>`) and one table (`ad3-<row-slug>-facetheory-cache`) per
row, so a row's assertions cannot see another row's objects.

The table is not hand-written: the harness derives its key schema and TTL
attribute from TableTheory's `defineFaceTheoryCacheMetadataModel` and
`defineFaceTheoryCacheLeaseModel`. The SSG+ISR stack test compares the
synthesized `CacheTable` against those same models, so the local provisioner and
the deployed stack cannot drift. The table uses `pk` (string) and `sk` (string)
as its keys and enables TTL on the model's `ttl` attribute.

The two ISR rows (`isr-blocking#real-storage`, `react-isr#real-storage`) assert:

- the first `/news/home` request is a miss that generates, and the second is a
  hit with identical bytes;
- the metadata item at `CACHE#default::/news/{slug}?slug=home` has `sk=META`,
  an `s3_key` pointer, `generated_at`, `revalidate_seconds=30` and an `etag`;
- the S3 object at `<prefix>/<s3_key>` holds the exact response bytes, the
  `text/html` content type and the `facetheory-status` / `facetheory-content-type`
  metadata; its ETag equals the metadata item's `etag`;
- the table's TTL is enabled on `ttl`; a committed generation leaves no `LOCK`
  item;
- a real lease acquired through the TableTheory adapter stores `lease_token`,
  `lease_expires_at` and a `ttl` at or after expiry, and releasing it removes the
  item;
- a lease held by another writer makes the next generation wait and return the
  framework's 500 refusal; after release the route regenerates and hits again;
- `invalidate()` still throws `IsrInvalidateUnsupportedError` and leaves storage
  untouched.

The three strict-CSP rows (`vite-strict-csp-{react,svelte,vue}#real-storage`)
use the same S3 store for the SSR hydration sidecar. Each row asserts two page
renders write two sidecar objects with identical payload bytes, the sidecar URL
serves the stored bytes with `no-store`, and the S3 object carries the
`ssr-hydration-sidecar` kind, body digest and expiry metadata. The sidecar store
has no metadata or lease model, so these rows write no DynamoDB item and assert
the shared table stays empty; the harness still constructs the TableTheory store
from the same environment, and the ISR rows exercise it.

The SSG+ISR row (`infra/apptheory-ssg-isr-site#local-run`) runs the stack
through `apptheory-local` with `--backend dynamodb --backend s3proxy`. Through
the gateway it asserts the pre-rendered `index.html` and `ssg-demo/index.html`
bytes from S3 (no `x-facetheory-ssr` marker), the deployed CSS, Vite manifest
and SSG data bytes with their cache-control metadata, the ISR miss → generation
→ hit on `/isr-demo`, the stored ISR object under the `isr/` prefix and the
metadata item in the runner-created table, the table's TTL, a real lease,
`invalidate()`'s refusal, the 403 `AccessDenied` missing asset, the handler's
404 page and the edge policy headers.

Its CloudFront caching assertions are: the SSG HTML (served from S3 with
`public,max-age=0,s-maxage=600`) misses then hits with an `age`, the static
asset misses, hits, and misses again after an invalidation through the local
CloudFront API; the `/isr-demo` response carries `s-maxage=0`, so every request
is a CloudFront miss that reaches the Lambda origin while FaceTheory's own ISR
store answers the second request as a hit, and each request's own id is echoed.
The stack configures no `CustomErrorResponses`.

The FT3 rows are L2. Their cloud gaps are docs/125 true limits: the edge network
and TLS, IAM policy evaluation (including S3 bucket policies and CORS), and
viewer protocol enforcement (the local URL is plain HTTP). Emulator deviations,
not cloud gaps: DynamoDB Local stores the `ttl` attribute but never deletes an
expired item, and s3proxy has no event notifications or full
versioning/multipart/checksum fidelity.

## Run one example by hand

### A handler row through the runtime image

Install the released runner once (the same path the harness uses; the version
is pinned in `scripts/local/examples-local.json`):

```bash
GOBIN="$HOME/.cache/facetheory-examples-local/apptheory-local/v7.1.0/bin" \
  go install github.com/theory-cloud/apptheory/v7/cmd/apptheory-local@v7.1.0
APPTHEORY_LOCAL="$HOME/.cache/facetheory-examples-local/apptheory-local/v7.1.0/bin/apptheory-local"
go version -m "$APPTHEORY_LOCAL"   # path .../cmd/apptheory-local; mod .../v7 v7.1.0
```

The install command and profile rules are AppTheory's
[`docs/examples/local-runner.md`](https://github.com/theory-cloud/AppTheory/blob/v7.1.0/docs/examples/local-runner.md#install-the-command).

Bundle the example's own entry from `ts/` in a subshell, with `ts/dist` already
built, so the shell stays at the repository root for the steps that follow:

```bash
(
  cd ts
  ./node_modules/.bin/esbuild examples/lambda-url-streaming/handler.ts \
    --bundle --platform=node --format=cjs --target=node24 \
    --alias:@theory-cloud/facetheory=./dist/index.js \
    --alias:@theory-cloud/facetheory/apptheory=./dist/apptheory/index.js \
    --outfile=$HOME/.cache/facetheory-examples-local/ft2-hand/index.js
)
```

Start the warm container and type one Function URL event per line:

```bash
"$APPTHEORY_LOCAL" invoke \
  --handler-dir ~/.cache/facetheory-examples-local/ft2-hand \
  --runtime nodejs24.x --handler index.handler \
  --profile scripts/local/apptheory-local-profile.json --stdio
{"version":"2.0","routeKey":"$default","rawPath":"/","rawQueryString":"","headers":{"host":"local.lambda-url.us-east-1.on.aws"},"requestContext":{"accountId":"123456789012","apiId":"local","domainName":"local.lambda-url.us-east-1.on.aws","http":{"method":"GET","path":"/","protocol":"HTTP/1.1","sourceIp":"127.0.0.1","userAgent":"manual"},"requestId":"0123456789abcdef0123456789abcdef","routeKey":"$default","stage":"$default"},"isBase64Encoded":false}
```

The result is one JSON object with `"streamed": true` and the complete framed
body. Stop it with `Ctrl-D` (or `Ctrl-C`).

### The SSR gateway

The stack's CDK CLI is installed by `npm ci`, and `ts/dist` must exist:

```bash
cd infra/apptheory-ssr-site && npm ci
cd ../..
make ts-build
"$APPTHEORY_LOCAL" run \
  --app infra/apptheory-ssr-site \
  --profile scripts/local/apptheory-local-profile.json --backend s3proxy \
  --port-base 8240
curl -i http://127.0.0.1:8240/
curl -i http://127.0.0.1:8240/assets/entry.css
curl -i http://127.0.0.1:8240/_facetheory/data/index.json
```

`Ctrl-C` stops the gateway and removes its containers and network.

### The SSG+ISR gateway

The SSG+ISR stack adds DynamoDB to the same topology. Install its dependencies
once, then run the gateway with both backends:

```bash
cd infra/apptheory-ssg-isr-site && npm ci
cd ../..
make ts-build
"$APPTHEORY_LOCAL" run \
  --app infra/apptheory-ssg-isr-site \
  --profile scripts/local/apptheory-local-profile.json \
  --backend dynamodb --backend s3proxy \
  --port-base 8246
curl -i http://127.0.0.1:8246/
curl -i http://127.0.0.1:8246/assets/entry.css
curl -i http://127.0.0.1:8246/isr-demo
curl -i http://127.0.0.1:8246/isr-demo
curl -i http://127.0.0.1:8246/assets/missing.css
```

`/` and `/ssg-demo` are the pre-rendered S3 objects; `/assets/entry.css` is the
deployed asset; the first `/isr-demo` response is the Lambda-generated miss and
the second is the cached hit with identical bytes; `/assets/missing.css` is the
403 `AccessDenied` page. The gateway log names the provisioned cache table and
buckets, and `make examples-local ONLY='infra/apptheory-ssg-isr-site#local-run'`
asserts the stored object and item directly. `Ctrl-C` stops the gateway and
removes its containers and network.

### The Node-served examples

Use the example's own serve file from `ts/`. The examples default to the ports in
their READMEs; set `PORT` to use another free port.

Buffered React SSR:

```bash
cd ts
PORT=8210 node --import tsx examples/react-ssr-buffered/node-server.ts
```

A Vite example needs its build first:

```bash
cd ts
npm run example:vite:ssr:build
PORT=8213 node --import tsx examples/vite-ssr-react/node-server.ts
```

The Vite middleware dev loop runs from the example directory and defaults to
`5174`:

```bash
cd ts/examples/vite-ssr-react
npm run dev
```

Blocking ISR over the in-memory stores:

```bash
cd ts
PORT=8229 node --import tsx examples/isr-blocking/node-server.ts
curl -i http://127.0.0.1:8229/news/home   # miss, generation
curl -i http://127.0.0.1:8229/news/home   # hit, identical bytes
```

### One ISR example on real local storage

Start the FT3 backends and provision the row's bucket and table. The command
prints the bucket, table, endpoints and the exact serve command, and writes the
row's runtime environment to a file:

```bash
node scripts/local/isr-storage.mjs up --row isr-blocking#real-storage
```

Serve the example with that environment. The subshell keeps the terminal at the
repository root; stop the server with `Ctrl-C` when the curls below are done:

```bash
( cd ts && set -a && . "$(node ../scripts/local/isr-storage.mjs env --row isr-blocking#real-storage)" && set +a && PORT=8241 node --import tsx examples/isr-blocking/node-server.ts )
```

In another terminal, at the repository root, the first request generates and the
second hits. The stored object and items are then readable directly:

```bash
curl -i http://127.0.0.1:8241/news/home
curl -i http://127.0.0.1:8241/news/home
node scripts/local/isr-storage.mjs inspect --row isr-blocking#real-storage
node scripts/local/isr-storage.mjs down
```

`inspect` prints the DynamoDB items (the metadata item and any lease item while
one is held) and every S3 object with its content type, cache-control, metadata
and a body excerpt. `down` stops only this checkout's `ad3-` containers and
network and removes the environment file.

Run one classified row through the harness:

```bash
make examples-local ONLY=ssg-basic#serve
```

List the rows and ports without starting anything:

```bash
node scripts/local/run-examples-local.mjs --list
```

## Cleanup

The harness stops every server it starts before the next row, and stops any
remaining recorded process on `SIGINT`/`SIGTERM`. A fully passing run removes its
log directory. A failing run keeps the row logs under
`~/.cache/facetheory-examples-local/logs-<checkout-id>/` for diagnosis.

Each FT2 row and the SSG+ISR row use an `ad3-` prefixed container and network
name. The runner removes them on shutdown; the harness waits for that
cleanup, removes any exact-name leftovers under the recorded prefix, and fails
the row if anything remains.

The FT3 example rows use `ad3-<checkout-id>-dynamodb-local`,
`ad3-<checkout-id>-s3proxy` and `ad3-<checkout-id>-net`. The harness removes them
at the end of a run and on `SIGINT`/`SIGTERM`. Removal checks the exact name and
the `ad3.owner` label, so a container or network this checkout did not create is
reported and left running.

`make examples-local-down` stops only PIDs recorded by this checkout, after
checking their recorded start time and command line; it never uses a
label-wide process or container kill. It also removes the `ad3-` Docker
resources recorded for those PIDs, the FT3 storage containers and network for
this checkout, and the checkout's state and log directories. The by-hand
helper's `down` removes its own environment file. A PID that was reused or no
longer matches is left running and reported.

## CI

`.github/workflows/examples-local.yml` runs `make examples-local` on pull
requests into `staging`, with Node 24, Go 1.27.3 (from `.go-version`) and no AWS
secrets. The job installs the pinned released runner with
`node scripts/local/run-examples-local.mjs --install-runner` — the same code path
the local harness uses — and never clones AppTheory. The job pulls only the
digest-pinned images named by `scripts/local/apptheory-local-profile.json` and
`scripts/local/examples-local.json`, starts the FT3 storage backends on
`8250`/`8251` itself, uses no service containers, and runs
`make examples-local-down` on every outcome.
