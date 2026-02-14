# FaceTheory Docs

- `docs/ARCHITECTURE.md` — deployment + runtime design (Lambda Function URL + streaming)
- `docs/AWS_DEPLOYMENT_SHAPE.md` — recommended AWS topology + CloudFront cache behaviors for SSR/SSG/ISR
- `docs/FOLLOWUP_ROADMAP.md` — implementation completion plan (AWS adapter, HTTP semantics, SSG/ISR, streaming robustness)
- `docs/HARDENING_HYGIENE_INFRA_ROADMAP.md` — production hardening + hygiene + AppTheory integration + deployment infra
- `docs/ROADMAP_COMPONENT_LIBRARIES.md` — component library support roadmap (React/Ant Design first)
- `docs/ROADMAP.md` — milestones (SSR + SSG/ISR)
- `docs/UPSTREAM_RELEASE_PINS.md` — pinned AppTheory/TableTheory release asset versions (no npm registry)
- `docs/WISHLIST.md` — AppTheory/TableTheory wishlist to support FaceTheory on AWS

Infra examples:
- `infra/apptheory-ssr-site/` — reference CDK stack using AppTheory `AppTheorySsrSite` (CloudFront + S3 + Lambda URL)
- `infra/apptheory-ssg-isr-site/` — reference CDK stack demonstrating SSG origin-group failover + ISR (S3 + Dynamo via TableTheory)
