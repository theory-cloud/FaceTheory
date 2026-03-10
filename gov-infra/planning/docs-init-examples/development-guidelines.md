# FaceTheory Development Guidelines

This document is **contract-only** for `docs/development-guidelines.md`.

Use it to keep user-facing documentation aligned with supported FaceTheory behavior and exported interfaces.

## Standards

- Keep guidance grounded in repository facts (real commands, real paths, real interfaces).
- Update docs when public runtime behavior changes (routing, SSR/SSG/ISR semantics, request/response handling).
- Keep API and setup docs synchronized with `ts/package.json` scripts and exported entry points.
- Avoid planning/process status in ingestible docs.

## Review Checklist

- Public interfaces in docs match current exports and implementation.
- Example commands are runnable as written.
- Cross-links between related docs remain valid.
- `docs/core-patterns.md` includes both **CORRECT** and **INCORRECT** guidance where applicable.
- No out-of-scope operational content is mixed into ingestible docs.

## Documentation Expectations

- `docs/getting-started.md` explains setup and verification with concrete steps.
- `docs/api-reference.md` reflects the current interface map and usage patterns.
- `docs/testing-guide.md` stays aligned with actual test commands and evidence capture expectations.
- `docs/troubleshooting.md` documents recurring failure modes and practical diagnosis steps.
- Documentation updates are included in the same change set as behavior/interface changes when possible.
