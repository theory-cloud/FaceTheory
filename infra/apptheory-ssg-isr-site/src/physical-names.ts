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
   * The name the stack sets for that entry, or `undefined` when the entry says
   * CloudFormation generates the name instead (legacy profile only).
   *
   * For a bucket this is the derived prefix — the template's `BucketNamePrefix`.
   * CloudFormation then appends `-<account>-<region>-an`, a suffix every site in one
   * account and region shares, so two prefixes in one account and region are equal
   * exactly when the two bucket names are. Compare sites destined for the same
   * account and region; in different ones the suffix alone keeps the names apart.
   */
  readonly name: string | undefined;
}

function entryName(
  values: AppTheoryNamingContextValues,
  type: string,
  logical: string,
): FaceTheoryDerivedPhysicalName {
  const composed = AppTheoryResourceNaming.physicalName(values, type, logical);
  return {
    entry: `${type}:${logical}`,
    // A bucket name is a prefix plus the account-regional namespace CloudFormation
    // appends, and the template sets the prefix, so that is what is compared.
    name: composed.bucketNamePrefix ?? composed.name,
  };
}

/**
 * Every physical name this stack derives, one entry per contract entry it
 * consumes.
 *
 * Compare the complete list against another site's before deploying both into one
 * account (`docs/features/resource-naming.md`). Comparing one entry — the assets
 * bucket prefix, say — is not the same check: the sites can differ there and still
 * compose the same name for another entry, because the contract shortens names
 * that exceed a type's length budget.
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

  // CloudFront access logging hangs off one logical source per site. A `/` inside
  // it is legal and the contract maps it per type: `_` inside a log group name,
  // `-` inside a log delivery name.
  const logSource = `logs/access/cdn/${logical}`;

  return [
    entryName(values, 's3_bucket', `${logical}-assets`),
    // The committed logical name pushes this entry past the contract's
    // 63-character bucket budget, so the contract shortens it: the derived name is
    // the head plus an 8-character digest (`facetheory-ssg-isr-lab-site-aatexg6p`).
    // A shortened name is exactly the kind that can equal another site's valid
    // unshortened name, which is why the whole list is compared and not one entry.
    entryName(values, 's3_bucket', `${logical}-html-store`),
    entryName(values, 'dynamodb_table', `${logical}-isr-metadata`),
    entryName(values, 'log_group', logSource),
    entryName(values, 'log_delivery_source', logSource),
    entryName(values, 'log_delivery_destination', logSource),
  ];
}

function typeOf(entry: string): string {
  return entry.slice(0, entry.indexOf(':'));
}

/**
 * The names two sites would share, as `{type}: {name}`.
 *
 * Only like types are compared: a bucket name, a table name and a log delivery
 * name live in three different namespaces, so equal strings across two of them are
 * not a collision. An entry with no derived name (a `generated` legacy entry) has
 * nothing to collide on and is skipped.
 *
 * An empty result is evidence about the names these two stage configs derive
 * today. It is not a proof that the account is collision-free: the contract's
 * composition has known collision classes of its own, listed in
 * `docs/features/resource-naming.md`, and the Factory resource-naming contract —
 * not FaceTheory — owns closing them.
 */
export function sharedPhysicalNames(
  a: readonly FaceTheoryDerivedPhysicalName[],
  b: readonly FaceTheoryDerivedPhysicalName[],
): readonly string[] {
  const shared = new Set<string>();
  for (const left of a) {
    if (left.name === undefined) continue;
    for (const right of b) {
      if (right.name !== left.name || typeOf(right.entry) !== typeOf(left.entry)) continue;
      shared.add(`${typeOf(left.entry)}: ${left.name}`);
    }
  }
  return [...shared].sort();
}
