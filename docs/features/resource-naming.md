---
title: Resource Naming
---

FaceTheory's reference stacks now name every AWS resource they create through
AppTheory's [resource-naming contract](#the-contract)
(`theorycloud_resource_naming.v0.1`, shipped in `@theory-cloud/apptheory-cdk`
7.5.0). Before this, a FaceTheory site's names came from CloudFormation
generation and from the stack name: no name was reviewable in a template diff,
and nothing in the template said which other deployment could collide with it.
Names are now derived from stage config, so a reviewer can read them and compare
them against the deployments that share an account.

Deriving a name is not the same as proving two deployments in one account can
never collide, and **FaceTheory does not claim that today.** FaceTheory derives
every name through AppTheory's contract and adds no naming rule of its own.
Cross-site uniqueness within one account is governed by the Factory resource-naming
contract — [the separator finding,
`docs/155`](https://github.com/theory-cloud/factory/blob/staging/docs/155-resource-naming-separator-ambiguity-scoped-need-2026-11-25.md),
and [the contract itself,
`contracts/resource-naming`](https://github.com/theory-cloud/factory/blob/staging/contracts/resource-naming/v0.1/README.md)
— and it is not guaranteed by FaceTheory today. The owned classes are the two
known limits below: [separator
ambiguity](#known-limit-the-separator-is-ambiguous) and [a shortened name that
equals a valid name](#known-limit-a-shortened-name-can-equal-a-valid-name).

What you have in the meantime is an exact check on the names the two configs
derive: [compare the complete name sets of both
sites](#check-two-sites-before-they-share-an-account) before they share an
account. Hand it the pair that one of the limits above affects and it **reports
the collision** — both classes compose ordinary names that land in the two lists
it compares, and a test pins each one through it. What it cannot do is inspect
the deployed account: it compares the two stage configs you give it, so a name a
third site or an earlier deployment already owns is invisible to it, which is
why the two limits stay open until the contract closes them.

This page states what changed, resource by resource, which resources an existing
deployment replaces, which path keeps them, the stop condition before a cutover,
and the two limits above. Read it before deploying any stack that was synthesized
from an earlier FaceTheory release.

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
path](#path-b-keep-todays-resources) possible.

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
| Lambda function | CloudFormation-generated name | CloudFormation-generated name | **Unchanged.** No construct sets a function name. CloudFormation derives the name from the stack name plus its own unique suffix, so no two stacks in one account share it, and setting a name of our own would replace the function — and with it the Function URL the distribution targets. |

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

Path A is safe for what these stacks put in those resources themselves: static
assets, the Vite manifest and the SSG sidecars are re-uploaded by the deploy,
pre-rendered SSG HTML is re-uploaded, and ISR cache metadata and regeneration
leases regenerate per cache key.

It is not safe for anything else in them. S3 access logs already written are
historical records, and an object an operator or another pipeline put in a site
bucket is not regenerable at all. Read [the stop
condition](#stop-keep-path-b-when-a-site-bucket-holds-objects-these-stacks-did-not-write)
before you approve this change set: the deploy empties and deletes those buckets,
and a maintenance window only chooses when.

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

### Path B: keep today's resources

If a deployment must not replace a resource — for example a bucket that holds
objects the FaceTheory stacks did not put there — move the stage config to the
legacy profiles first. Under `legacy` no name is derived and no construct level
moves, so the physical names **and** the CloudFormation logical IDs stay where
the deployment already has them: `cdk diff` shows no replacement and no removal
for the buckets, the table or the distribution — in fact their properties are
unchanged, so CloudFormation may report them as no change at all — and nothing
data-bearing is deleted.

Both halves matter. CloudFormation keys a resource on its logical ID, and CDK
derives that ID from the construct path, so putting the same bucket one construct
deeper renames the logical ID (`AssetsBucket5CB76180` becomes
`AssetsBucket0481D73F`). CloudFormation then treats the pair as a *different*
resource: it creates the new bucket and deletes the old one with the objects in
it — and the auto-delete custom resource with it — even though no `BucketName` is
set. A legacy path that only suppressed the name property would still destroy the
bucket, so on this profile the stack creates each site bucket with the
pre-contract construct shape and no name property at all. The result is committed
as a snapshot: `test/__snapshots__/ssr-site-stack.legacy.template.json` and
`…/ssg-isr-site-stack.legacy.template.json`, and
`test/unit/legacy-preservation.test.ts` pins the logical IDs by name.

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

> **Do not** pin one of these buckets. A pin is a literal name, and setting
> `BucketName` on a bucket CloudFormation named is a replacement — the same
> delete as Path A, with none of Path A's warnings. The stack refuses it: a `pins`
> entry for `s3_bucket:<logical>` fails synthesis and says to use a `generated`
> entry instead.

With `loggingProfile: legacy` the construct creates the S3 access-log bucket
again and sets the distribution's `Logging` block, so no log destination moves
and no log data is lost. The stack then exports `AccessLogsBucketName` — the
bucket CloudFront actually writes to — instead of `AccessLogGroupName`, which
would have named a log group this profile does not create.

The template still changes, but only outside the deployed resources: the stack is
environment-bound now (see above), so `cdk diff` shows the CDK asset-bucket
literal and the stack's account/region binding, and the new
`AccessLogsBucketName` output appears. No bucket, table or distribution is
replaced or removed.

Then cut over to the derived profile in a window you choose — but only after the
stop condition below, which is about what is in the buckets rather than when the
window falls.

> **Do not** pin a *derived* name and then also expect a replacement-free cutover.
> A pin is a literal: pointing it at the derived value (`<app>-<stage>-<logical>`
> in the account-regional namespace) still replaces the bucket, because the
> deployed resource is still the one CloudFormation generated.

### STOP: keep Path B when a site bucket holds objects these stacks did not write

The cutover is not a rename. It replaces the site buckets and the ISR table and
removes the CloudFront S3 access-log bucket, and CloudFormation deletes each
removed bucket with its contents. These are the resources the change set removes,
by CloudFormation logical ID; `test/unit/legacy-preservation.test.ts` in each stack
pins its list against the two synthesized templates, so the guide and the template
agree.

`infra/apptheory-ssr-site` removes six:

| Logical ID | What it is | What the cutover does |
| --- | --- | --- |
| `AssetsBucket5CB76180` | the site assets bucket, `DeletionPolicy: Delete`, `UpdateReplacePolicy: Delete` | replaced by `AssetsBucket0481D73F`; the old bucket is **emptied and deleted** |
| `AssetsBucketAutoDeleteObjectsCustomResource51BA1286` | that bucket's `Custom::S3AutoDeleteObjects` | removed with it — this is what empties the bucket |
| `AssetsBucketPolicyFFACF6C4` | its bucket policy | removed with it |
| `SiteCloudFrontLogsBucketF9C1CD02` | the CloudFront S3 access-log bucket, `Delete` / `Delete` | **not created** under the standard logging profile; emptied and deleted |
| `SiteCloudFrontLogsBucketAutoDeleteObjectsCustomResource016FEC8F` | its auto-delete custom resource | removed with it |
| `SiteCloudFrontLogsBucketPolicy816DFF56` | its bucket policy | removed with it |

`infra/apptheory-ssg-isr-site` removes those six and three more:

| Logical ID | What it is | What the cutover does |
| --- | --- | --- |
| `IsrBucketCAA25890` | the S3 html store holding the pre-rendered SSG HTML, `Delete` / `Delete` | replaced by `IsrBucket9673BF26`; the old bucket is **emptied and deleted** |
| `IsrBucketAutoDeleteObjectsCustomResourceD92212A8` | its auto-delete custom resource | removed with it |
| `IsrBucketPolicy39B2E35A` | its bucket policy | removed with it |

It also replaces one resource the change set does not report as removed: the ISR
metadata table keeps its logical ID (`CacheTableCDD8F844`) but changes its name,
and the table is `DESTROY`, so CloudFormation replaces it and the old table — ISR
cache entries and regeneration leases — is deleted. That state is derivable, and
the first request per cache key regenerates it. Everything else in both templates
is updated in place or added: the distribution, the bucket deployments, the
`SiteCdnLoggingDelivery*` resources and the log group.

So the stop condition is about the buckets:

> **Stay on Path B** if any of the removed buckets holds an object these stacks did
> not write — an operator upload, a redirect file, a manual archive, an artifact
> another pipeline puts there — **unless that object has a restore destination no
> deployment prunes or overwrites** (see below). Copying an object out and putting it
> back at the same key is **not** enough on its own: the deploy manages part of every
> one of these buckets, so a restore under a stack-managed key is a second copy
> waiting to be lost. Treat the copy as part of the change you approve. A maintenance
> window does not preserve anything; it only picks the moment the old resources are
> deleted.

#### Where a restored object survives the deploy

Each stack deploys assets into the same buckets that hold the site's content, and one
of those deployments prunes. `prune: false` only writes, so an object the deployment
did not put there survives unless its key is one the deployment ships. `prune: true`
deletes every object under the deployment's prefix that its source does not contain.

| Bucket | Prefix | Deployment | `prune` | A foreign object at that prefix |
| --- | --- | --- | --- | --- |
| site assets (both stacks) | `assets/` | `AssetsDeploymentImmutable` | **`true`** | **deleted by the next deployment**, whatever its key |
| site assets (both stacks) | bucket root | `AssetsDeploymentManifest` | `false` | kept, unless its key is one the deployment ships (`.vite/manifest.json`) |
| site assets (SSR) | bucket root | `AssetsDeploymentSsgData` | `false` | kept, unless its key is one the deployment ships (the SSG hydration data) |
| site assets (SSG+ISR) | `_facetheory/data/` | `AssetsDeploymentSsgSidecars` | `false` | kept, unless its key is one the deployment ships |
| ISR html store (SSG+ISR) | `isr/` | `AssetsDeploymentSsg` | `false` | kept, unless its key is one the deployment ships or the ISR runtime writes |

`test/unit/bucket-deployment-pruning.test.ts` in each stack pins that table against
the synthesized templates — the immutable `assets/` deployment is the only one with
`prune: true`, and it stays that way — so a change that starts pruning a prefix this
page calls safe fails the suite.

What that means for a restore:

- **`assets/` is the prefix that is lost.** It holds build output the deploy owns, so
  an object restored there is deleted at the next deployment whatever its key. If a
  file must be served from the site's asset path, add it to the asset source and let
  the deploy ship it; do not restore it by hand.
- **A restored object is safe only at a key no deployment ships and no runtime
  writes.** Operator objects belong under a prefix of your own (for example
  `operator/`) in the derived bucket, which no deployment targets and no ISR cache
  key uses, or in a bucket these stacks do not manage at all. Bucket root and `isr/`
  survive pruning, but a key the build or the ISR runtime writes is overwritten on
  the next deploy or request, so the same key is not a place to park anything.
- **If the object has no such destination, the answer is still to stay on Path B.**
  The copy-out is a step, not the exception.

## Known limits of the contract

Two collision classes stay open. Both belong to `theorycloud_resource_naming.v0.1`
and to the Factory contract that owns it; FaceTheory derives names through the
contract, reports what it derives, and adds no rule of its own. Each class is
pinned by a test, so each flips when the contract changes.

### Known limit: the separator is ambiguous

The contract composes a derived name as `<app>-<stage>-<logical>`, joined with
`-`. The result does not record where one segment ends and the next begins, so two
different contexts can compose the same string:

| Context | Bucket prefix for the site's assets bucket |
| --- | --- |
| app `shop`, `logicalName` `lab-site` | `shop-lab-lab-site-assets` |
| app `shop-lab`, `logicalName` `site` | `shop-lab-lab-site-assets` |

Both stacks in that example derive the same assets prefix, and the SSG+ISR pair
also shares its html store prefix and its ISR metadata table name.

Ownership is Factory's, not FaceTheory's.
[`docs/155`](https://github.com/theory-cloud/factory/blob/staging/docs/155-resource-naming-separator-ambiguity-scoped-need-2026-11-25.md)
scopes the fix as validation plus registry enforcement rather than a change to the
derivation, because changing the composition would rename live resources — a
replacement of data-bearing buckets and tables. The proposed rule is that no
registered app id may be a hyphen-prefix of another in one account (`shop` and
`shop-lab` could not both be bound to it), enforced when an application is bound to
an account. That work is in plan gate and nothing enforces it today. FaceTheory
neither enforces it nor re-implements the composition, so no FaceTheory change can
close this class. `infra/*/test/unit/naming-limits.test.ts` pins the collision, so
the day the contract encodes its segment boundaries that test fails and this
section goes away with it.

### Known limit: a shortened name can equal a valid name

Every contract type has a length budget: 63 characters for a bucket name — 37 for
its prefix, because the account-regional suffix reserves 26 — and 60 for a log
delivery source or destination. A longer name is shortened to its head plus an
8-character digest, and the shortened result is itself a valid name, so it can equal
a *different* site's name that fits the budget:

| Context | `log_delivery_source` name |
| --- | --- |
| app `shop`, `logicalName` `storefront-collection-renderer-marketing-edition-renewal-page` | `shop-lab-logs-access-cdn-storefront-collection-rend-ofrzmlkx` (shortened) |
| app `shop`, `logicalName` `storefront-collection-rend-ofrzmlkx` | `shop-lab-logs-access-cdn-storefront-collection-rend-ofrzmlkx` (literal) |

Their assets bucket prefixes differ — `shop-lab-storefront-collecti-ym46aa3g` and
`shop-lab-storefront-collecti-wk2yjkkp` — so a check that compared that one entry
would pass while the second deploy collided on a name AWS does not treat as
shareable. `docs/155` scopes this class as well: the registry check refuses a
binding whose shortened names equal a shortened name already derived in the
account, and the contract states the residual for an app that does not go through
the registry. None of it is in force yet.

`infra/*/test/unit/naming-limits.test.ts` pins this pair in both stacks, for the
same reason as the separator class: closing it means changing when and how the
contract shortens, which is the contract's decision and not a FaceTheory change.

## Check two sites before they share an account

Before deploying a second site into an account, compare the **complete** set of
names the two stage configs derive — every bucket prefix, the ISR table, the log
group, and the log delivery source and destination. Both reference stacks ship that
list, so the check is the code that deploys them rather than a second
implementation of the composition:

```ts
// infra/apptheory-ssr-site/ — the same module exists in infra/apptheory-ssg-isr-site/
import { REFERENCE_STAGE_CONFIG } from './src/stage-config.js';
import { derivedPhysicalNames, sharedPhysicalNames } from './src/physical-names.js';

const siteA = derivedPhysicalNames({ ...REFERENCE_STAGE_CONFIG, app: 'shop', logicalName: 'lab-site' });
const siteB = derivedPhysicalNames({ ...REFERENCE_STAGE_CONFIG, app: 'shop-lab', logicalName: 'site' });

sharedPhysicalNames(siteA, siteB);
// ['s3_bucket: shop-lab-lab-site-assets'] — one of the two must change before it deploys
```

`src/physical-names.ts` is one `AppTheoryResourceNaming.physicalName()` call per
contract entry the stack consumes: for `infra/apptheory-ssr-site` the assets
bucket, the log group, and the log delivery source and destination; for
`infra/apptheory-ssg-isr-site` those plus the html store bucket and the ISR
metadata table. `test/unit/resource-naming.test.ts` pins the list against the
synthesized template, so it is the set the stack really sets and cannot fall behind
a newly added derived resource.

The list accepts the [Path B](#path-b-keep-todays-resources) config as well, which
is what an operator on the legacy profiles runs the check with. Under the legacy
logging profile the config creates no log group and no log delivery, so those
entries are not listed; a `generated` bucket entry has **no name in the config** to
compare (read the deployed name from the stack's `AssetsBucketName` /
`IsrBucketName` output), and a `pins` entry is compared as the literal it is. A
legacy config that leaves a consumed entry with neither a pin nor a `generated`
entry cannot synthesize at all, so the check raises the contract's refusal instead
of reporting an empty result that would read as an all-clear.

A stack that is not one of these two — a copy that grew another named resource —
uses the same shape, one call per construct that consumes a contract entry:

```ts
import { AppTheoryResourceNaming } from '@theory-cloud/apptheory-cdk';
import { stageNamingValues } from './stage-config.js';

const values = stageNamingValues(config);
AppTheoryResourceNaming.physicalName(values, 's3_bucket', 'site-assets').bucketNamePrefix;
```

Four things about the answer:

- **It compares the complete derived name set of the two configs you pass.** Every
  entry the stack consumes is in the list, and a shared entry is reported with its
  type. That is what makes it a check rather than a spot check on one bucket
  prefix: in the shortened case below the two assets prefixes differ while a log
  delivery name does not.
- **It reports either known limit when the pair you pass is the affected one.** Both
  classes compose ordinary names, so they land in the two lists like any other
  collision, and `infra/*/test/unit/naming-limits.test.ts` pins the separator pair
  and the shortened pair through this function. The limits stay open because the
  contract permits them, not because the check is blind to them.
- **It does not inspect the deployed account.** It never reads AWS: a name a third
  site already owns, a name an earlier deployment still holds, and a `generated`
  bucket's real name are all invisible to it. An empty result is evidence about
  these two configs and not a proof that the account is collision-free; whether two
  app ids may share an account at all is the registry question `docs/155` scopes.
- **Compare like types, in one account and region.** A bucket name, a table name and
  a log delivery name live in three namespaces, so `sharedPhysicalNames` reports
  same-type matches only; and a bucket name is a prefix plus
  `-<account>-<region>-an`, so two sites in different accounts or regions differ by
  the suffix even when their prefixes match.

What to do in your own config while the limits are open:

- **Give each site its own `app` id** (`facetheory-ssr-site` and
  `facetheory-ssg-isr`) and use `logicalName` for what varies inside a site — the
  shape both reference stacks follow.
- **Do not put stage-shaped tokens in `app` or `logicalName`.** `app: shop-lab` at
  stage `lab` reads as three segments, which is the ambiguous case.
- **Keep `logicalName` short enough not to be shortened**, and never let one
  logical name look like another's shortened form: that is the second class.
- **Run the comparison above** instead of relying on "the app ids are different".

## Rules this adoption keeps

- **No construct takes a hand-built name.** Under a naming context AppTheory
  refuses `bucketName`, `bucketNamePrefix`, `bucketNamespace`, `isrMetadataTableName`
  and `cacheTableName`; the values come from derivation, a pin, or a generated
  entry only. The legacy path sets no name property at all, and it refuses a pin
  for a bucket exactly because that pin is a hand-built name for a resource
  CloudFormation already owns.
- **One source of truth per name.** The FaceTheory stacks create the buckets and
  the table themselves, so they name those resources and pass the resources to
  `AppTheorySsrSite`; the construct consumes no entry for a caller-owned
  resource. The ISR table uses the same `{logicalName}-isr-metadata` entry the
  construct would consume if it created the table, so a later move to
  construct-owned resources keeps one name.
- **The two reference sites do not collide.** The naming tests synthesize the two
  actual reference stacks against one account — and one app and stage with two
  different `logicalName`s — and assert the derived name sets are disjoint and that
  derivation is deterministic. That is a fact about these two committed configs,
  not a rule that holds for any two sites: the check for another pair is [the
  comparison above](#check-two-sites-before-they-share-an-account), and the two
  limits above stay open until the contract closes them.
- **AWS stays visible.** These are AWS names — CloudFront, S3, Lambda, DynamoDB
  through TableTheory — not an abstraction over them. The contract is AppTheory's,
  and FaceTheory consumes it rather than re-implementing it.

## Not in scope

- The generated starter app (`create-facetheory-app`) still lets CloudFormation
  generate its bucket name. That name is per stack, and a scaffold that demanded a
  twelve-digit account id before `cdk synth` would be a worse starting point. Adopt
  a naming context when you copy the stack.
- S3 server access logging (`serverAccessLogsBucket`) stays opt-in: a log target
  costs money, and the contract gives the target bucket no naming entry.
- Anything outside `us-east-1` under the standard logging profile is out of the
  contract's v0.1 scope, and synthesis fails rather than creating a delivery that
  cannot receive CloudFront logs.

Read [AWS Deployment Shape](/aws-deployment-shape/) for the edge topology and
[CDK And AWS Notes](/cdk/) for the step-by-step wiring.
