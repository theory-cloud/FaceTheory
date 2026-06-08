# FaceTheory controls matrix

| Control ID | Category | Threats | Verifier / artifact | Evidence path |
| --- | --- | --- | --- | --- |
| QUA-1 | Quality | THR-3 | `gov_check_quality` runs TypeScript typecheck, lint, and tests through existing Make targets. | `gov-infra/evidence/QUA-1-output.log` |
| CON-1 | Consistency | THR-4 | `gov_check_consistency` runs version alignment and Go toolchain pin checks with the repository pin. | `gov-infra/evidence/CON-1-output.log` |
| COM-1 | Completeness | THR-1, THR-2 | `gov_check_completeness` validates planning inventory, pack/profile G3 fields, prompt references, report path, and no rubric recursion. | `gov-infra/evidence/COM-1-output.log` |
| SEC-1 | Security | THR-5 | `gov_check_security` runs npm audit policy and verifies workflow actions are pinned to immutable SHAs. | `gov-infra/evidence/SEC-1-output.log` |
| CMP-1 | Compliance | THR-2, THR-4, THR-6 | `gov_check_compliance` verifies CI rubric enforcement and release discipline test scripts. | `gov-infra/evidence/CMP-1-output.log` |
| MAI-1 | Maintainability | THR-3 | `gov_check_maintainability` verifies package assembly and release-helper regression tests. | `gov-infra/evidence/MAI-1-output.log` |
| DOC-1 | Docs | THR-1, THR-6, THR-7 | `gov_check_docs` verifies profile docs, MCP boundary language, and the intentional absence of `GEMINI.md`. | `gov-infra/evidence/DOC-1-output.log` |
