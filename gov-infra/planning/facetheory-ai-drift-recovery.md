# FaceTheory AI drift recovery

## Drift signals

- `gov-infra/` contains planning docs but no verifier/evidence/report path.
- CI rubric job runs `make rubric` after `make rubric` has become a wrapper around the gov verifier, or the gov verifier calls `make rubric`.
- Release or publish workflows start running the rubric despite repo policy.
- A future agent treats namespace MCP guidance as deploy, signing, merge, or repository mutation authority.
- A future agent recreates `GEMINI.md` as a governed stamp even though its absence is intentional.

## Recovery steps

1. Re-run `govern_lifecycle_turn` with `phase=govern`, `repo_key=facetheory` and use the served profile/schema as the authority.
2. Audit `gov-infra/pack.json`, `gov-infra/governance-profile.json`, `Makefile`, `.github/workflows/ci.yml`, and `scripts/verify-ci-rubric-enforced.sh`.
3. Restore the no-recursion invariant: `make rubric` may call `bash gov-infra/verifiers/gov-verify-rubric.sh`; the verifier must not call `make rubric`.
4. Run `bash gov-infra/verifiers/gov-verify-rubric.sh` and inspect the report before claiming PASS.
5. If MCP connectivity drops mid-session, write `/tmp/FaceTheory-delegate-report.md` with completed work, remaining work, git state, PR state, and blocker, then stop.

## Boundary reminder

Signing is retired for this lifecycle surface. The MCP pack serves guidance only and does not replace repo-local CI evidence.
