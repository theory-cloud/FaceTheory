# Validation evidence

FaceTheory follows the verified-once model: a gate runs once, locally, by the
steward. A records-only commit binds the result to the exact input digests. CI on
the pull request to `staging` only verifies that record. It never executes a gate,
holds no credential, and runs nothing on a push.

- Registry: `scripts/evidence/validation-gates.json`.
- Produce: `scripts/evidence/collect.sh --gate <gate> --profile <profile>`, or
  `scripts/evidence/collect-all.sh` for every gate and profile.
- Container profiles: `scripts/evidence/collect-in-container.sh --gate <gate> --profile <profile>`.
- Verify (this is what CI runs): `scripts/evidence/verify-all.sh`.
- Records: `gov-infra/evidence/records/<gate>/<profile>.json`. Raw runner logs are
  not committed.

## Proof profiles

A profile is a tracked environment declaration. The collector probes the real
versions it runs under and refuses a profile the live host does not satisfy, so a
Node 24 host cannot record a Node 22 floor.

| Profile | Environment | Producing environment |
| --- | --- | --- |
| `default` | Go from `.go-version`, Node 24, host Python | the producing host, darwin/arm64 |
| `floor-node22` | Node 22 | digest-pinned `node` image, linux/amd64 |
| `floor-node24` | Node 24 | digest-pinned `node` image, linux/amd64 |
| `linux-root` | Node 24, UID 0 | digest-pinned `node` image, linux/amd64 |

The three Linux profiles exist because the checks they carry only ran in CI
before: the Node 22/24 matrices, the release-asset build, and the subtree
destination test as UID 0. Each is produced in the container its profile names,
pinned by image digest in the registry, so the platform claim in the record is
the platform that really ran.

## The workflow

```bash
# 1. Land every code, guard, workflow and docs change first. The collector
#    refuses a dirty worktree, so a record can never describe a moving tree.
git status --short

# 2. Produce the records: host profiles on this machine, floor profiles in their
#    containers. The rubric runs last because it composes the ts-pack record.
scripts/evidence/collect-all.sh

# 3. Commit the records on their own. A records-only commit contains record
#    files and nothing else; reviewers check that on the diff.

# 4. Verify exactly what CI will verify, at the head you are about to push.
scripts/evidence/verify-all.sh
```

A record binds the gate's input scope, each command's inputs, the tracked proof
profile and the environment the collector probed. A changed input, a changed
command set, a changed floor or a failed command makes the record inapplicable.
CI then fails with the local collection command instead of re-running anything.

Release-only version metadata (`.release-please-manifest*`, `VERSION`,
`CHANGELOG*`, the package manifests and locks) is normalized in the scope digest,
so a release version bump does not stale a product record. A dependency change in
those files still does, because only the version string is normalized.

## The rubric

`make rubric` runs `gov-infra/verifiers/gov-verify-rubric.sh` and produces a
`gov_rubric_report.v1` report plus per-item logs under `gov-infra/evidence/`.
The report and logs are runtime output; the committed proof is the `rubric`
record, whose input scope is `**`.

Four items compose another gate's record instead of re-executing it:
QUA-1 (`ts`), SEC-1 (`ts`), MAI-1 (`ts-pack`) and the shared Node/Lambda checks.
When the record applies the item verifies it and runs nothing; when it does not
(a bare rubric run, or a changed floor) the item runs its real command. No check
is skipped; only the repeat is.

## CI

`.github/workflows/ci.yml` has one verify job, `rubric`, scoped to pull requests
into `staging`, plus the fast `Version alignment` check and the release-hygiene
jobs. It provisions no toolchain and uploads no artifact. There is no push
trigger: a merge publishes, it does not re-verify.

`.github/workflows/promotion-hygiene.yml` runs on pull requests into `premain` and
`main` and accepts only `staging` into `premain`, `release-please--branches--premain`
into `premain`, `premain` into `main`, and `release-please--branches--main` into
`main` — and only from this repository, so a fork branch cannot pass by name. It
needs no checkout and holds no credential.

Fork contributions arrive on a pre-arranged branch negotiated with the code
owners; a code owner carries the change into `staging` with locally produced
evidence. A fork pull request cannot pass the verify job, and that is intended.
