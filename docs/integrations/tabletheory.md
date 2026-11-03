---
title: TableTheory integration
---

FaceTheory uses TableTheory for blocking ISR's cache metadata, regeneration leases, and (optionally) cache HTML payload pointers. TableTheory is the data layer underneath; FaceTheory consumes it through a typed integration surface rather than reaching at DynamoDB directly.

## Install

```bash
npm install --save-exact \
  https://github.com/theory-cloud/TableTheory/releases/download/v6.1.1/theory-cloud-tabletheory-ts-6.1.1.tgz
```

## The TableTheory entry point

FaceTheory exposes `@theory-cloud/facetheory/tabletheory` for the TableTheory-backed ISR stores:

```typescript
import { /* FaceTheoryIsrMetaStore, ... */ } from '@theory-cloud/facetheory/tabletheory';
```

The store implements FaceTheory's `IsrMetaStore` interface (`get`, `tryAcquireLease`, `commitGeneration`, `releaseLease`) on top of a TableTheory model with the canonical cache-record shape.

## Cache record shape

The TableTheory-modeled ISR cache record lives on the TableTheory documentation site so the schema can stay close to TableTheory's contract:

- [ISR cache schema](https://theory-cloud.github.io/tabletheory/facetheory/isr-cache-schema/) — table layout, attributes, lifecycle tags.
- [ISR transaction recipes](https://theory-cloud.github.io/tabletheory/facetheory/isr-transaction-recipes/) — metadata + pointer-swap patterns.
- [ISR idempotency](https://theory-cloud.github.io/tabletheory/facetheory/isr-idempotency/) — request-ID driven regeneration.
- [TTL cache patterns](https://theory-cloud.github.io/tabletheory/facetheory/ttl-cache-patterns/) — TTL-first cache eviction.

## Wiring in production

```typescript
import { createFaceApp, S3HtmlStore } from '@theory-cloud/facetheory';
// createTableTheoryIsrMetaStore is exported by the tabletheory entry point.
import { /* createTableTheoryIsrMetaStore */ } from '@theory-cloud/facetheory/tabletheory';
// The AWS SDK v3 client adapter lives in the aws-s3 entry point; S3HtmlStore
// itself is a core export and takes that client plus the bucket.
import { createAwsSdkS3HtmlStoreClient } from '@theory-cloud/facetheory/aws-s3';

const htmlStore = new S3HtmlStore({
  client: createAwsSdkS3HtmlStoreClient({ s3 }),
  bucket: /* FACETHEORY_ISR_BUCKET */,
  keyPrefix: /* FACETHEORY_ISR_PREFIX */,
});

export const app = createFaceApp({
  faces,
  isr: {
    htmlStore,
    metaStore: /* TableTheory-backed IsrMetaStore */,
  },
});
```

See the [API Reference → ISR Storage And Cache APIs](../api-reference.md#isr-storage-and-cache-apis) for the exact exported names and construction patterns at the current version.

## Control-plane section reads

Control-plane data sections may carry optional opaque metadata (`contractId`,
`authority`, `source`) for a host-supplied TableTheory-derived read contract.
FaceTheory only requires the section declaration to remain `bounded: true` and
`tenantScoped: true`; it does not parse the metadata, derive keys, or normalize
auth/entitlement state.

For live tenant/auth-varying control-plane sections, the safe pattern is:

1. host auth resolves the accepted tenant, guard status, scope, and claims;
2. FaceTheory `gate` returns that accepted state as opaque `gate.claims`;
3. section `load(ctx, gate)` calls a host-owned bounded read with the accepted
   tenant/scope and the opaque external contract;
4. section `render` receives host-owned data and escapes any dynamic text it
   emits as HTML.

See [Control-plane boundary guardrails](../features/control-plane-boundary.md)
for the example and the static guardrail expectations.

## Cross-repo coordination

A FaceTheory change that needs a new TableTheory model attribute, tag, or transaction shape is a cross-repo coordination event — not a unilateral FaceTheory edit. Conversely, TableTheory changes that affect the tags or semantics FaceTheory's ISR relies on need cross-steward review.

## Related docs

- [Blocking ISR](../modes/isr.md)
- [ISR tenant safety](../features/isr-tenant-safety.md)
- [AWS Deployment Shape]({{ '/aws-deployment-shape/' | relative_url }})
