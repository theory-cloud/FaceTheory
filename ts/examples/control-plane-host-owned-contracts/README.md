# Control Plane Host-Owned Contracts Example

## Demonstrates

This example shows a control-plane Face where FaceTheory owns presentation while the host owns authentication, tenant acceptance, and bounded section reads. It keeps TableTheory and Autheory concepts opaque to FaceTheory and escapes host-provided HTML labels before rendering.

## Run

From `ts/`, typecheck it with the standard example compilation gate:

```bash
npm run typecheck
```

A host can import `createHostOwnedControlPlaneExampleApp()` from `examples/control-plane-host-owned-contracts/handler.ts` and invoke the returned FaceApp with `FaceApp.handle()` or `handleLambdaUrlEvent()`.

## Backs

- `docs/features/control-plane-boundary.md` — host-owned auth and section-read boundary.
- Public package surface: `@theory-cloud/facetheory/control-plane`.
