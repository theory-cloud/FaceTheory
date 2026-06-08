# FaceTheory 10-of-10 governance rubric

The rubric is executable. Each item below has exactly one verifier function in `gov-infra/verifiers/gov-verify-rubric.sh` and exactly one deterministic evidence path under `gov-infra/evidence/`. Missing verifier functions are reported as `BLOCKED`.

| ID | Category | Pass condition |
| --- | --- | --- |
| QUA-1 | Quality | TypeScript typecheck, lint, and unit tests pass through existing Make targets. |
| CON-1 | Consistency | Version alignment passes and the Go toolchain pin is valid against `.go-version`. |
| COM-1 | Completeness | Served scaffold planning artifacts, `pack.json`, `governance-profile.json`, prompt references, evidence/report paths, and no-recursion invariants are present. |
| SEC-1 | Security | npm audit policy passes and GitHub Actions references remain pinned to immutable SHAs. |
| CMP-1 | Compliance | CI runs the gov verifier for PRs into `staging`, uploads `gov-infra/evidence/`, release workflows stay free of the rubric, and release-discipline scripts pass. |
| MAI-1 | Maintainability | Package assembly and release-helper regression checks pass without relying on the rubric wrapper. |
| DOC-1 | Docs | Documentation states gov-infra is CI-core, MCP is guidance-only, signing is retired, and `GEMINI.md` absence is intentional. |

Overall status is `PASS` only when every item is `PASS`; any `FAIL` or `BLOCKED` makes the report non-passing.
