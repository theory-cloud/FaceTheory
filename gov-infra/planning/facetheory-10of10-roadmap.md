# FaceTheory 10-of-10 governance roadmap

## THE-1952 target state

- [x] Classify the previous `gov-infra` state as guide-only and insufficient for `software_repo_gov_infra`.
- [x] Apply the served `gov.init` scaffold as processed repo-local artifacts, not as vendored platform templates.
- [x] Add the deterministic verifier entrypoint at `gov-infra/verifiers/gov-verify-rubric.sh`.
- [x] Wire `make rubric` to call the gov verifier without recursion.
- [x] Wire the CI rubric job to execute the gov verifier and upload `gov-infra/evidence/`.
- [x] Add a committed governance profile descriptor for `theorycloud_governance_profile.v0.1` / `software_repo_gov_infra`.
- [x] Record the intentional `GEMINI.md` absence decision.

## Ongoing maintenance

1. Keep the rubric IDs stable unless the served governance profile changes.
2. Add new verifier functions before expanding the rubric table.
3. Treat non-deterministic, manual-only, or unreachable checks as `BLOCKED` until they are executable.
4. Keep release/publish workflows free of rubric execution; CI provides evidence, Release Please owns publication.
