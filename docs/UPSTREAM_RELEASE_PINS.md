# Upstream Release Pins (AppTheory + TableTheory)

FaceTheory depends on upstream repos that intentionally do **not** publish to the npm registry.
GitHub Releases (release assets) are the source of truth.

This file records the currently pinned versions and the exact install strings we expect FaceTheory apps/examples to use.

## Pins

- AppTheory (TypeScript): `v7.0.0`
- AppTheory (CDK): `v7.0.0`
- TableTheory (TypeScript): `v6.3.0`

## Compatibility Impact

AppTheory `v7.0.0` is a major release. Its changelog records thirteen breaking commits in the 2026-10-30 security wave,
and the Go module path moves to `github.com/theory-cloud/apptheory/v7`. FaceTheory consumes only the **TypeScript**
AppTheory runtime asset, the **TypeScript** AppTheory CDK asset, and the **TypeScript** TableTheory asset. The repo has
no `go.mod`, no `*.go` files and only a `.go-version` pin, so the Go import-path break has no FaceTheory site to
rewrite.

No FaceTheory public API, type, default or documented behaviour changes. FaceTheory's AppTheory imports are exactly:

- `createApp` and `createLambdaFunctionURLStreamingHandler` (the reference handlers and `create` templates);
- the `Context`, `Handler`, `Request` and `Response` types in the `/apptheory` adapter;
- `AppTheorySsrSite`, `AppTheoryDynamoTable` and `AppTheorySsrSiteMode` in the two infra stacks and the create template.

A diff of the published `v6.4.0` and `v7.0.0` type declarations shows `Context`, `Handler`, `Request` and `Response`
unchanged, `createLambdaFunctionURLStreamingHandler` unchanged, and `createApp` gaining only an optional
`RouteOptions.guard`. The two CDK classes FaceTheory constructs are byte-identical apart from the jsii runtime-version
string, and `@theory-cloud/apptheory-cdk` `v7.0.0` declares the same exact `aws-cdk-lib@2.275.0` peer the manifests
already pin.

Each v7 break is unreachable from FaceTheory:

- **Go `/v7` module path** — no Go code or module in this repo.
- **CDK MCP front door `LOCKED`/`DISABLED` enforcement** — no `AppTheoryMcpServer`, `McpServer` or `mcpfacade` reference
  exists in `ts/` or `infra/`.
- **CDK explicit-route authorizer validation** — FaceTheory builds no `HttpApi` and registers no explicit routes;
  `AppTheorySsrSite` creates a Function URL, S3 origins and a CloudFront distribution.
- **MCP session/stream bounds, MicroVM ownership and registry clocks, transactional OAuth refresh** — none of those
  modules is imported; the reference handlers wire `createApp` and the streaming handler only.
- **Lambda@Edge challenge-restoration handler is asynchronous** — FaceTheory constructs no challenge-restoration
  function.
- **Object store S3 `Get` typed not-found** — FaceTheory's S3 HTML store is its own `S3HtmlStore` over
  `@aws-sdk/client-s3`, not AppTheory's object store.
- **`*Strict` registrars un-deprecated** — additive posture change on a surface FaceTheory does not use.

TableTheory `v6.3.0` changes no `@theory-cloud/tabletheory-ts/facetheory` source. The diff between `v6.1.1` and
`v6.3.0` touches `client.ts`, `dms.ts`, `encryption.ts`, `model.ts`, `preflight.ts`, `release-state.ts`,
`schema-migration.ts` and `schema.ts`; the `facetheory` entry point FaceTheory imports is unchanged. Those changes add
an optional item-image redaction setting, tighten the number-mode typing, and extend schema and release state.
FaceTheory's ISR metadata store compiles and its unit tests pass unchanged.

The two infra snapshots move by exactly one `Code.S3Key` each. The bundled handler contains the AppTheory runtime and,
in the SSR site, the streamed reference page, so the v7 runtime and the streaming change alter the esbuild asset hash;
no synthesized resource, property or route changes. The pin move is a
`fix(deps)` compatibility update, not a breaking change for FaceTheory consumers. A consumer installing
`@theory-cloud/facetheory` is unaffected: `@theory-cloud/apptheory` is a FaceTheory devDependency, and the adapter
subpath continues to require the consumer's own AppTheory install. Newly generated starters pick up the `v7.0.0`
tarball from `ts/package.json`, which is the supported line for the `createApp` and streaming-handler surfaces they use.

Retained history lives in `CHANGELOG.md`; this file records only the current pin set.

Treat future upstream pin moves as dependency compatibility fixes, not release-process bookkeeping. FaceTheory consumers
install immutable GitHub Release tarballs, so a changed upstream baseline needs a normal RC for review before stable
promotion.

## Release Watchpoint

A `staging` -> `premain` PR is always RC intent. If upstream pin maintenance reaches `staging` without a
release-please-eligible `feat:`, `fix:`, or `perf:` commit, `scripts/verify-release-readiness.sh origin/premain
origin/staging prerelease` must fail rather than silently letting Release Please skip the RC. Do not recover with
manual tags, manual GitHub Releases, or `Release-As` footers; land a small, truthful compatibility change on `staging`
and keep the single release lane intact.

## Release Asset SHA-256

Each hash below is the SHA-256 of the downloaded GitHub Release asset, cross-checked against the release's published
AppTheory `SHA256SUMS.txt` (runtime + CDK) and TableTheory `tabletheory-SHA256SUMS.txt` (all three matched; a mismatch is
a release-asset integrity stop condition).

- AppTheory runtime tarball: `e3241d1e1e908696bb3f4e3a0a99dab0bb3affb8681707e656b03d568bd25894`
- AppTheory CDK tarball: `1b4c09c3fe4e801246d7d464103182c7254f8f9cb957a81be33120de4b2b734a`
- TableTheory TypeScript tarball: `9507f6a6258e661546238300880659a1725f235bf1a0020edbd98145af31ea96`

The matching SHA-512 lockfile integrities are
`sha512-t3rQuNEUZyy0dIsGFs8t9sHTPK+l/opcYirGIJz6Hf+/0gW8i9ikdZ5cSMtW0GuAouCIdVCybd3R/4pvw+KJaw==`,
`sha512-rrY6DS0P+wfNpuLpCiRLLfHewz2Izs5gzvMebycePNpd/2IFocvMGE0zpmArcEbKR27eWkNg6q53eUQgRYs9hQ==`
and `sha512-ji8q/RXu6V8UKfRozQnqotPEm6O5nY3Ikg6TJcK1dzVemU+flclZUFGOUvlOU4a8ztGbOKmQ/DA3wJeu6pMDdA==`.

## Known Audit Exceptions

The gov-infra supply-chain allowlist (`gov-infra/planning/facetheory-supply-chain-allowlist.txt`) is the only place an
`npm audit` finding may be allowed, and `scripts/verify-npm-audit.sh` requires a clean audit in `ts`,
`infra/apptheory-ssr-site`, and `infra/apptheory-ssg-isr-site` otherwise. A scoped exception entry names an exact
advisory set, package, installed version, node path, project list, and UTC expiry; the gate fails on anything outside
those gates and ignores the entry once it expires. A parent package that npm reports only because an allowed dependency
is vulnerable (an entry whose `via` lists dependency names rather than advisories) inherits the allowance only when
every dependency it names is itself allowed and it carries no advisory of its own.

### Active exceptions

- **bundled `minimatch` 10.2.6 in `aws-cdk-lib@2.275.0`** — `GHSA-g3hv-75wg-m249` (DoS via globparts amplification),
  fixed in `minimatch@11.0.1`. The affected copy at `node_modules/aws-cdk-lib/node_modules/minimatch` ships inside the
  AWS-published `aws-cdk-lib` tarball and cannot be upgraded from this repository; `2.275.0` is the newest published
  `aws-cdk-lib` and it still declares `minimatch ^10.2.6`, so no available CDK release fixes this. The scoped entry
  names exactly that package, version, node path, all three audited projects, and the single advisory, and expires
  2026-12-01. Authorised by the operator ruling of 2026-10-03 ("if a vulnerable dependency is bundled in AWS we make an
  exception until its updated there"), extended 2026-10-04 to AWS-published build-toolchain chains. Removal condition:
  the pinned `aws-cdk-lib` bundles `minimatch >= 11.0.1`.

### Non-bundled remediation

Non-bundled copies are not eligible for an exception and are resolved by upgrade instead. The same advisory batch
(2026-10-30) also published `GHSA-3g3m-2fjr-6pw4` against `glob` (patched `14.0.2`), so `ts/package.json` overrides
`minimatch` to `11.0.1` and `glob` to `14.0.3`; `ts/package-lock.json` resolves every non-bundled `minimatch` to
`11.0.1` and `glob` to `14.0.3`, leaving only the AWS-bundled node above.

### Recently cleared

- **bundled `brace-expansion` 5.0.9** — retired by the AppTheory v6 CDK pin move and kept retired here. The exception's
  documented removal condition ("must be rechecked when `aws-cdk-lib` bundles a fixed `brace-expansion` (>= 5.0.12)") is
  met: `aws-cdk-lib@2.273.0`, the exact peer of `@theory-cloud/apptheory-cdk` `v6.4.0`, bundles `brace-expansion@5.0.12`
  at `node_modules/aws-cdk-lib/node_modules/brace-expansion` in all three projects, and the current
  `aws-cdk-lib@2.275.0` pin bundles the same `5.0.12`; the three advisories (`GHSA-q2hr-2g5m-vwhr`,
  `GHSA-qhr7-859c-m2p7`, `GHSA-6j4f-fj2g-mc7p`) are fixed at 5.0.10 / 5.0.11 / 5.0.12. The scoped allowlist entry was
  removed rather than re-granted; it expired 2026-11-02, and removal happened first because the condition it named was
  actually satisfied.
- **top-level `brace-expansion`** — non-bundled dependency paths resolve to fixed `brace-expansion@5.0.12`.

## Infra Lockfile Note

The infra example lockfiles intentionally retain AWS CDK bundled-dependency metadata for
`aws-cdk-lib/node_modules/@aws-cdk/cloud-assembly-api`. Keep those nested `inBundle` entries when regenerating the
locks so `npm ci` can validate the AWS CDK package tree under npm 11.

A `npm install --package-lock-only` run also re-resolves the peer-only `@aws-sdk/client-dynamodb`,
`@aws-sdk/client-kms`, and `@aws-sdk/client-sts` nodes (plus their `@aws-sdk/*` and `@smithy/*` transitives) even
though their peer range did not move. Restore those nodes from the prior lock whenever the new pin does not require
them, so each lockfile diff stays scoped to the `@theory-cloud` pin nodes, then confirm the result with a real
`npm ci`.

AppTheory `v7.0.0` keeps the `^3.1156.0` `@aws-sdk/*` floor the v6.4.0 line already declared, so this pin move needs
no AWS SDK graph movement. The adoption regenerated each lock with
`npm install --before=2026-11-04T00:00:00.000Z`, which holds the pre-existing `3.1161.0` AWS SDK nodes and leaves each
lockfile diff scoped to the three `@theory-cloud` pin nodes; every lock was then validated with a real `npm ci`. The
restore rule above continues to apply to pin-only PRs that do not carry a dependency refresh. The one deliberate
transitive consequence is the Lambda asset hash: the handler bundle contains the AppTheory runtime, so the v7 runtime
changes each reference stack's `Code.S3Key` and the two infra snapshots move by that single line each.

## Install (npm)

```bash
  # AppTheory (TS)
npm install --save-exact \
  https://github.com/theory-cloud/AppTheory/releases/download/v7.0.0/theory-cloud-apptheory-7.0.0.tgz

  # TableTheory (TS)
npm install --save-exact \
  https://github.com/theory-cloud/TableTheory/releases/download/v6.3.0/theory-cloud-tabletheory-ts-6.3.0.tgz

  # AppTheory CDK (only for infra projects)
npm install --save-exact \
  https://github.com/theory-cloud/AppTheory/releases/download/v7.0.0/theory-cloud-apptheory-cdk-7.0.0.tgz
```

## package.json Snippet (Pinned)

`ts/package.json` pins these as dev dependencies so FaceTheory development/examples don’t accidentally drift to npm
registry installs:

```json
{
  "devDependencies": {
    "@theory-cloud/apptheory": "https://github.com/theory-cloud/AppTheory/releases/download/v7.0.0/theory-cloud-apptheory-7.0.0.tgz",
    "@theory-cloud/tabletheory-ts": "https://github.com/theory-cloud/TableTheory/releases/download/v6.3.0/theory-cloud-tabletheory-ts-6.3.0.tgz"
  },
  "overrides": {
    "@theory-cloud/apptheory": {
      "@theory-cloud/tabletheory-ts": "https://github.com/theory-cloud/TableTheory/releases/download/v6.3.0/theory-cloud-tabletheory-ts-6.3.0.tgz"
    }
  }
}
```

Note: AppTheory `v7.0.0` declares `@theory-cloud/tabletheory-ts` `v6.3.0` transitively, as a pinned GitHub Release tarball URL carrying its own integrity (`…/releases/download/v6.3.0/theory-cloud-tabletheory-ts-6.3.0.tgz#sha512-ji8q/RXu6V8UKfRozQnqotPEm6O5nY3Ikg6TJcK1dzVemU+flclZUFGOUvlOU4a8ztGbOKmQ/DA3wJeu6pMDdA==`). The local SHA-512 of the downloaded TableTheory `v6.3.0` tarball, the integrity AppTheory `v7.0.0` declares, and the integrity recorded in all three lockfiles agree. The `overrides` block above is therefore **not load-bearing for the resolved version**: the direct dev dependency and AppTheory's transitive requirement name the same `v6.3.0` tarball URL, so both resolve to a single deduped `v6.3.0` node (`npm ls @theory-cloud/tabletheory-ts` reports `apptheory@7.0.0 -> tabletheory-ts@6.3.0 deduped`, plus the top-level `6.3.0`). The override is retained deliberately as a narrow guard: it keeps FaceTheory's validated TableTheory tarball authoritative under `@theory-cloud/apptheory` even if a future upstream release regresses its transitive declaration. The `ts/` and infra lockfiles also keep that upstream-declared `v6.3.0` string verbatim inside the `@theory-cloud/apptheory` package node — that is AppTheory's own published manifest, not a FaceTheory pin, and it is not editable.

`facetheory create` and `facetheory doctor` carry no version constants: the create CLI derives the AppTheory, CDK, and
TableTheory tarball URLs from `ts/package.json` at runtime, and the doctor CLI checks the generated project's override
alignment against the tarball it finds there. Both therefore emit and validate exactly the pins above.
