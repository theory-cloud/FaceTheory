import { AppTheoryBucket, AppTheoryNamingProfile } from '@theory-cloud/apptheory-cdk';
import type { AppTheoryNamingContext } from '@theory-cloud/apptheory-cdk';
import * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';

/**
 * Properties for one reference-site bucket.
 *
 * `namingContext` and `logical` are the contract inputs; everything else is the
 * ordinary `s3.BucketProps` the stack wants.
 */
export interface FaceTheorySiteBucketProps extends s3.BucketProps {
  /**
   * The naming context that owns this bucket's entry.
   */
  readonly namingContext: AppTheoryNamingContext;

  /**
   * The bucket's logical name, for example `site-assets`.
   */
  readonly logical: string;
}

function refuseNameProp(
  namingContext: AppTheoryNamingContext,
  logical: string,
  propName: string,
  isSet: boolean,
): void {
  if (!isSet) return;
  throw new Error(
    `createSiteBucket cannot honor props.${propName} for s3_bucket:${logical}; the naming contract owns the ` +
      (namingContext.namingProfile === AppTheoryNamingProfile.LEGACY
        ? 'entry: declare it in naming.generated, which sets no name and keeps the deployed bucket'
        : 'name: remove it and let the naming context derive s3_bucket:' + logical),
  );
}

/**
 * A reference-site S3 bucket: named by the contract, and construct-shaped so a
 * pre-contract deployment is never replaced.
 *
 * Under the `derived` naming profile the bucket is an `AppTheoryBucket`, so the
 * contract derives an account-regional prefix and CloudFormation appends
 * `-<account>-<region>-an`.
 *
 * Under the `legacy` naming profile the bucket keeps the **pre-contract construct
 * shape**: the L2 bucket sits directly under `id`, exactly where the stack
 * created it before the contract existed, and no name property is set. That
 * matters more than it looks. CloudFormation logical IDs are derived from the
 * construct path, so wrapping the same bucket in a new construct moves
 * `AssetsBucket5CB76180` to `AssetsBucket0481D73F`, and CloudFormation then treats
 * the pair as a *different* resource: it creates the new bucket and deletes the
 * old one, objects and all, even though `BucketName` is absent. The legacy path
 * therefore owns no new construct level, and a test pins the logical IDs against
 * the templates this repository shipped before the adoption.
 *
 * A pin is refused for the same reason from the other direction: CloudFormation
 * generated these bucket names, so setting `BucketName` now is a replace. The
 * legacy entry for a site bucket is a `generated` entry, which sets nothing and
 * leaves the deployed bucket alone.
 */
export function createSiteBucket(
  scope: Construct,
  id: string,
  props: FaceTheorySiteBucketProps,
): s3.Bucket {
  const { namingContext, logical, ...bucketProps } = props;

  refuseNameProp(namingContext, logical, 'bucketName', bucketProps.bucketName !== undefined);
  refuseNameProp(namingContext, logical, 'bucketNamePrefix', bucketProps.bucketNamePrefix !== undefined);
  refuseNameProp(namingContext, logical, 'bucketNamespace', bucketProps.bucketNamespace !== undefined);

  if (namingContext.namingProfile !== AppTheoryNamingProfile.LEGACY) {
    return new AppTheoryBucket(scope, id, { namingContext, logical, ...bucketProps }).bucket;
  }

  // Consuming the entry here is what keeps the naming context's orphan validation
  // honest, and it is what refuses a legacy context that cannot name this bucket.
  const composed = namingContext.physicalName('s3_bucket', logical);
  if (composed.pinned) {
    throw new Error(
      `createSiteBucket refuses a pin for s3_bucket:${logical}: CloudFormation generated this bucket's name, so ` +
        'setting BucketName now replaces the bucket and deletes the objects in it. Declare the entry in ' +
        'naming.generated instead, which sets no name and keeps the deployed bucket.',
    );
  }
  if (!composed.generated) {
    throw new Error(
      `createSiteBucket needs a generated entry for s3_bucket:${logical} under the legacy naming profile`,
    );
  }

  // Pre-contract shape, deliberately: the same child id as before the adoption, so
  // the bucket, its policy and its auto-delete custom resource keep their logical
  // IDs and CloudFormation updates the deployed bucket in place.
  return new s3.Bucket(scope, id, bucketProps);
}
