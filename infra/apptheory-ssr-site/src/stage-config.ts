import type { Environment } from 'aws-cdk-lib';
import {
  AppTheoryLoggingProfile,
  AppTheoryNamingContext,
  AppTheoryNamingProfile,
  type AppTheoryNamingContextValues,
} from '@theory-cloud/apptheory-cdk';
import type { Construct } from 'constructs';

/**
 * Whether names derive from this config (`derived`) or come from `pins` and
 * `generated` entries (`legacy`).
 */
export type FaceTheoryReferenceNamingProfile = 'derived' | 'legacy';

/**
 * Whether CloudFront access logs go to the contract's CloudWatch Logs delivery
 * (`standard`) or to the construct's pre-contract S3 logs bucket (`legacy`).
 */
export type FaceTheoryReferenceLoggingProfile = 'standard' | 'legacy';

/**
 * The bound stage inputs for this reference stack.
 *
 * Every value the `theorycloud_resource_naming.v0.1` contract needs is encoded
 * here, in the stack's own config, so synthesis is deterministic and no
 * operator environment variable can change a physical name. Deployers copy this
 * record, set `account` to their own twelve-digit account id, and keep `region`
 * at `us-east-1` while the standard logging profile is active: the contract
 * places CloudFront log delivery in `us-east-1` and refuses to synthesize a
 * standard-profile site anywhere else.
 */
export interface FaceTheoryReferenceStageConfig {
  /**
   * Namespace segment; the contract's default is `theorycloud`.
   */
  readonly namespace: string;

  /**
   * App instance id. Two FaceTheory sites in one account differ here, which is
   * what keeps their derived names apart.
   */
  readonly app: string;

  /**
   * Stage id.
   */
  readonly stage: string;

  /**
   * Twelve-digit account id, from config and never from the environment.
   *
   * The committed value is a placeholder (`000000000000` is not an allocatable
   * account): set it before deploying. An unset placeholder fails closed at
   * AssumeRole instead of landing resources in an unintended account.
   */
  readonly account: string;

  /**
   * Region code. `us-east-1` while the standard logging profile is active.
   */
  readonly region: string;

  /**
   * The site's logical name; every derived resource of this stack hangs off it.
   */
  readonly logicalName: string;

  /**
   * Retention in days for contract-named log groups.
   */
  readonly retentionDays: number;

  /**
   * The naming profile. `derived` is the reviewed default; `legacy` is the
   * migration path that keeps the physical names a pre-contract deployment
   * already owns.
   */
  readonly namingProfile: FaceTheoryReferenceNamingProfile;

  /**
   * The logging profile. `standard` is the reviewed default; `legacy` keeps the
   * pre-contract S3 access-log bucket so no log destination moves on upgrade.
   */
  readonly loggingProfile: FaceTheoryReferenceLoggingProfile;

  /**
   * Physical names used verbatim under the legacy naming profile, keyed
   * `{type}:{logical}`.
   */
  readonly pins?: Readonly<Record<string, string>>;

  /**
   * Entries whose name CloudFormation generates today, keyed `{type}:{logical}`,
   * so the construct sets no physical-name property. Legacy profile only.
   */
  readonly generated?: readonly string[];
}

/**
 * The reference deployment this stack synthesizes: one app, one stage.
 */
export const REFERENCE_STAGE_CONFIG: FaceTheoryReferenceStageConfig = {
  namespace: 'theorycloud',
  app: 'facetheory-ssr-site',
  stage: 'lab',
  account: '000000000000',
  region: 'us-east-1',
  logicalName: 'site',
  retentionDays: 30,
  namingProfile: 'derived',
  loggingProfile: 'standard',
};

/**
 * The contract input for a stage config.
 *
 * `AppTheoryNamingContextValues` is the published, enum-typed shape the contract
 * API takes; this record keeps its own readonly string-literal shape so
 * `src/stage-config.ts` reads as configuration rather than as an API struct. This
 * function is the one place that maps between the two, so both profile literals in
 * the committed config reach the contract through the configured fields. Tests use
 * it as well, which is what makes a test saying "the committed stage config must
 * satisfy the contract grammar" exercise this record's own profile fields instead
 * of a restatement of them.
 */
export function stageNamingValues(
  config: FaceTheoryReferenceStageConfig = REFERENCE_STAGE_CONFIG,
): AppTheoryNamingContextValues {
  return {
    namespace: config.namespace,
    app: config.app,
    stage: config.stage,
    account: config.account,
    region: config.region,
    namingProfile:
      config.namingProfile === 'legacy'
        ? AppTheoryNamingProfile.LEGACY
        : AppTheoryNamingProfile.DERIVED,
    loggingProfile:
      config.loggingProfile === 'legacy'
        ? AppTheoryLoggingProfile.LEGACY
        : AppTheoryLoggingProfile.STANDARD,
    retentionDays: config.retentionDays,
    pins: { ...(config.pins ?? {}) },
    generated: [...(config.generated ?? [])],
  };
}

/**
 * The stack environment, bound from the same config record.
 *
 * A naming context with the standard logging profile needs a resolved stack
 * region, so an environment-agnostic stack is not representable here.
 */
export function stageEnvironment(config: FaceTheoryReferenceStageConfig): Environment {
  return { account: config.account, region: config.region };
}

/**
 * The naming and logging context every construct in this stack receives.
 *
 * `derived` names every resource from the contract and, under `standard`
 * logging, gives CloudFront access logs a contract-named CloudWatch Logs
 * destination instead of a per-stack S3 logs bucket.
 */
export function createNamingContext(
  scope: Construct,
  config: FaceTheoryReferenceStageConfig = REFERENCE_STAGE_CONFIG,
): AppTheoryNamingContext {
  return new AppTheoryNamingContext(scope, 'Naming', stageNamingValues(config));
}
