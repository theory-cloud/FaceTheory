# FaceTheory Navigation Pending Example

This example shows the Tier A Responsive Control Plane helper as a neutral browser
ESM module. A control plane can re-serve FaceTheory's built
`dist/navigation-pending.js` same-origin (for example,
`/control-plane/assets/facetheory/navigation-pending.js`) and load a small entry
module that starts the helper.

The helper observes accepted same-origin link clicks and form submissions only for
pending presentation. It does not prevent native navigation, and it does not take
over form submit authority from `startAwsOacFormTransport`.

```html
<link rel="stylesheet" href="/assets/navigation-pending.css">
<script type="module" src="/assets/navigation-pending-entry.js"></script>
```

`navigation-pending-entry.ts` demonstrates a bundled/package-specifier import for
apps that build their client entry. A server that re-serves the FaceTheory build
artifact directly can use the same call after importing from the same-origin asset
URL instead.
