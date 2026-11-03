---
title: Local examples harness
---

# Local examples harness

`make examples-local` builds every FaceTheory example, serves each one that has a
runtime surface on its own port, and asserts the real HTTP response. Nothing
reaches AWS: the harness removes inherited AWS and proxy variables, installs
static dummy credentials, and points every AWS endpoint at an unused loopback
port. The FT1 rows start no containers.

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
| Process, state and cleanup  | `scripts/local/lib/runtime.mjs`                                |
| Classification manifest     | `scripts/local/examples-local.json`                            |
| Pending-upstream ledger     | `scripts/local/examples-local-ledger.json`                     |
| Self-tests                  | `scripts/local/test-examples-local.mjs`                        |
| CI job                      | `.github/workflows/examples-local.yml`                         |

## Requirements

- Node.js 24 or newer and npm.
- `git`, for the ledger's producer-ancestry check.
- `cd ts && npm ci` once per checkout, to install the example dependencies.
- The two `infra/*` stacks need their own dependencies. `make examples-local`
  installs them with `npm ci --ignore-scripts` when `node_modules` is absent; a
  direct harness invocation fails with a named prerequisite error instead.
- Docker (on macOS, colima) is not required for FT1. FT3 adds the S3 emulator and
  DynamoDB Local to this same harness.

The harness sets its own runtime environment. It does not need an AWS profile,
AWS credentials, or an operator-set endpoint variable.

## Ports

The harness reserves `8210-8259`:

| Range                       | Use                                                                                                                   |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `8210-8249`                 | one deterministic port per serving example row                                                                        |
| `8250-8259`                 | reserved for FT3's DynamoDB Local and S3 emulator                                                                     |
| `8000`, `8123`, `8130-8199` | reserved away from this harness: the shared default, TableTheory's DynamoDB Local port, and AppTheory's harness range |
| `8299`                      | the harness's dummy AWS endpoint; preflight fails if it is in use                                                     |

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

Rows that need a later milestone are marked `pending` with `FT2` or `FT3`. They
are listed in the report and counted separately; they are never counted as
passing and they are never run. A pending row is non-failing only through the
ledger rule below.

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

## The pending-upstream ledger

`scripts/local/examples-local-ledger.json` is the only way a pending row can be
non-failing. Each ledger row names the example row, the required producer
capability, the producer repo, the producer checkout path, the producer staging
SHA, an owner, and the release-cycle resolution.

For a pending row the harness runs:

```bash
git -C <producer-checkout> merge-base --is-ancestor <ledger-sha> HEAD
```

The row is counted as pending only when the ledger row exists, the producer
checkout resolves, and the ledger SHA is contained in the producer HEAD. A
missing ledger row, a missing producer checkout, or a non-ancestor SHA fails the
row with a named error. Ancestor containment means later producer merges do not
churn the ledger.

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

## Run one example by hand

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

`make examples-local-down` stops only PIDs recorded by this checkout, after
checking their recorded start time and command line; it never uses a
label-wide process or container kill. It also removes the checkout's state and
log directories. A PID that was reused or no longer matches is left running and
reported.

## CI

`.github/workflows/examples-local.yml` runs `make examples-local` on pull
requests into `staging`, with Node 24 and no AWS secrets. It clones the public
AppTheory staging history beside the checkout for the ledger ancestry check. The
job uses no service containers in FT1; FT3 will add digest-pinned images.
