# FaceTheory Testing Guide

This example document is the target shape for `docs/testing-guide.md`.

## Test Strategy

FaceTheory verification focuses on deterministic behavior in TypeScript modules and adapters.

- Unit tests validate request normalization, routing, SSR/streaming behavior, and ISR behavior.
- Integration/workflow checks validate key example paths and adapter flows.
- Documentation should reference commands that exist in repository scripts.

## Unit Tests

Run the baseline suite:

```bash
cd ts
npm run typecheck
npm test
```

Run focused unit tests when iterating quickly:

```bash
cd ts
npm run test:unit
```

Expected outcome:
- Typecheck completes without errors.
- Unit suite passes, including high-signal runtime tests (for example ISR and streaming coverage).

## Evidence To Capture

For verification and debugging, capture:

- Command output from `npm run typecheck` and `npm test`.
- Failing stack traces and test names when regressions occur.
- Environment/context details needed to reproduce failures (runtime version, adapter path, relevant flags).

For integration checks (when run), also capture:
- Command transcript and final pass/fail state.
- Any generated output paths or served endpoint checks used as proof.
