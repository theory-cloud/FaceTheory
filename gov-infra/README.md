# gov-infra (`gov-infra/`)

This directory is FaceTheory's **repo-local, executable governance surface**. It is not a vendored copy of the platform pack: the namespace MCP serves the governance profile, prompt sequence, manifest/provenance, and schema guidance; this repository commits only the processed FaceTheory artifacts and verifier wiring needed for CI evidence.

## Quick start

Run from the repository root:

```bash
bash gov-infra/verifiers/gov-verify-rubric.sh
```

The verifier writes:

- `gov-infra/evidence/gov-rubric-report.json`
- `gov-infra/evidence/*-output.log`

The report conforms to the served `gov_rubric_report.v1` schema for the `theorycloud_governance_profile.v0.1` / `software_repo_gov_infra` profile. Missing or unimplemented verifier functions are reported as `BLOCKED`; guide-only documentation is never treated as CI proof.

## Contents

- `gov-infra/pack.json` — applied scaffold provenance and artifact inventory.
- `gov-infra/governance-profile.json` — committed descriptor for the served software repo governance profile, including G3 verifier/evidence/report paths.
- `gov-infra/planning/` — threat model, controls matrix, rubric, roadmap, evidence plan, supply-chain allowlist, and AI drift recovery plan.
- `gov-infra/prompts/` — references to served prompt resources; prompt bodies are not vendored.
- `gov-infra/verifiers/` — deterministic verifier entrypoint.
- `gov-infra/evidence/` — machine report and per-rubric evidence logs emitted by the verifier.

## Working rules

- Keep governance evidence deterministic and reviewable.
- Do not weaken gates with broad excludes or by replacing executable checks with narrative claims.
- Do not invoke signing, deployment, cloud mutation, branch deletion, or release publication from gov-infra. Signing is retired for this lifecycle surface and the MCP surface is guidance-only.
- Keep `make rubric` as a convenience wrapper that calls `bash gov-infra/verifiers/gov-verify-rubric.sh`; the verifier must not call `make rubric`.
