# FaceTheory Development Guidelines

This document is contract-only.

## Standards

- Keep canonical user and operator documentation under `docs/` and sanctioned optional subtrees only.
- Ground guidance in current package exports, scripts, tests, and reference stacks.
- Update docs when public runtime behavior changes, especially route contracts, CLI flags, adapter interfaces, cache semantics, or deployment conventions.
- Keep planning, milestone tracking, and internal process notes out of the fixed ingestible surfaces.

## Review Checklist

- `docs/README.md` links every fixed required document.
- Machine-readable files use the required top-level roots: `contract:`, `concepts:`, `patterns:`, and `decisions:`.
- `docs/core-patterns.md` contains both `CORRECT` and `INCORRECT` guidance.
- Example commands are runnable as written.
- Docs do not depend on non-canonical roots such as `docs/development/**`, `docs/planning/**`, `docs/internal/**`, or `docs/archive/**`.

## Documentation Expectations

- `docs/getting-started.md` explains setup and first verification with concrete commands.
- `docs/api-reference.md` reflects the current export map and deployment-facing configuration conventions.
- `docs/testing-guide.md` stays aligned with real verification commands and evidence expectations.
- `docs/troubleshooting.md` captures recurring failures with a practical fix and a verification step.
- Documentation updates ship in the same change set as interface or behavior changes whenever possible.
