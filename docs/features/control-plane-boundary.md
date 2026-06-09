---
title: Control-plane boundary guardrails
---

FaceTheory control-plane surfaces are **presentational**. They compose a shell,
declare bounded section reads, and render host-owned HTML returned by `load`.
They do not own TableTheory key generation, DynamoDB access patterns, Autheory
session validation, or staff-entitlement normalization.

## Opaque section read metadata

Every control-plane data section must still declare a bounded, tenant-scoped
read:

```typescript
read: {
  bounded: true,
  tenantScoped: true,
  contractId: 'host.tabletheory.key-m1.section-read',
  authority: 'host.tabletheory',
  source: 'host.control-plane.section-read',
}
```

`contractId`, `authority`, and `source` are optional opaque strings. FaceTheory
may display or log them as labels, but it must not parse them for TableTheory
keys, tenant partitioning, or authorization semantics. The host is responsible
for producing the external contract and for deciding what those identifiers
mean.

The runtime guard remains fail-closed: a section missing `bounded: true` or
`tenantScoped: true` is rejected during app construction.

## Safe SSR consumption pattern

Use the `gate` to consume host-authenticated request state, then call a
host-owned bounded read from section `load(ctx, gate)`:

1. Host middleware or an Autheory integration resolves an `OperatorGuardStatus`,
   accepted tenant, accepted scope, and stable claims before FaceTheory renders.
2. The FaceTheory `gate` returns `{ ok: true, tenant, claims }` only after the
   host has accepted the request.
3. The section `load(ctx, gate)` passes the accepted tenant/scope and the opaque
   TableTheory-generated contract to a host-owned read function.
4. The section `render(ctx, data, gate)` escapes any dynamic text it places into
   host-owned HTML.

See `ts/examples/control-plane-host-owned-contracts/handler.ts` for a runnable
example. The example uses SSR section `load`, contains no raw DynamoDB key
strings, and does not import Autheory or TableTheory as code dependencies.

## What stays outside FaceTheory

- TableTheory-derived key generation and storage routing.
- Raw DynamoDB clients in control-plane or Stitch source.
- Autheory entitlement normalization or provider-session parsing.
- Browser globals (`window`, `document`) or time-varying sources (`Date.now()`,
  `Math.random()`) during render or section data loading.

Live tenant/auth-varying control-plane reads must stay in SSR `load`; do not
move those reads into component render bodies, client globals, or hydration-time
fetches that re-derive authorization in the browser.
