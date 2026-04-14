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

## TheoryCloud shared-subtree rollout prerequisites

- The protected-merge publisher for FaceTheory lives at `.github/workflows/theorycloud-facetheory-subtree-publish.yml`.
- That workflow path is part of the IAM trust contract. Do not rename or move it without coordinating the matching OIDC trust-policy update first.
- Approved merges are enforced by repository protections on `premain` and `main`; the workflow intentionally runs on post-merge `push`, not `pull_request.closed`.
- Stage mapping is fixed: `premain -> lab` and `main -> live`.
- No GitHub repo variables are required for normal publish operation. The workflow binds the stage-scoped publisher roles directly:
  - `premain -> arn:aws:iam::787107040121:role/KnowledgeTheory-TheoryCloud-FaceTheory-lab-Publisher`
  - `main -> arn:aws:iam::787107040121:role/KnowledgeTheory-TheoryCloud-FaceTheory-live-Publisher`
- The workflow uses a literal `AWS_REGION=us-east-1`.
- The workflow and helper scripts are the source of truth for the FaceTheory shared-subtree path. The generic KnowledgeTheory workflow/template docs are not authoritative here because they still describe the older `<prefix>/docs/` publish shape.
- FaceTheory syncs only `theorycloud/facetheory/` with docs-root-relative content and a subtree `source-manifest.json`; it must never upload `theorycloud/facetheory/docs/...`.
- External rollout prerequisites live outside this repo: KT #12 stage-scoped OIDC roles, S3 permissions restricted to `theorycloud/facetheory/`, and execute-api invoke permissions only for `POST /v1/internal/publish/theorycloud`.
- Before treating the workflow as ready, confirm the protected branches require review, code-owner review, signed commits, and the expected status checks so direct pushes cannot bypass the approved-merge-only contract.
