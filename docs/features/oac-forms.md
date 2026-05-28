---
title: OAC mutating forms
---

AppTheorySsrSite deployments keep the Lambda Function URL origin protected with `AWS_IAM` plus CloudFront Origin Access Control (OAC). Native browser forms cannot add the `x-amz-content-sha256` payload hash required for mutating Lambda URL requests, so FaceTheory exposes `startAwsOacFormTransport()` for explicitly marked same-origin URL-encoded forms.

## Mark the form

```html
<form action="/control/items/new" method="post" data-facetheory-oac-form>
  <input name="name" required />
  <button>Create</button>
</form>
```

The `data-facetheory-oac-form` attribute opts the form into FaceTheory's payload-hash transport. Forms without the attribute submit through native browser behavior.

## Install the transport

From a client bootstrap module:

```typescript
import { startAwsOacFormTransport } from '@theory-cloud/facetheory';

const controller = startAwsOacFormTransport();

// Stop intercepting submits (the browser falls back to native form posting):
// controller.stop();
```

The transport intercepts submit events on marked forms, computes the SHA-256 digest of the URL-encoded body, sets the `x-amz-content-sha256` header to match, and dispatches the request through `fetch`.

## What OAC transport is *not* responsible for

The payload-hash header is AWS signing plumbing only. **Application authentication, CSRF protection, idempotency, and business validation remain application responsibilities.** The transport does not:

- Authenticate the user.
- Generate or validate CSRF tokens.
- Deduplicate idempotent submissions.
- Validate field values.

Route the action path to Lambda / AppTheory, keep OAC enabled on the distribution, and treat the transport as a thin signing-compatibility shim.

## Supported methods and encodings

- Methods: `POST`, `PUT`, `PATCH`, `DELETE`.
- Encoding: `application/x-www-form-urlencoded;charset=UTF-8` (the default for unannotated `<form>`).
- Multipart and other encodings are not supported through this transport — use a fetch-based handler for those.

## Related docs

- [Getting Started → Add an OAC-safe mutating SSR form](../getting-started.md#add-an-oac-safe-mutating-ssr-form)
- [Core Patterns → Mark same-origin mutating forms for OAC transport](../core-patterns.md#pattern-mark-same-origin-mutating-forms-for-oac-transport)
- [AWS Deployment Shape]({{ '/aws-deployment-shape/' | relative_url }})
