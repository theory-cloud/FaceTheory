---
title: Render modes compared
---

# Render modes compared

FaceTheory supports four render shapes. Three are `FaceMode` values (declared on each `FaceModule`); the fourth — SPA navigation — is a client-side runtime layered on top of any of them.

|                       | SSR                            | SSG                              | Blocking ISR                       | SPA navigation                          |
|-----------------------|--------------------------------|----------------------------------|------------------------------------|-----------------------------------------|
| `FaceMode` value      | `'ssr'`                        | `'ssg'`                          | `'isr'`                            | n/a — client runtime                    |
| Render timing         | every request                  | build time                       | first request + on expiry          | server render once + client navigation  |
| Delivery              | Lambda streaming               | S3 + CloudFront                  | TableTheory cache + S3 + CloudFront | inherits the SSR/SSG/ISR shell          |
| Freshness             | always fresh                   | redeploy only                    | TTL-driven (`revalidateSeconds`)   | inherits the underlying mode            |
| Per-request data      | yes                            | no                               | only during regeneration           | yes, via client fetch                   |
| Personalization safe? | yes                            | no                               | only with tenant-aware cache key   | yes, with deterministic shell           |
| Cold-start sensitive? | yes                            | no                               | regen requests are                 | shell inherits underlying mode          |
| Document              | [`modes/ssr`](../modes/ssr.md) | [`modes/ssg`](../modes/ssg.md)   | [`modes/isr`](../modes/isr.md)     | [`modes/spa`](../modes/spa.md)          |

## Choosing

Pick **SSR** when content is personalized or frequently changing per request. The cost is per-request Lambda invocation and the corresponding cold-start exposure.

Pick **SSG** when content changes only on redeploy. The benefit is immutable assets served from CloudFront with no Lambda invocation in the request path.

Pick **blocking ISR** when content changes between deploys but not per request. The cache lives in TableTheory; regeneration is serialized by a lease to prevent thundering herds. Per-tenant safety is **fail-closed** — see [ISR tenant safety](../features/isr-tenant-safety.md).

Pick **SPA navigation** on top of any of the above when the application is interaction-heavy after the initial paint, and full-page reloads on every link click would feel wrong.

## What you do not pick

- A "fifth" render mode (edge rendering, React Server Components, island hydration, etc.). The four shapes above are the framework's shape; growth happens through new options on existing modes, not by adding modes.
- A client-only mode with no server pass. The SPA mode is a server-rendered shell with client-side routing on top — the server pass is the determinism contract.

## Related docs

- [FaceModule API reference](face-module.md)
- [Architecture](../architecture.md)
- [AWS Deployment Shape](../aws-deployment-shape.md)
