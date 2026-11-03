---
title: Local examples harness
---

# Local examples harness

`make examples-local` builds every FaceTheory example, serves each one that has a
runtime surface on its own port, and asserts the real HTTP response. Nothing
reaches AWS: the harness removes inherited AWS and proxy variables, installs
static dummy credentials, and points every AWS endpoint at an unused loopback
port. The FT1 rows start no containers; the FT2 rows run real Lambda handlers
and the SSR site in the official, digest-pinned Lambda runtime image through
the sibling AppTheory local runner and gateway.

```bash
make examples-local          # build, serve and assert every classified row
make examples-local-down     # stop processes this checkout's harness started
make examples-local-selftest # prove the manifest, discovery and ledger rules
```

`make examples-local` runs `make ts-build`, so `ts/dist` matches the
checked-in sources, installs any missing `infra/*` dependencies, and then runs
the harness serially, row by row.

## What the harness owns

| Piece                       | Where it lives                                                 |
| --------------------------- | -------------------------------------------------------------- |
| Harness                     | `scripts/local/run-examples-local.mjs`                         |
| Discovery and validation    | `scripts/local/lib/tree.mjs`, `scripts/local/lib/manifest.mjs` |
| HTTP runners and assertions | `scripts/local/lib/runners.mjs`                                |
| AppTheory runner control    | `scripts/local/lib/apptheory.mjs`                              |
| Process, state and cleanup  | `scripts/local/lib/runtime.mjs`                                |
| Classification manifest     | `scripts/local/examples-local.json`                            |
| Unreleased-producer ledger  | `scripts/local/examples-local-ledger.json`                     |
| Runner image/backend pins   | `scripts/local/apptheory-local-profile.json`                   |
| Self-tests                  | `scripts/local/test-examples-local.mjs`                        |
| CI job                      | `.github/workflows/examples-local.yml`                         |

## Requirements

- Node.js 24 or newer and npm.
- `git`, for the ledger's producer-ancestry check.
- `cd ts && npm ci` once per checkout, to install the example dependencies.
- The two `infra/*` stacks need their own dependencies. `make examples-local`
  installs them with `npm ci --ignore-scripts` when `node_modules` is absent; a
  direct harness invocation fails with a named prerequisite error instead.
- Go 1.27.3 or newer, to build `apptheory-local` from the sibling AppTheory
  checkout for the FT2 rows. `../AppTheory/go.mod` and this repository's
  `.go-version` both require 1.27.3.
- The sibling AppTheory checkout at `../AppTheory`, clean, with the ledger SHA
  `3d48d40dadd0bb8c0255c14938c5707a625b4d37` in its history. The harness builds
  the runner from that checkout; it never commits a `file:` dependency, an
  override, a vendored binary or a pin bump.
- Docker (on macOS, colima) with the daemon running, for the FT2 rows only.
  The runner starts one private network per row and publishes the Runtime
  Interface Emulator port on `127.0.0.1` only.
- The SSR stack's own CDK CLI is a dev dependency (`aws-cdk`), because the
  runner synthesizes `infra/apptheory-ssr-site` with the app's
  `node_modules/.bin/cdk`.

The harness sets its own runtime environment. It does not need an AWS profile,
AWS credentials, or an operator-set endpoint variable.

## Ports

The harness reserves `8210-8259`:

| Range                       | Use                                                                                                                                                                                                   |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `8210-8249`                 | one deterministic port per serving example row (the SSR gateway row uses `8240`)                                                                                                                      |
| `8250-8259`                 | reserved for FT3's DynamoDB Local and S3 emulator                                                                                                                                                     |
| `8000`, `8123`, `8130-8199` | reserved away from this harness: the shared default, 8123 to match AppTheory's harness convention (TableTheory publishes DynamoDB Local on an ephemeral loopback port), and AppTheory's harness range |
| `8299`                      | the harness's dummy AWS endpoint; preflight fails if it is in use                                                                                                                                     |

The manifest validation fails when a row's port is outside `8210-8259`, collides
with another row, or falls in a reserved range. The preflight also fails when a
serving port is already in use, and the harness holds an exclusive lock for the
checkout so two runs cannot meet on the same ports.

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
must not declare one.

Rows that need a later milestone are marked `pending` with `FT3`. They are
listed in the report and counted separately; they are never counted as passing
and they are never run. A pending row is non-failing only through the ledger
rule below. The three FT2 rows no longer use `pending`: they execute against the
sibling AppTheory checkout and keep a `record` ledger entry for that
dependency.

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

## The unreleased-producer ledger

`scripts/local/examples-local-ledger.json` is the record of every row that
depends on an unreleased producer. Each entry names the example row, the
required producer capability, the producer repo, the producer checkout path,
the producer staging SHA, an owner, and the release-cycle resolution. An entry
is either:

- **`pending`** — the row cannot run yet. It is listed and counted as pending,
  never as passing and never executed.
- **`record`** — the row now runs against the sibling checkout. It is executed
  like any other row; the entry records the unreleased dependency until the
  release cycle moves the committed pins.

For every ledger entry the harness runs:

```bash
git -C <producer-checkout> merge-base --is-ancestor <ledger-sha> HEAD
```

A row is non-failing only when its ledger entry exists, the producer checkout
resolves, the checkout is clean, and the ledger SHA is contained in the producer
HEAD. A missing ledger entry, a missing or dirty producer checkout, or a
non-ancestor SHA fails the row with a named error; it is never a silent skip.
Ancestor containment means later producer merges do not churn the ledger.

The three FT2 rows (`lambda-url-streaming#serve`,
`apptheory-lambda-url-streaming#serve` and
`infra/apptheory-ssr-site#local-run`) are `record` entries: they run against the
sibling AppTheory checkout at `3d48d40d`. The committed
`@theory-cloud/apptheory` and `@theory-cloud/apptheory-cdk` pins stay unchanged;
the post-wave release cycle moves them, re-runs the rows against the released
pins, and deletes the ledger entries.

The local run resolves AppTheory from the sibling registered checkout
(`../AppTheory`) and never commits a `file:` dependency, an override, or a pin
bump. CI clones the public AppTheory staging history beside the checkout so the
same ancestry rule runs there.

## What the rows verify

The serving rows build and serve the example's own code, then assert status,
content type and body content. The assertions include:

- rendered markup and hydration data (`__FACETHEORY_DATA__`, external sidecars,
  module preloads and stylesheet tags);
- actual chunk boundaries for the React and Vue streaming examples: the document
  head arrives before the body, and the buffered React example arrives as one
  complete body;
- the strict-CSP header without `unsafe-inline` or `unsafe-eval`, no inline
  `<script>` or `<style>`, external assets, and the `no-store` hydration sidecar;
- the control-plane preset's four relaxed/strict and client-fill/streaming
  variants, including the client-fill section endpoint and the bootstrap `HEAD`
  response;
- ISR miss/hit headers and identical cached bytes for the in-memory
  `isr-blocking` and `react-isr` rows;
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
handlers in the official AWS Lambda Node runtime image through
`apptheory-local`, built from the sibling AppTheory checkout.

### Resolving and building the producer

For a row whose manifest entry sets `unreleasedProducer: true`, the harness:

1. reads the row's `record` ledger entry and resolves `../AppTheory`;
2. proves the checkout is clean and its HEAD contains the ledger SHA;
3. builds `apptheory-local` with `go build -C ../AppTheory` into
   `~/.cache/facetheory-examples-local/apptheory-local/<head>/apptheory-local`.

The binary and the example bundles live under the harness cache, never in git.
Nothing is installed into `ts/`, and no `file:` dependency, override or pin bump
is committed. A missing checkout, a dirty checkout or a HEAD without the ledger
SHA fails the row by name instead of skipping it.

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
  --name-prefix ft2-<row> --stdio
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

**Streaming is buffered.** The Runtime Interface Emulator buffers
`RESPONSE_STREAM` responses: the harness receives the metadata framing and the
complete body (`"streamed": true`) but never the chunk timing. Both streaming
rows are class L3, and incremental delivery plus the managed Function URL edge
are the named gaps. The harness never claims incremental delivery.

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
  echoed on the response);
- `/assets/entry.css` from the S3 origin with `content-type: text/css`, the
  immutable cache-control metadata and bytes equal to the deployed source;
- the Vite manifest at `/.vite/manifest.json` and the SSG data path at
  `/_facetheory/data/index.json`, with their content types, cache-control
  metadata and deployed bytes;
- a missing asset (`/assets/missing.css`) as the 403 `AccessDenied` the OAC S3
  origin produces when it has no `s3:ListBucket`, and a missing SSR route as the
  handler's 404 page.

The row is class L2. Named gaps: CloudFront caching (every request reaches the
origin as a miss), the edge network and TLS, IAM policy evaluation (the
`AWS_IAM` Function URL request is signed locally but its policy is not
evaluated), S3 bucket policies and CORS, viewer protocol enforcement, and a
buffered `RESPONSE_STREAM` body.

Both the manifest and the SSG data deployments write at the bucket root, so they
must not prune: a root prune would delete the other deployment's objects. The
stack sets `prune: false` on those two deployments and the snapshot test pins
it; the prefix-scoped assets deployment still prunes stale assets.

## Run one example by hand

### A handler row through the runtime image

Build `apptheory-local` from the sibling checkout once (the same path the
harness uses):

```bash
HEAD=$(git -C ../AppTheory rev-parse HEAD)
mkdir -p ~/.cache/facetheory-examples-local/apptheory-local/$HEAD
go build -C ../AppTheory \
  -o ~/.cache/facetheory-examples-local/apptheory-local/$HEAD/apptheory-local \
  ./cmd/apptheory-local
```

Bundle the example's own entry (from `ts/`, with `ts/dist` already built):

```bash
cd ts
./node_modules/.bin/esbuild examples/lambda-url-streaming/handler.ts \
  --bundle --platform=node --format=cjs --target=node24 \
  --alias:@theory-cloud/facetheory=./dist/index.js \
  --alias:@theory-cloud/facetheory/apptheory=./dist/apptheory/index.js \
  --outfile=$HOME/.cache/facetheory-examples-local/ft2-hand/index.js
```

Start the warm container and type one Function URL event per line:

```bash
~/.cache/facetheory-examples-local/apptheory-local/$HEAD/apptheory-local invoke \
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
~/.cache/facetheory-examples-local/apptheory-local/$HEAD/apptheory-local run \
  --app infra/apptheory-ssr-site \
  --profile scripts/local/apptheory-local-profile.json --backend s3proxy \
  --port-base 8240
curl -i http://127.0.0.1:8240/
curl -i http://127.0.0.1:8240/assets/entry.css
curl -i http://127.0.0.1:8240/_facetheory/data/index.json
```

`Ctrl-C` stops the gateway and removes its containers and network.

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

Run one classified row through the harness:

```bash
node scripts/local/run-examples-local.mjs --only ssg-basic#serve
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

Each FT2 row uses a `ft2-` prefixed container and network name. The producer
removes them on shutdown; the harness waits for that cleanup, removes any
exact-name leftovers under the recorded prefix, and fails the row if anything
remains.

`make examples-local-down` stops only PIDs recorded by this checkout, after
checking their recorded start time and command line; it never uses a
label-wide process or container kill. It also removes the `ft2-` Docker
resources recorded for those PIDs, plus the checkout's state and log
directories. A PID that was reused or no longer matches is left running and
reported.

## CI

`.github/workflows/examples-local.yml` runs `make examples-local` on pull
requests into `staging`, with Node 24, Go 1.27.3 (from `.go-version`) and no AWS
secrets. It clones the public AppTheory staging working tree beside the checkout,
so the ledger ancestry check and the `apptheory-local` build both run there. The
job pulls only the digest-pinned images named by
`scripts/local/apptheory-local-profile.json`, uses no service containers, and
runs `make examples-local-down` on every outcome.
