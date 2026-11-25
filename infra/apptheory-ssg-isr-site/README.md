# FaceTheory SSG And ISR Infra Example

This folder contains a code-local reference stack for CloudFront plus S3 plus DynamoDB plus Lambda Function URL deployment.

Canonical operator guidance lives under [`../../docs/cdk/README.md`](../../docs/cdk/README.md). The resource names this
stack derives, and what an existing deployment experiences on upgrade, are documented in
[Resource Naming](../../docs/features/resource-naming.md).

## What This Stack Demonstrates

- SSG hits served from S3 through CloudFront
- signed Lambda Function URL fallback for SSR and ISR
- distinct strict-CSP sidecar routing: SSG data on S3, SSR runtime sidecars on Lambda
- request correlation headers
- baseline security headers
- escaped reflected request context on the SSR 404 example page
- blocking ISR using FaceTheory HTML storage plus TableTheory metadata

## Resource Naming

Every physical name comes from AppTheory's `theorycloud_resource_naming.v0.1` contract, bound from
[`src/stage-config.ts`](src/stage-config.ts) — stage config, never an operator environment variable. With the committed
config (`app: facetheory-ssg-isr`, `stage: lab`, `region: us-east-1`) the stack derives:

| Resource | Name |
| --- | --- |
| Assets bucket | prefix `facetheory-ssg-isr-lab-site-assets` in the `account-regional` namespace |
| ISR html store bucket | prefix `facetheory-ssg-isr-lab-site-aatexg6p` in the `account-regional` namespace (the contract's 63-character budget shortens `facetheory-ssg-isr-lab-site-html-store`) |
| ISR metadata table | `facetheory-ssg-isr-lab-site-isr-metadata`, point-in-time recovery on, deletion protection off while the table is `DESTROY` |
| CloudFront access-log group | `theorycloud_theorycloud_facetheory-ssg-isr_lab_logs_access_cdn_site`, 30-day retention |
| Log delivery source and destination | `facetheory-ssg-isr-lab-logs-access-cdn-site` |
| Distribution root object | `index.html`, served from the S3 html store; a miss still fails over to the Lambda origin |

FaceTheory derives every name through that contract and adds no naming rule of its own. Cross-site uniqueness **within
one account** is governed by the Factory resource-naming contract — [the separator finding,
`docs/155`](https://github.com/theory-cloud/factory/blob/staging/docs/155-resource-naming-separator-ambiguity-scoped-need-2026-11-25.md)
and [the contract,
`contracts/resource-naming`](https://github.com/theory-cloud/factory/blob/staging/contracts/resource-naming/v0.1/README.md)
— and is **not** guaranteed by FaceTheory today. The two classes that stay open are the separator ambiguity and a
shortened name that equals a valid name. Before a second site shares an account, compare the complete derived name set
of both — `derivedPhysicalNames()` and `sharedPhysicalNames()` in
[`src/physical-names.ts`](src/physical-names.ts) — rather than one bucket prefix: that check reports either class
when the pair you compare is the affected one, and it reads no AWS, so a name a third site already owns is outside it.
It also assumes a config that synthesizes and does not validate one — a `generated` ISR table entry is skipped while the
stack refuses that config — so run `cdk synth` (or construct the stack) on each config first, and do not read an empty
comparison from a config the stack refuses as an all-clear.

Set `account` in `src/stage-config.ts` to your twelve-digit account id before deploying. The first deploy after this
change **replaces** both buckets and the ISR table and **removes** the per-stack S3 access-log bucket.

Replacement is safe only for the state these stacks put there: assets re-upload, pre-rendered SSG HTML re-deploys, and
ISR cache metadata and leases regenerate per cache key. The deploy empties and deletes the three old buckets — each is
`Delete` with an auto-delete custom resource — and replaces the table, so if a bucket holds an object this stack did not
write, stay on the legacy profiles unless that object has a restore destination no deployment prunes or overwrites:
the immutable `assets/` deployment prunes its prefix, so a copy put back under `assets/` is deleted at the next deploy,
and a bucketed object belongs under a prefix of its own that no deployment targets or in a bucket this stack does not
manage. See
[where a restored object survives the deploy](../../docs/features/resource-naming.md#where-a-restored-object-survives-the-deploy)
and
[the stop condition](../../docs/features/resource-naming.md#stop-keep-path-b-when-a-site-bucket-holds-objects-these-stacks-did-not-write).
To keep today's resources instead — names and CloudFormation logical IDs both — move the config to the legacy naming and
logging profiles first: see
[Resource Naming](../../docs/features/resource-naming.md#path-b-keep-todays-resources).

## Build Requirement

This stack imports FaceTheory from `ts/dist/*`.

Before running stack tests or synthesis:

```bash
cd ../../ts
npm ci
npm run build
```

## Local Commands

```bash
cd infra/apptheory-ssg-isr-site
npm ci
npm test
npm run synth
```

`./.npmrc` sets npm's `allow-remote=root` policy for npm 12 compatibility
(npm 12 defaults to `allow-remote=none` and refuses the pinned
AppTheory/TableTheory release-tarball dependencies with EALLOWREMOTE).
That is intentionally narrower than `all`: only the URL dependencies
declared by this package's `package.json` may be fetched.

The same stack runs end to end on local backends through the released AppTheory
local runner and gateway. Install `apptheory-local` at the tag pinned in
`scripts/local/examples-local.json`, then run from
the repository root: the runner synthesizes this app with its own
`node_modules/.bin/cdk`, starts DynamoDB Local and s3proxy, creates the cache
table from the template's key schema and TTL, deploys the bucket sources, and
serves the distribution on loopback:

```bash
cd ../..
make ts-build
GOBIN="$HOME/.cache/facetheory-examples-local/apptheory-local/v7.5.0/bin" \
  go install github.com/theory-cloud/apptheory/v7/cmd/apptheory-local@v7.5.0
"$HOME/.cache/facetheory-examples-local/apptheory-local/v7.5.0/bin/apptheory-local" run \
  --app infra/apptheory-ssg-isr-site \
  --profile scripts/local/apptheory-local-profile.json \
  --backend dynamodb --backend s3proxy \
  --port-base 8246
```

The install command and the profile rules are AppTheory's
[`docs/examples/local-runner.md`](https://github.com/theory-cloud/AppTheory/blob/v7.5.0/docs/examples/local-runner.md#install-the-command).
The runner reports both listeners: `8246` is the `AWS_IAM` Function URL, which
refuses unsigned requests, and the CloudFront distribution is the next port
(`8247`) — the order AppTheory's
[`docs/examples/local-runner.md`](https://github.com/theory-cloud/AppTheory/blob/v7.5.0/docs/examples/local-runner.md#declared-ports)
defines.

`make examples-local ONLY='infra/apptheory-ssg-isr-site#local-run'` runs the same
gateway and asserts the SSG HTML and assets from S3 with real CloudFront caching
(the objects miss then hit with `x-cache: Hit from cloudfront` and an `age`, and
an invalidation removes a cached asset), the ISR miss/generation/hit through the
Function URL origin, the stored S3 object and DynamoDB metadata item, the lease
and TTL, the 403/404 refusals and the edge policy headers. The `s-maxage=0` ISR
response reaches the Lambda origin on every request. Named gaps: the edge
network and TLS (a docs/125 true limit), IAM/bucket policy evaluation, CORS,
viewer protocol enforcement, and DynamoDB Local's missing TTL deletion. The
stack configures no custom error responses.

## Deployment Notes

- The cache table's `pk`/`sk` keys and its `ttl` attribute come from
  TableTheory's FaceTheory ISR metadata and lease models; the stack test compares
  the synthesized table against those models so they cannot drift.
- The manifest deployment writes the Vite manifest at the assets bucket root.
  Root-prefix deployments must not prune: CDK's prune deletes every object the
  other deployments placed (`assets/*`, `_facetheory/data/*`). Only the
  prefix-scoped assets deployment sets `prune: true`.
- Use the canonical AWS deployment and operations docs for routing, cache, and smoke-test expectations.
- Keep SSG strict-CSP sidecars (`/_facetheory/data/*`) on S3/static behaviors.
- Route SSR runtime hydration sidecars (`/_facetheory/ssr-data/*`) directly to the same Lambda/FaceApp handler that
  rendered the SSR HTML; do not let the SSG rewrite or S3 origin group claim that reserved prefix.
- SSG or ISR pages may render forms, but same-origin mutating form action paths must route to Lambda/AppTheory through
  `ssrPathPatterns`; do not let those paths resolve to S3 static objects or direct Function URLs.
- Keep `AWS_IAM` + CloudFront OAC enabled for the Lambda Function URL and use FaceTheory's
  `data-facetheory-oac-form` / `startAwsOacFormTransport()` path for URL-encoded browser submissions.
- This reference stack intentionally avoids forwarding viewer-supplied tenant headers by default; derive tenant identity from trusted request context if a deployment needs it.
- The bundled ISR demo is tenant-invariant. Tenant-varying ISR deployments must configure FaceTheory `tenantKey` or a custom `cacheKey` after AppTheory/CloudFront has stripped viewer-supplied tenant headers and injected trusted tenant context.
- If tenant-like headers such as `x-tenant-id` or `x-facetheory-tenant` reach FaceTheory without that explicit partition, the ISR runtime fails closed before metadata lookup or HTML writes.
- Use this README for stack-local prerequisites and commands only.
