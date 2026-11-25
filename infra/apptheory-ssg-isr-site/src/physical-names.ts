import { AppTheoryResourceNaming } from '@theory-cloud/apptheory-cdk';
import type { AppTheoryNamingContextValues } from '@theory-cloud/apptheory-cdk';

import {
  REFERENCE_STAGE_CONFIG,
  stageNamingValues,
  type FaceTheoryReferenceStageConfig,
} from './stage-config.js';

/**
 * One distinct physical name this stack asks the naming contract for.
 */
export interface FaceTheoryDerivedPhysicalName {
  /**
   * The contract entry, `{type}:{logical}` — the key a `pins` or `generated`
   * entry in the stage config uses.
   */
  readonly entry: string;

  /**
   * The name the stack sets for that entry, or `undefined` when the stage config
   * leaves the name to CloudFormation (a `generated` entry, legacy naming profile
   * only).
   *
   * For a bucket this is the derived prefix — the template's `BucketNamePrefix`.
   * CloudFormation then appends `-<account>-<region>-an`, a suffix every site in one
   * account and region shares, so two prefixes in one account and region are equal
   * exactly when the two bucket names are. Compare sites destined for the same
   * account and region; in different ones the suffix alone keeps the names apart.
   */
  readonly name: string | undefined;

  /**
   * Whether the stage config lists this entry in `generated`, so CloudFormation
   * names the resource and the config carries no name for it.
   *
   * A generated entry has nothing to compare: the deployed name is only visible in
   * the account (read it from the stack's `AssetsBucketName` / `IsrBucketName`
   * output). `sharedPhysicalNames` therefore skips it rather than reporting a
   * match it cannot see.
   */
  readonly generated: boolean;
}

function entryName(
  values: AppTheoryNamingContextValues,
  type: string,
  logical: string,
): FaceTheoryDerivedPhysicalName {
  const composed = AppTheoryResourceNaming.physicalName(values, type, logical);
  const generated = composed.generated === true;
  return {
    entry: `${type}:${logical}`,
    // A bucket name is a prefix plus the account-regional namespace CloudFormation
    // appends, and the template sets the prefix, so that is what is compared.
    name: generated ? undefined : composed.bucketNamePrefix ?? composed.name,
    generated,
  };
}

/**
 * Every physical name this stack's stage config names, one entry per contract
 * entry the stack consumes under that config.
 *
 * Compare the complete list against another site's before deploying both into one
 * account (`docs/features/resource-naming.md`). Comparing one entry — the assets
 * bucket prefix, say — is not the same check: the sites can differ there and still
 * compose the same name for another entry, because the contract shortens names
 * that exceed a type's length budget.
 *
 * The list accepts both profiles the stage config can carry:
 *
 * - **`derived` + `standard`** — the committed reference config. Every entry has a
 *   derived name, and the log group and log delivery are included because the
 *   standard logging profile creates them.
 * - **`legacy` + `legacy`** — the documented Path B migration config. The legacy
 *   logging profile keeps the construct's S3 access-log bucket, so the config
 *   consumes no log entry and none is listed. The two `generated` bucket entries
 *   come back with `name: undefined` (CloudFormation owns those names) and the
 *   pinned ISR table comes back as the literal it is.
 *
 * A legacy config that leaves a consumed entry with neither a pin nor a generated
 * entry is not comparable at all — the contract refuses to compose a name for it
 * and the stack refuses to synthesize — so the contract's own error is what this
 * function raises, rather than a silent gap in the list. That is why the ISR table
 * needs a pin under the legacy profile: `AppTheoryDynamoTable` takes a physical
 * `tableName`, so `src/stack.ts` refuses a `generated` entry for it.
 *
 * The names are the ones this stack's own template sets, and
 * `test/unit/resource-naming.test.ts` pins this list against a synthesized
 * template, so the list cannot drift from what the stack deploys.
 */
export function derivedPhysicalNames(
  config: FaceTheoryReferenceStageConfig = REFERENCE_STAGE_CONFIG,
): readonly FaceTheoryDerivedPhysicalName[] {
  const values = stageNamingValues(config);
  const logical = config.logicalName;

  const names: FaceTheoryDerivedPhysicalName[] = [
    entryName(values, 's3_bucket', `${logical}-assets`),
    // The committed logical name pushes this entry past the contract's
    // 63-character bucket budget, so the contract shortens it: the derived name is
    // the head plus an 8-character digest (`facetheory-ssg-isr-lab-site-aatexg6p`).
    // A shortened name is exactly the kind that can equal another site's valid
    // unshortened name, which is why the whole list is compared and not one entry.
    entryName(values, 's3_bucket', `${logical}-html-store`),
    entryName(values, 'dynamodb_table', `${logical}-isr-metadata`),
  ];

  if (config.loggingProfile !== 'standard') {
    return names;
  }

  // CloudFront access logging hangs off one logical source per site. A `/` inside
  // it is legal and the contract maps it per type: `_` inside a log group name,
  // `-` inside a log delivery name.
  const logSource = `logs/access/cdn/${logical}`;
  names.push(
    entryName(values, 'log_group', logSource),
    entryName(values, 'log_delivery_source', logSource),
    entryName(values, 'log_delivery_destination', logSource),
  );
  return names;
}

function typeOf(entry: string): string {
  return entry.slice(0, entry.indexOf(':'));
}

function comparableName(entry: FaceTheoryDerivedPhysicalName): string | undefined {
  return entry.generated ? undefined : entry.name;
}

/**
 * The names two sites would share, as `{type}: {name}`.
 *
 * Only like types are compared: a bucket name, a table name and a log delivery
 * name live in three different namespaces, so equal strings across two of them are
 * not a collision. A `generated` entry has no name in the config to collide on and
 * is skipped.
 *
 * What the result does and does not say:
 *
 * - It reports a shared name for **the two configs it was given**. Both of the
 *   contract's known collision classes compose real names that land in these two
 *   lists, so an affected pair is reported here: the separator ambiguity
 *   (`app: shop` + logical `lab-site` against `app: shop-lab` + logical `site`)
 *   and an over-budget shortened name that equals another site's valid unshortened
 *   name. `test/unit/naming-limits.test.ts` pins both classes through this
 *   function.
 * - It never inspects the deployed account. A name a third site already owns, a
 *   name an earlier deployment still holds, or a `generated` bucket's real name are
 *   all invisible to it, so an empty result is evidence about these two configs
 *   and not a proof that the account is collision-free. Whether two app ids may
 *   share an account at all is the registry question the Factory resource-naming
 *   contract (`docs/155`) scopes.
 */
export function sharedPhysicalNames(
  a: readonly FaceTheoryDerivedPhysicalName[],
  b: readonly FaceTheoryDerivedPhysicalName[],
): readonly string[] {
  const shared = new Set<string>();
  for (const left of a) {
    const leftName = comparableName(left);
    if (leftName === undefined) continue;
    for (const right of b) {
      if (comparableName(right) !== leftName || typeOf(right.entry) !== typeOf(left.entry)) continue;
      shared.add(`${typeOf(left.entry)}: ${leftName}`);
    }
  }
  return [...shared].sort();
}
