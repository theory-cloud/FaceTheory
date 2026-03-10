# FaceTheory Docs Init Guide

Generated: 2026-03-09

## Purpose

This is a **guide-only** initialization artifact for a local agent. **Do not modify docs/ directly** from this action.

- Scope summary: FaceTheory is a vendored frontend component library runtime system supporting multiple frontend frameworks and rendering options beyond the client.
- Canonical KT source root: `docs/`
- Selected documentation domains:
  1. Runtime API + framework adapter domain (TypeScript/Node)
  2. AWS deployment and operations domain (CloudFront/S3/Lambda URL/ISR stores)
  3. Compatibility and upstream dependency pinning domain (AppTheory/TableTheory)
  4. Verification domain (tests + runnable examples)
- Relevant languages/runtimes:
  - **Relevant:** TypeScript on Node.js `>=24` (`ts/package.json`)
  - **Relevant:** Make task runner wrapper for TypeScript workflows (`Makefile`)
  - **Relevant for operator docs:** AWS CDK example apps under `infra/` (TypeScript-based deployment references)
  - **Out of scope for docs init:** Internal planning-only roadmap text as canonical API surface

Canonical sources consulted by domain:
- Runtime API + adapters:
  - `ts/package.json`
  - `ts/src/index.ts`
  - `ts/src/types.ts`
  - `ts/src/apptheory/index.ts`
  - `ts/src/aws-s3/index.ts`
  - `ts/src/tabletheory/index.ts`
  - `ts/src/ssg-cli.ts`
- Deployment + operations:
  - `docs/AWS_DEPLOYMENT_SHAPE.md`
  - `docs/OPERATIONS.md`
  - `infra/apptheory-ssr-site/README.md`
  - `infra/apptheory-ssg-isr-site/README.md`
- Compatibility:
  - `docs/UPSTREAM_RELEASE_PINS.md`
- Verification:
  - `README.md`
  - `ts/README.md`
  - `ts/package.json` scripts

## Canonical KT Surface

- Canonical KT source root: `docs/`
- Fixed ingestible docs:
  - `docs/README.md`
  - `docs/_concepts.yaml`
  - `docs/_patterns.yaml`
  - `docs/_decisions.yaml`
  - `docs/getting-started.md`
  - `docs/api-reference.md`
  - `docs/core-patterns.md`
  - `docs/testing-guide.md`
  - `docs/troubleshooting.md`
  - `docs/migration-guide.md`
- Fixed contract-only docs:
  - `docs/_contract.yaml`
  - `docs/development-guidelines.md`
- Sanctioned optional ingestible surfaces:
  - `docs/migration/**`
  - `docs/llm-faq/**`
  - `docs/cdk/**`
- Non-canonical docs roots (never ingestible canonical source):
  - `docs/development/**`
  - `docs/planning/**`
  - `docs/internal/**`
  - `docs/archive/**`

## Example Outputs

Each example under `gov-infra/planning/docs-init-examples/` maps to one canonical target path under `docs/`.

| Target docs path | Example path | Suggested local-agent action | Notes |
|---|---|---|---|
| `docs/README.md` | `gov-infra/planning/docs-init-examples/README.md` | **adapt** | Existing `docs/README.md` should be reshaped into the fixed KT index and contract summary. |
| `docs/_contract.yaml` | `gov-infra/planning/docs-init-examples/_contract.yaml` | **create** | Use required server contract shape exactly. |
| `docs/_concepts.yaml` | `gov-infra/planning/docs-init-examples/_concepts.yaml` | **create** | Seed with FaceTheory runtime/deployment/compat concepts. |
| `docs/_patterns.yaml` | `gov-infra/planning/docs-init-examples/_patterns.yaml` | **create** | Include canonical and anti-pattern entries grounded in adapters and pinning policy. |
| `docs/_decisions.yaml` | `gov-infra/planning/docs-init-examples/_decisions.yaml` | **create** | Capture SSR/SSG/ISR selection and deployment decision trees. |
| `docs/getting-started.md` | `gov-infra/planning/docs-init-examples/getting-started.md` | **create** | Merge quickstart content from root/ts docs into contract format. |
| `docs/api-reference.md` | `gov-infra/planning/docs-init-examples/api-reference.md` | **create** | Build from `ts/package.json` exports and documented env/config surface. |
| `docs/core-patterns.md` | `gov-infra/planning/docs-init-examples/core-patterns.md` | **create** | Preserve CORRECT/INCORRECT examples from known runtime behavior. |
| `docs/development-guidelines.md` | `gov-infra/planning/docs-init-examples/development-guidelines.md` | **create** | Must remain contract-only. |
| `docs/testing-guide.md` | `gov-infra/planning/docs-init-examples/testing-guide.md` | **create** | Ground in `npm run typecheck`, `npm test`, and representative examples. |
| `docs/troubleshooting.md` | `gov-infra/planning/docs-init-examples/troubleshooting.md` | **create** | Organize by symptom/cause/fix/verification. |
| `docs/migration-guide.md` | `gov-infra/planning/docs-init-examples/migration-guide.md` | **create** | Provide migration tasks; keep user-facing and task-oriented. |

Optional surfaces (recommended local-agent actions):
- `docs/cdk/**`: **create/adapt** from `infra/apptheory-ssr-site/README.md` and `infra/apptheory-ssg-isr-site/README.md` if operator-facing guidance is needed in canonical retrieval.
- `docs/migration/**`: **create only when concrete migration scenarios are confirmed**.
- `docs/llm-faq/**`: **defer** unless high-frequency support questions are identified.

Known gaps to keep explicit:
- `TODO:` Confirm exact exported function names for Vue/Svelte adapter APIs before finalizing API examples.
- `UNKNOWN:` Official legacy-version migration baseline (if any) is not explicitly documented in current canonical sources.
- `TODO:` Confirm whether infra synthesis/deploy commands should be part of default module verification or operator-only optional docs.

## Cleanup And Consolidation Plan

Runtime-relevant docs content currently stranded outside the canonical KT root should be consolidated as follows:

1. Root onboarding content
- Source: `README.md`
- Action: **split/merge** quickstart, example run commands, and milestone test anchors into:
  - `docs/getting-started.md`
  - `docs/testing-guide.md`
  - `docs/api-reference.md`

2. TypeScript runtime behavior notes
- Source: `ts/README.md`
- Action: **split/merge** policy sections into:
  - `docs/core-patterns.md` (usage patterns)
  - `docs/api-reference.md` (public contracts)
  - `docs/troubleshooting.md` (failure/guardrail notes)

3. Infra deployment examples
- Source: `infra/apptheory-ssr-site/README.md`, `infra/apptheory-ssg-isr-site/README.md`
- Action: **adapt/move summary guidance** into sanctioned optional `docs/cdk/**` to keep operator-facing retrieval canonical.
- Keep infra README files in place for code-local context, but ensure canonical user docs live under `docs/`.

4. Planning-heavy docs in `docs/`
- Sources include roadmap/planning materials
- Action: **remove from ingestible contract path** by keeping them out of fixed ingestible docs and out of retrieval-oriented links.

## Local Agent Apply Steps

1. Confirm canonical root policy
- Use `docs/` as the only canonical KT source root.
- Treat non-canonical roots as out-of-scope for ingestible docs.

2. Apply fixed contract files from examples
- Create or adapt each required target path listed in the Example Outputs table.
- Preserve basename and intent of each mapped example.

3. Preserve repo-grounded evidence
- Keep commands, env vars, headers, and interface names tied to source files listed in this guide.
- For uncertain details, keep explicit `TODO:`/`UNKNOWN:` notes; do not invent APIs.

4. Consolidate external runtime docs
- Merge content from root and `ts/`/`infra/` docs into canonical docs where user/operator retrieval needs it.
- Avoid linking ingestible docs to non-canonical roots.

5. Validate contract conformance
- Ensure docs index links all fixed files.
- Ensure machine-readable YAML roots are correct.
- Ensure `core-patterns.md` contains both `CORRECT` and `INCORRECT` sections.
- Ensure `development-guidelines.md` is explicitly contract-only.

## Review Checklist

- [ ] Guide remains **guide-only** and states **Do not modify docs/ directly**.
- [ ] Canonical KT source root is explicitly `docs/`.
- [ ] Canonical vs non-canonical roots are clearly distinguished.
- [ ] All fixed target docs paths are mapped to example paths.
- [ ] Source evidence for runtime/API/deployment/compat/testing domains is cited.
- [ ] Cleanup plan addresses runtime docs outside `docs/`.
- [ ] Ingestible docs avoid links to `docs/development/**`, `docs/planning/**`, `docs/internal/**`, `docs/archive/**`.
- [ ] Unknowns are expressed as `TODO:` or `UNKNOWN:` rather than guessed behavior.

## Publish Acceptance Criteria

- Canonical source root is `docs/` and includes all fixed required docs.
- Only sanctioned optional ingestible subtrees are used (`docs/migration/**`, `docs/llm-faq/**`, `docs/cdk/**`).
- Ingestible docs do not include maintainer/planning/internal/archive-only material.
- `docs/README.md` links every fixed required doc and summarizes canonical contract rules.
- Machine-readable files validate with required top-level roots:
  - `_contract.yaml` -> `contract:`
  - `_concepts.yaml` -> `concepts:`
  - `_patterns.yaml` -> `patterns:`
  - `_decisions.yaml` -> `decisions:`

## Publish Notes

- This package is an initialization scaffold for local-agent application only.
- If additional public interfaces are added (new exports, CLI flags, env vars), update canonical docs in the same change.
- Keep compatibility pins aligned with `docs/UPSTREAM_RELEASE_PINS.md` and avoid claiming support for unpinned combinations.
