# FaceTheory governance evidence plan

## Standard report

- Schema: `gov_rubric_report.v1`
- Schema resource: `theorymcp://namespaces/theorycloud/governance-profiles/theorycloud_governance_profile.v0.1/schemas/gov_rubric_report.v1`
- Report path: `gov-infra/evidence/gov-rubric-report.json`
- Evidence directory: `gov-infra/evidence/`
- Entrypoint: `bash gov-infra/verifiers/gov-verify-rubric.sh`

## Evidence mapping

| ID | Verifier function | Evidence path |
| --- | --- | --- |
| QUA-1 | `gov_check_quality` | `gov-infra/evidence/QUA-1-output.log` |
| CON-1 | `gov_check_consistency` | `gov-infra/evidence/CON-1-output.log` |
| COM-1 | `gov_check_completeness` | `gov-infra/evidence/COM-1-output.log` |
| SEC-1 | `gov_check_security` | `gov-infra/evidence/SEC-1-output.log` |
| CMP-1 | `gov_check_compliance` | `gov-infra/evidence/CMP-1-output.log` |
| MAI-1 | `gov_check_maintainability` | `gov-infra/evidence/MAI-1-output.log` |
| DOC-1 | `gov_check_docs` | `gov-infra/evidence/DOC-1-output.log` |

## Honesty gate

Documentation-only artifacts do not satisfy the software profile. Evidence is valid only when produced by the executable verifier and reported in `gov-infra/evidence/gov-rubric-report.json`.
