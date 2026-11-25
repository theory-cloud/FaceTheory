---
title: Resource Naming
---

FaceTheory's reference stacks now name every AWS resource they create through
AppTheory's [resource-naming contract](#the-contract)
(`theorycloud_resource_naming.v0.1`, shipped in `@theory-cloud/apptheory-cdk`
7.5.0). Before this, a FaceTheory site's names came from CloudFormation
generation and from the stack name, so two FaceTheory sites — or a FaceTheory
site and any other Theory Cloud app — could collide on the account's shared
namespaces, and no name was reviewable in a template diff.

This page states what changed, resource by resource, which resources an existing
deployment replaces, and the two upgrade paths. Read it before deploying any
stack that was synthesized from an earlier FaceTheory release.

## The contract

The contract binds a small, explicit context and derives every physical name from
it:

| Input | Meaning | FaceTheory reference value |
| --- | --- | --- |
| `namespace` | Namespace segment | `theorycloud` (the contract default) |
| `app` | App instance id | `facetheory-ssr-site`, `facetheory-ssg-isr` |
| `stage` | Stage id, up to 8 characters | `lab` |
| `account` | Twelve-digit account id | placeholder `000000000000` — set your own |
| `region` | Region code | `us-east-1` |
| `logicalName` | The site's logical name | `site` |

The context is **stage config, not operator environment**: each reference stack
carries the values in `src/stage-config.ts`, and synthesis binds names from that
record only. No environment variable can change a physical name, and the same
config synthesizes the same template on any machine.

Two profiles sit on top of the context:

- **Naming profile** — `derived` names every resource from the context; `legacy`
  takes each name from a `pins` entry (verbatim) or a `generated` entry (no name
  set, so CloudFormation keeps today's name).
- **Logging profile** — `standard` gives CloudFront access logs a
  contract-named CloudWatch Logs delivery; `legacy` keeps each construct's
  pre-contract logging behaviour.

The reference stacks ship `derived` + `standard`. Both profiles are reachable
from the same config record, which is what makes the [replacement-free upgrade
path](#path-b-keep-todays-names) possible.

## Derived names and the upgrade consequence

The values below are what the committed reference config synthesizes. A
deployment with a different `app`, `stage`, account or region derives the
corresponding name from the same rules.

### `infra/apptheory-ssr-site`

| Resource | Before | After | Upgrade consequence |
| --- | --- | --- | --- |
| Assets bucket | CloudFormation-generated name (`<stack>-assetsbucket-<hash>-<suffix>`) | prefix `facetheory-ssr-site-lab-site-assets` in the `account-regional` namespace, so the deployed name is `facetheory-ssr-site-lab-site-assets-<account>-<region>-an` | **Replaced.** S3 cannot rename a bucket. The new bucket starts empty and the deploy re-uploads assets, the Vite manifest and the SSG hydration data. |
| CloudFront access-log bucket | CloudFormation-generated S3 bucket, prefix `cloudfront/` | *not created* | **Removed.** CloudFront no longer writes S3 access logs; its logs move to the log group below. Anything already in that bucket is deleted with the resource unless you copy it out first. |
| CloudFront access logs | S3 objects under the log bucket | CloudWatch Logs group `theorycloud_theorycloud_facetheory-ssr-site_lab_logs_access_cdn_site`, retained 30 days | **New destination.** Query logs with CloudWatch Logs Insights. The contract's fixed `theorycloud_` log prefix plus the configured namespace repeats that literal once. |
| Log delivery source / destination | *absent* | `facetheory-ssr-site-lab-logs-access-cdn-site` | **New.** CloudFront vended delivery (`ACCESS_LOGS`, `json`, the contract's record fields). |
| Distribution root object | not set | still not set | **Unchanged, deliberately.** In `ssr-only` a default root object would rewrite `/` onto the function URL, so the contract sets none. |
| Lambda function | CloudFormation-generated name | CloudFormation-generated name | **Unchanged.** No construct sets a function name: a generated name cannot collide, and naming the function would replace it and with it the Function URL the distribution targets. |

### `infra/apptheory-ssg-isr-site`

| Resource | Before | After | Upgrade consequence |
| --- | --- | --- | --- |
| Assets bucket | CloudFormation-generated name | prefix `facetheory-ssg-isr-lab-site-assets` (account-regional) | **Replaced**, as above; the deploy re-uploads assets, manifest and sidecars. |
| ISR html store bucket | CloudFormation-generated name | prefix `facetheory-ssg-isr-lab-site-aatexg6p` (account-regional) | **Replaced.** The logical `site-html-store` pushes `facetheory-ssg-isr-lab-site-html-store` (38 characters) past the contract's 63-character budget once the 26-character account-regional suffix is reserved, so the contract's `shorten` rule keeps the head and appends an 8-character digest. The new bucket starts empty; the deploy re-uploads the pre-rendered SSG HTML, and ISR entries regenerate on demand. |
| ISR metadata table | `<stack-name>-facetheory-cache` | `facetheory-ssg-isr-lab-site-isr-metadata` | **Replaced.** The table holds ISR cache metadata and regeneration leases, which are derivable state: the first request per cache key regenerates. Point-in-time recovery was already on and stays on; `DeletionProtectionEnabled` is now explicit (`false`, because the table is `DESTROY`). |
| CloudFront access-log bucket | CloudFormation-generated S3 bucket | *not created* | **Removed**, as above. |
| CloudFront access logs | S3 objects | log group `theorycloud_theorycloud_facetheory-ssg-isr_lab_logs_access_cdn_site` | **New destination**, 30-day retention. |
| Log delivery source / destination | *absent* | `facetheory-ssg-isr-lab-logs-access-cdn-site` | **New.** |
| Distribution root object | not set | `index.html` | **Behaviour change.** `/` is served from the S3 html store (`isr/index.html`) instead of falling through the origin group to the Lambda origin. A miss still fails over on 403/404, so a deployment that does not ship `index.html` keeps the SSR render at `/`. |
| Lambda function | CloudFormation-generated name | CloudFormation-generated name | **Unchanged**, as above. |

### What "replaced" means for the serving path

A replacement is visible as a brief window where the new bucket or table exists
and holds nothing. On the SSG+ISR stack that window shows up as ISR misses that
regenerate, and as SSG HTML that is absent until the deploy's bucket deployments
finish. Nothing renders a blank page: the CloudFront origin group still fails
over to the Lambda origin on an S3 403/404. The CloudFront distribution itself is
updated in place — only its origin bucket references, `Logging` block and
`DefaultRootObject` change.

The stack is also **environment-bound** now: it takes its account and region from
the stage config because the standard logging profile can only prove the
CloudFront delivery is in `us-east-1`. Two consequences:

1. Set `account` in `src/stage-config.ts` before deploying. The committed value
   is a placeholder (`000000000000`), which fails closed at AssumeRole instead of
   creating resources in an unintended account.
2. The template names the CDK bootstrap asset bucket literally for that
   account and region, so bootstrap that account and region first.

## Upgrading an existing deployment

Two paths. Pick one per deployment; both are supported by the same stack code.

### Path A: accept the derived names (recommended for asset and cache state)

The replaced resources hold only regenerable state: static assets re-deployed by
the stack, pre-rendered SSG HTML re-deployed by the stack, and ISR cache metadata
and leases that regenerate per cache key. The CloudFront access-log bucket is the
one exception — S3 access logs already written there are historical records, not
regenerable.

```bash
# 1. If you need the S3 access logs already collected, copy them out first.
aws s3 sync "s3://<your-cloudfront-logs-bucket>" ./cloudfront-access-logs-archive

# 2. Set your account id in the stack's src/stage-config.ts, then deploy.
cd infra/apptheory-ssg-isr-site
npm ci
npm run test
npx cdk deploy
```

Expect CloudFormation to report *replace* for the two buckets and the table, and
*remove* for the access-log bucket. Review the change set before you approve it;
that is where the table above should match what you see.

### Path B: keep today's names

If a deployment must not replace a resource — for example a bucket that holds
objects the FaceTheory stacks did not put there — move the stage config to the
legacy profiles first. Under `legacy` no name is derived: a `pins` entry is used
verbatim and a `generated` entry sets no name, so CloudFormation keeps the
physical resource it already owns.

`src/stage-config.ts` carries both profiles, so the switch is config-only:

```ts
export const REFERENCE_STAGE_CONFIG: FaceTheoryReferenceStageConfig = {
  // …namespace, app, stage, account, region, logicalName, retentionDays…
  namingProfile: 'legacy',
  loggingProfile: 'legacy',
  pins: {
    // The ISR table name is a mandatory literal on AppTheoryDynamoTable, so a
    // `generated` entry cannot express it: pin the name the stack deployed.
    'dynamodb_table:site-isr-metadata': 'FaceTheoryAppTheorySsgIsrSite-facetheory-cache',
  },
  generated: [
    // CloudFormation generated these names, so keep generating them.
    's3_bucket:site-assets',
    's3_bucket:site-html-store',
  ],
};
```

The bucket names CloudFormation generated are not predictable from the config, so
`generated` (not `pins`) is the right entry for them; read the deployed name from
the stack's `AssetsBucketName` / `IsrBucketName` output if you need it recorded.
With `loggingProfile: legacy` the construct creates the S3 access-log bucket
again and sets the distribution's `Logging` block, so no log destination moves
and no log data is lost.

The template still changes: the stack is environment-bound now (see above), so
`cdk diff` shows the CDK asset-bucket literal and the stack's account/region
binding. What stays fixed is every *physical resource name* — no bucket, table or
distribution is replaced.

Then cut over to the derived profile at a maintenance window you choose: drop the
profiles and the entries above, review the change set, and accept the
replacements Path A describes.

> **Do not** pin a *derived* name and then also expect a replacement-free cutover.
> A pin is a literal: pointing it at the derived value (`<app>-<stage>-<logical>`
> in the account-regional namespace) still replaces the bucket, because the
> deployed resource is still the one CloudFormation generated.

## Rules this adoption keeps

- **No construct takes a hand-built name.** Under a naming context AppTheory
  refuses `bucketName`, `bucketNamePrefix`, `bucketNamespace`, `isrMetadataTableName`
  and `cacheTableName`; the values come from derivation, a pin, or a generated
  entry only.
- **One source of truth per name.** The FaceTheory stacks create the buckets and
  the table themselves, so they name those resources and pass the resources to
  `AppTheorySsrSite`; the construct consumes no entry for a caller-owned
  resource. The ISR table uses the same `{logicalName}-isr-metadata` entry the
  construct would consume if it created the table, so a later move to
  construct-owned resources keeps one name.
- **Two sites, one account, no collisions.** The naming tests synthesize two
  stacks in one account with different app ids and different stages and assert
  the derived name sets are disjoint, and that derivation is deterministic.
- **AWS stays visible.** These are AWS names — CloudFront, S3, Lambda, DynamoDB
  through TableTheory — not an abstraction over them. The contract is AppTheory's,
  and FaceTheory consumes it rather than re-implementing it.

## Not in scope

- The generated starter app (`create-facetheory-app`) still lets CloudFormation
  generate its bucket name. A generated name cannot collide, and a scaffold that
  demanded a twelve-digit account id before `cdk synth` would be a worse
  starting point. Adopt a naming context when you copy the stack.
- S3 server access logging (`serverAccessLogsBucket`) stays opt-in: a log target
  costs money, and the contract gives the target bucket no naming entry.
- Anything outside `us-east-1` under the standard logging profile is out of the
  contract's v0.1 scope, and synthesis fails rather than creating a delivery that
  cannot receive CloudFront logs.

Read [AWS Deployment Shape](/aws-deployment-shape/) for the edge topology and
[CDK And AWS Notes](/cdk/) for the step-by-step wiring.
