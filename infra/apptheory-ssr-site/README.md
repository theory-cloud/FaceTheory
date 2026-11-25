# FaceTheory Deployment Infra Example

This folder contains a code-local reference stack for CloudFront plus S3 plus Lambda Function URL SSR using `@theory-cloud/apptheory-cdk`.

Canonical operator guidance lives under [`../../docs/cdk/README.md`](../../docs/cdk/README.md). The resource names this
stack derives, and what an existing deployment experiences on upgrade, are documented in
[Resource Naming](../../docs/features/resource-naming.md).

## What This Stack Provisions

- private S3 storage for assets
- Lambda Function URL origin with response streaming and explicit `AWS_IAM` auth
- CloudFront behaviors for assets, Vite manifests, SSG hydration data, SSR hydration sidecars, and SSR HTML

## Resource Naming

Every physical name comes from AppTheory's `theorycloud_resource_naming.v0.1` contract, bound from
[`src/stage-config.ts`](src/stage-config.ts) — stage config, never an operator environment variable. With the committed
config (`app: facetheory-ssr-site`, `stage: lab`, `region: us-east-1`) the stack derives:

| Resource | Name |
| --- | --- |
| Assets bucket | prefix `facetheory-ssr-site-lab-site-assets` in the `account-regional` namespace, so `facetheory-ssr-site-lab-site-assets-<account>-<region>-an` |
| CloudFront access-log group | `theorycloud_theorycloud_facetheory-ssr-site_lab_logs_access_cdn_site`, 30-day retention |
| Log delivery source and destination | `facetheory-ssr-site-lab-logs-access-cdn-site` |
| Lambda function | CloudFormation-generated (no construct here sets a function name) |

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
It also assumes a config that synthesizes and does not validate one — a pinned legacy site bucket is compared while the
stack refuses that pin — so run `cdk synth` (or construct the stack) on each config first, and do not read an empty
comparison from a config the stack refuses as an all-clear.

Set `account` in `src/stage-config.ts` to your twelve-digit account id before deploying: the committed value is a
placeholder, and the stack is environment-bound because the standard logging profile can only prove the CloudFront
delivery lives in `us-east-1`.

The first deploy after this change **replaces** the assets bucket (S3 cannot rename a bucket) and **removes** the
per-stack S3 access-log bucket, and assets are re-uploaded by the stack's bucket deployment. Both buckets are `Delete`
with an auto-delete custom resource, so the deploy empties them before deleting them: if either holds an object this
stack did not write, stay on the legacy profiles unless that object has a restore destination no deployment prunes or
overwrites — the immutable `assets/` deployment prunes its prefix, so a copy put back under `assets/` is deleted at the
next deploy. See
[where a restored object survives the deploy](../../docs/features/resource-naming.md#where-a-restored-object-survives-the-deploy)
and
[the stop condition](../../docs/features/resource-naming.md#stop-keep-path-b-when-a-site-bucket-holds-objects-these-stacks-did-not-write).
If a deployment must keep today's resources — names and CloudFormation logical IDs both — move the config to the legacy
naming and logging profiles first — see
[Resource Naming](../../docs/features/resource-naming.md#path-b-keep-todays-resources).

## Local Commands

```bash
cd infra/apptheory-ssr-site
npm ci
npm test
```

`./.npmrc` sets npm's `allow-remote=root` policy for npm 12 compatibility
(npm 12 defaults to `allow-remote=none` and refuses the pinned
AppTheory/TableTheory release-tarball dependencies with EALLOWREMOTE).
That is intentionally narrower than `all`: only the URL dependencies
declared by this package's `package.json` may be fetched.

Update the template snapshot:

```bash
npm run test:update
```

Synthesize:

```bash
npm run synth
```

## Local Run

`make examples-local ONLY=infra/apptheory-ssr-site#local-run` synthesizes this
stack with its own CDK CLI (`aws-cdk`, installed by `npm ci`), runs the SSR
function in the digest-pinned official Lambda Node image and serves the
synthesized CloudFront distribution through the released AppTheory local gateway
(`apptheory-local`, installed from the tag pinned in
`scripts/local/examples-local.json` with
`go install github.com/theory-cloud/apptheory/v7/cmd/apptheory-local@v7.5.0`) on
`http://127.0.0.1:8241`, the CloudFront listener one port above the row's
`--port-base 8240`. AppTheory's
[`docs/examples/local-runner.md`](https://github.com/theory-cloud/AppTheory/blob/v7.5.0/docs/examples/local-runner.md#declared-ports)
fixes that order: a run binds its public surfaces from `--port-base + index`,
Function URLs before CloudFront distributions, so the `AWS_IAM` Function URL
takes `8240` and refuses unsigned viewer requests. The row asserts the SSR HTML
from the Function URL origin, `/assets/*` and the Vite manifest from the S3 origin, the SSG data path,
a 403 missing asset and the handler's 404. It also proves CloudFront caching:
`/assets/entry.css` misses then hits with `x-cache: Hit from cloudfront` and an
`age`, an invalidation removes it, and the `CACHING_DISABLED` SSR behavior
reaches the origin on every request; the SSR stream reaches the viewer chunk by
chunk. The reference `/` page paces its two parts 200 ms apart so incremental
delivery is observable through the local gateway; deployers may remove that
pause. The row is class L2; the edge network/TLS (a docs/125 true limit), IAM
policy evaluation, S3 bucket policies/CORS and viewer protocol enforcement are
the named gaps. The stack configures no custom error responses.

The manifest, Vite manifest and SSG data deployments share the assets bucket
root with the prefix-scoped assets deployment. A root prune would delete the
other deployments' objects, so the two root deployments set `prune: false` and
the snapshot test pins that. The assets deployment still prunes stale objects
under `assets/`.

## Deployment Notes

- Deploy and smoke-test instructions should follow the canonical AWS docs first.
- Keep SSG strict-CSP sidecars (`/_facetheory/data/*`) on S3/static behaviors.
- Route SSR runtime hydration sidecars (`/_facetheory/ssr-data/*`) to the same Lambda/FaceApp handler that rendered the
  SSR HTML; do not point that prefix at S3.
- This reference stack intentionally does **not** forward viewer-supplied tenant headers such as `x-facetheory-tenant`.
- Same-origin mutating form actions belong on the Lambda/AppTheory path with `AWS_IAM` + CloudFront OAC intact. Mark
  URL-encoded forms with `data-facetheory-oac-form` and install `startAwsOacFormTransport()` rather than posting
  directly to the Function URL or weakening Function URL auth.
- Use this README for stack-local commands and folder context only.
