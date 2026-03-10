# FaceTheory Migration Guide

This example document is the target shape for `docs/migration-guide.md`.

## When To Use This Guide

Use this guide when:
- migrating from ad hoc SSR handlers to FaceTheory runtime entrypoints
- introducing SSG/ISR behavior into an existing FaceTheory SSR-only app
- updating upstream AppTheory/TableTheory dependency pins

## Scope Guardrails

- Keep migration guidance user-facing and task-oriented.
- Document concrete before/after commands and interfaces.
- Do not rely on undocumented behavior; add `TODO:` where details are not yet confirmed.

## Source / Legacy Context

Known source-of-truth inputs:
- `ts/package.json` export surface and scripts
- `ts/src/types.ts` (`FaceMode`, `FaceModule` contracts)
- `ts/src/apptheory/index.ts` adapter boundary
- `docs/AWS_DEPLOYMENT_SHAPE.md` deployment and ISR storage guidance
- `docs/UPSTREAM_RELEASE_PINS.md` upstream pin policy

`TODO:` If this repo has a formally supported “legacy FaceTheory API” doc, link it here.

## Migration Plan

1. **Inventory current entrypoints and runtime mode**
   - Identify whether current routes are SSR-only or include static/regeneration behavior.
   - Identify whether Lambda URL handlers are custom or AppTheory-based.

2. **Move to canonical FaceTheory entrypoints**
   - Use package exports from `@theory-cloud/facetheory` and documented subpaths.
   - For AppTheory integration, adopt `createAppTheoryFaceHandler`.

3. **Normalize route definitions**
   - Ensure each route has a valid `FaceModule` with `mode: 'ssr' | 'ssg' | 'isr'`.
   - For ISR, set `revalidateSeconds` and configure required stores.

4. **Provision and verify ISR dependencies when needed**
   - HTML object storage (S3 path via `S3HtmlStore` and AWS adapter)
   - Metadata/lease storage (TableTheory-backed store)
   - Validate `x-facetheory-isr` behavior on a known ISR route.

5. **Align dependency pinning policy**
   - Install AppTheory/TableTheory from pinned GitHub release assets.
   - Avoid floating installs that can drift from tested compatibility.

6. **Update verification before cutover**
   - Run typecheck/tests and representative examples.
   - Only remove old code paths after successful validation.

## Validation

```bash
cd ts
npm run typecheck
npm test
npm run example:streaming:serve
```

For deployed ISR paths:

```bash
curl -I https://<cloudfront-domain>/isr-demo
# expect x-facetheory-isr header
```

## Rollback / Safety Notes

- Keep the previous handler wiring and deployable artifact until the new path is validated.
- If ISR cutover fails, revert to SSR mode for affected routes while preserving user availability.
- `UNKNOWN:` exact rollback automation commands are environment-specific; capture them in operator runbooks.
