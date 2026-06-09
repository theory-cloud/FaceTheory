# FaceTheory governance threat model

## Scope

FaceTheory is the AWS-first TypeScript client-delivery runtime for SSR, SSG, blocking ISR, and SPA shells across React, Vue, and Svelte adapters. The governance surface covers repository-local code, CI gates, release discipline, documentation/profile consistency, and supply-chain posture. It does not authorize deployment, release publication, signing, AWS mutation, or sibling-repo edits.

## Assets

- Deterministic render-mode and adapter contracts in `ts/src/**`.
- GitHub Release-only distribution discipline and release automation scripts.
- CI workflows under `.github/workflows/`.
- Governance evidence under `gov-infra/evidence/`.
- Planning/profile descriptors under `gov-infra/` and top-level `AGENTS.md`.

## Threats

| ID | Threat | Impact | Primary controls |
| --- | --- | --- | --- |
| THR-1 | Guide-only governance is mistaken for executable CI proof. | False assurance; missing standard evidence. | `COM-1`, `CMP-1`, `DOC-1` |
| THR-2 | Rubric recursion causes the gov verifier and `make rubric` to call each other. | CI loop/hang; no useful evidence. | `COM-1`, `CMP-1` |
| THR-3 | TypeScript/render checks drift out of the governance evidence path. | Hydration/render regressions ship outside the standard gate. | `QUA-1`, `MAI-1` |
| THR-4 | Release Please or branch discipline checks are skipped by governance. | Immutable release process can regress unnoticed. | `CON-1`, `CMP-1` |
| THR-5 | Supply-chain or workflow action pinning regressions are not surfaced. | Dependency or CI compromise risk. | `SEC-1` |
| THR-6 | MCP-served governance is misread as signing/deploy/merge authority. | Unauthorized repository or cloud mutation. | `DOC-1`, `CMP-1` |
| THR-7 | Agent-local host files such as `GEMINI.md` are misclassified as missing governed artifacts. | Repeated noisy remediation and profile drift. | `DOC-1` |

## Assumptions and exclusions

- The namespace MCP serves guidance, scaffold inventory, and schemas; it does not write this repository or replace repo-local CI.
- Signing is retired for this lifecycle surface.
- Cloud/AWS/deploy changes are out of scope for THE-1952.
