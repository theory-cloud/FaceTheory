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
- Re-execute: add `--force` to any producer. Collection is incremental by design —
  a gate/profile pair whose committed record still applies to this tree is reused
  and its commands do not run — so `--force` is what turns "produce" into "run
  again". See [Verify, and fresh-run](#verify-and-fresh-run).
- Records: `gov-infra/evidence/records/<gate>/<profile>.json`. Raw runner logs are
  not committed.
- Scripts are directly executable. `scripts/evidence/*.sh` are tracked `100755`,
  so the commands on this page run as written; `bash <script>` is equivalent and
  never required.

## Proof profiles

A profile is a tracked environment declaration. The collector probes the real
versions it runs under and refuses a profile the live host does not satisfy, so a
Node 24 host cannot record a Node 22 floor.

| Profile | Environment | Producing environment |
| --- | --- | --- |
| `default` | Go from `.go-version`, Node 24, host Python | the producing host, darwin/arm64 |
| `floor-node22` | Node 22 | digest-pinned `node` arm64 image, linux/arm64 |
| `floor-node24` | Node 24 | digest-pinned `node` arm64 image, linux/arm64 |
| `floor-node26` | Node 26 | digest-pinned `node` arm64 image, linux/arm64 |
| `linux-root` | Node 24, UID 0 | digest-pinned `node` arm64 image, linux/arm64 |

The Linux profiles exist because the checks they carry only ran in CI before: the Node 22/24/26 matrices, the
release-asset build, and the subtree destination test as UID 0. `floor-node22` is the oldest supported line — deprecated
but still tested, because that is what a consumer who has not moved yet installs; `floor-node26` is the newest supported
line; `floor-node24` sits between them and is also the producing host's major. Each is produced in the container its
profile names, pinned by image digest in the registry, so the platform claim in the record is the platform that really
ran.

The guest architecture is `linux/arm64`, the Factory host's native colima
architecture. GitHub's historical runner was `linux/x64`, and that is not
reproducible on this host: user-mode x86_64 emulation crashes Go-built binaries —
`esbuild` aborts with `found bad pointer in Go heap` — so a `linux/x64` record
could only be produced dishonestly. The Node-major floor, which is the claim
these profiles carry, is reproduced; the architecture is recorded as it ran.

## The workflow

```bash
# 1. Land every code, guard, workflow and docs change first. The collector
#    refuses a dirty worktree, so a record can never describe a moving tree.
git status --short

# 2. Produce the records: host profiles on this machine, floor profiles in their
#    containers. The rubric runs last because it composes the ts-pack record.
#    This is incremental: a pair whose record still applies is reused, not re-run.
scripts/evidence/collect-all.sh

# 3. Commit the records on their own. A records-only commit contains record
#    files and nothing else; reviewers check that on the diff.

# 4. Verify exactly what CI will verify, at the head you are about to push.
scripts/evidence/verify-all.sh
```

## Verify, and fresh-run

These answer two different questions and they are not interchangeable.

**Verify** is the CI path, and it executes nothing. `scripts/evidence/verify-all.sh`
recomputes each gate's input projection and compares it with the committed record.
Green verify means the committed proof still describes this exact tree; it does not
mean any gate ran.

**Fresh-run** is the reproduction path: it re-executes the gate itself and rewrites
the record. Producing a record is incremental — a pair with an applicable record is
reused — so a fresh run is a producer plus `--force`:

```bash
# every gate and every profile, re-executed in the producer each one declares
scripts/evidence/collect-all.sh --force

# one container-bound pair, re-executed inside its digest-pinned image
scripts/evidence/collect-in-container.sh --gate ts --profile floor-node26 --force

# one host-profile pair, re-executed on this machine. A host profile declares the
# repository Go pin the run must use, and collect-all.sh above selects it for you;
# a single pair is given the same selection, or the collector refuses the profile.
GOTOOLCHAIN="go$(cat .go-version)" scripts/evidence/collect.sh --gate examples-local --profile default --force

# then verify what CI will verify at this head
scripts/evidence/verify-all.sh
```

A container-bound profile cannot be produced on this host at all: the collector
probes the live environment and refuses a profile it does not satisfy, which is
what keeps a Node 26 record from being written on a Node 24 host. A host profile
is checked the same way, which is why the single-pair line above selects the
repository Go pin — `collect-all.sh` exports it already, and `collect.sh` refuses
a host that resolves the pin to another Go version instead of recording it. The
producer for a profile is its `image` in the registry: `collect-in-container.sh`
when it declares one, `collect.sh` when it does not, and a missing-record failure
names the right one for you.

A record binds the gate's input scope, each command's inputs, the tracked proof
profile and the environment the collector probed. A changed input, a changed
command set, a changed floor or a failed command makes the record inapplicable.
CI then fails with the local collection command instead of re-running anything.

Two release classes keep a release transform from staling product proof.

- **Release-only version metadata**: `VERSION`, the package manifests and locks,
  and the doc files release-please rewrites with the version literal (`README.md`,
  `docs/README.md`, `docs/api-reference.md`, `docs/getting-started.md`,
  `ts/README.md`). Only the managed version slots are projected: the version
  literal in a text file, and the top-level `version` plus the lockfile's
  `packages[""].version` in a JSON document. Every other value stays bound, so an
  unrelated edit — a dependency change in a lockfile included — still stales a
  record. A whole-literal substitution would be wrong here: `safe-buffer` sits at
  5.1.2 in `ts/package-lock.json` while the package is at 5.1.1, so the mask would
  move onto that dependency as soon as the package reached 5.1.2.
- **Release notes**: the two changelogs and the two release-please manifests. A
  changelog is release history prose no gate reads, so it contributes its
  presence and mode only. A manifest is release state, so its version values are
  projected while the structure around them stays bound.

The split is measured, not assumed: the 5.1.1 stable transform rewrites exactly
`VERSION`, both manifests, both changelogs, the five doc files and the two
`ts/` package files, and every one of those rewrites is a version-literal
substitution. With both classes in place a real release transform verifies
unchanged on every gate and profile, which is what lets a back-merge carry no
records commit.

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
`main` — and only from this repository, so a fork branch cannot pass by name. The
pull-request path needs no checkout and holds only read-only built-in access.

A generated release pull request is opened by release-please with the built-in
`GITHUB_TOKEN`, and GitHub starts no `pull_request` workflow for events that token
causes. Two paths cover it, and they are not equal. `prerelease-pr.yml` and
`release-pr.yml` attach an early verdict: `scripts/sync-release-pr-checks.sh`
dispatches `promotion-hygiene.yml` against the release branch, waits for it at the
pull request head, keeps the pull request a draft until that head is green, reuses
an already-green check, refuses to re-dispatch around a red one, and marks the pull
request ready only after re-reading the head, warning at that point that the
dispatched checks never satisfy the ruleset. The context becomes a required status
check only from an eligible event, and the eligible event here is the code-owner
approval the ruleset already requires: `promotion-hygiene.yml` also triggers on
`pull_request_review: [submitted]` for `premain` and `main`, so the review runs the
same `promotion-hygiene` job for the reviewed pull request, with no credential and
no extra human step. The declaration in `.github/release-lane.json` is the single source of
truth for which context each release branch requires, and
`scripts/verify-release-pr-check-lane.sh` fails closed when a producer, the
dispatch binding, the review path for a base, or the built-in-token rule drifts.

Fork contributions arrive on a pre-arranged branch negotiated with the code
owners; a code owner carries the change into `staging` with locally produced
evidence. A fork pull request cannot pass the verify job, and that is intended.
