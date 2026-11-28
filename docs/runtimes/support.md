---
title: Runtime Support
---

# Runtime Support

FaceTheory is a TypeScript runtime, so Node.js is the only runtime this page supports: there is no Python, Go, or .NET surface, and nothing here is a statement about another platform. The table below says which Node.js majors are tested on the `staging` candidate tree, what the declared floor is, and when the deprecated line stops being supported.

This page is the single source of truth for Node support status. Every other page states only the piece it needs — usually the `engines.node` floor — and links here instead of restating which lines are tested, which is deprecated, or which release carries a row.

## Tested lines

The published package declares `engines.node` `>=22`, and the release and prerelease workflows keep pinning Node 24.13.1. Neither has moved: Node 26 is an addition to the tested set, not a new minimum.

| Node.js line | Status                                      | Proven by                                                           |
| ------------ | ------------------------------------------- | ------------------------------------------------------------------- |
| 22           | **Deprecated** — supported and tested today | `ts` and `ts-pack` gates at the `floor-node22` proof profile        |
| 24           | Supported and tested                        | `ts` and `ts-pack` gates at `floor-node24`; also the producing host |
| 26           | Supported and tested — the newest line      | `ts` and `ts-pack` gates at the `floor-node26` proof profile        |

Node 22 is the oldest line and stays in the gate matrix while it is deprecated, so a consumer on 22 keeps working and keeps being verified. Node 26 is the newest line and is verified the same way. There is no "reference" row: each supported line is proven by its own record.

### From which release

The rows describe the candidate tree, and only a release makes a row a claim about an artifact you can install:

- Node 26 support landed on `staging` in the change that added its row and ships in the release after `v5.2.0`. Until that release is published, "Node 26 is supported" is true of `staging`, not of any installable package, so a reader on `v5.2.0` has no Node 26 claim to move to.
- The Node 22 and Node 24 rows are unaffected: both were tested before this change, both are tested now, and Node 22 stays tested until the 2027-02 floor raise.

Which Node majors each published release line was actually verified on, from this repository's own records at those tags:

| Release line       | Floor at that tag        | Verified on         | Where the record is                                                                        |
| ------------------ | ------------------------ | ------------------- | ------------------------------------------------------------------------------------------ |
| `v4.0.0`–`v4.0.10` | `>=20` — historical      | Node 20 and Node 24 | `node-version: ["20", "24"]` in `.github/workflows/ci.yml` at those tags                    |
| `v4.1.0`–`v5.1.1`  | `>=22` — still the floor | Node 22 and Node 24 | `node-version: ["22", "24"]` in the same file, after the floor raise in `v4.1.0`            |
| `v5.2.0`           | `>=22` — still the floor | Node 22 and Node 24 | the `floor-node22` and `floor-node24` proof profiles; CI verifies the records and runs none |

The middle column is the floor **that release line declared**, not today's floor. `v4.0.0`–`v4.0.10` declare `>=20` because `>=20` was the floor then; `v4.1.0` raised it to `>=22`, which it did because Node 20 reached end of life in April 2026, and `>=22` is still the floor today. So Node 20 is below the current floor *and* the historical row is still accurate at its own tags — the two statements describe different release lines, and neither overrides the other. A historical claim about "what earlier releases were verified on" has to name the release line, not just the current one: the record at a tag is the authority for that tag, and where this table and a release's own record ever disagree, the record wins.

Node 26 does not appear in any published release's verification, so it is in the table above and in no published row of this one.

### What "tested" means here

A line is supported when all of the following pass on that major:

- the TypeScript suite — typecheck, lint, format, unit tests, coverage, the Node engines floor and the deprecated-Lambda-runtime checks (`scripts/verify-ts-suite.sh`); and
- `npm pack` of the package at the repository version, unpacked and inspected (`scripts/verify-ts-pack.sh`); and
- a clean-consumer install — the packed tarball installed into an empty project whose only other dependencies are the React peer pair, then exercised by importing the published entry points, rendering one SSR Face twice with byte-identical output, and building one SSG site (`scripts/verify-consumer-install.sh`).

The first two run under every major in the table; the consumer install runs under the same profiles, so "supported on Node 26" is a statement about an installed artifact, not about sources that compile.

### What it does not cover

- **The Lambda runtime your stack declares is not this page's claim.** `nodejs22.x` / `nodejs24.x` (or whatever a given stack declares) follows AWS's own deprecation schedule, which the [Migration guide](/migration-guide/#migration-11-node-20-to-node-24-lambda-runtime) tracks. Package compatibility on a Node major and the managed runtime a function runs on are two different deadlines.
- **Your application's own dependencies.** FaceTheory's peer packages (React, Vue, Svelte, Emotion, AntD) install from npm and carry their own floors. The `ts` gate proves FaceTheory's `engines.node` floor against FaceTheory's lockfiles; it does not vouch for a consumer's tree.
- **The producing host.** The `default` proof profile is Node 24 on the Factory host. It is where the portable source proofs run, not a support claim about Node 24 being "the" version.

## Node 22 deprecation

Node 22 is announced as deprecated against its upstream end of life. It is **not** removed, and no code change is required today.

| Milestone                               | Date       | What happens                                                                   |
| --------------------------------------- | ---------- | ------------------------------------------------------------------------------ |
| Deprecation announced                   | 2026-11    | Node 22 stays in the gate matrix and stays a supported install target          |
| Node 22 upstream end of life            | 2027-04-30 | Node 22 stops receiving security fixes upstream                                |
| Floor raised to `>=24` in a dated major | 2027-02    | `engines.node` becomes `>=24`, Node 22 leaves the matrix, Node 22 support ends |

The floor raise is a planned major release, scheduled for 2027-02 so it lands before Node 22's security support ends. Until that release ships, `>=22` is the real floor and Node 22 is tested. When it ships, it will carry a `BREAKING CHANGE:` footer and a migration entry, and this page is where the schedule is kept current.

This is a support-contract change rather than an API change, following the [Deprecation Policy](/deprecation-policy/): no import, Face mode, render contract, or head/style emission changes. Migration notes, including what to do now and what to prepare, are in [Migration 13](/migration-guide/#migration-13-node-22-runtime-support-deprecation).

## Which line should I run?

- **New projects:** Node 24, or Node 26 once you install the release after `v5.2.0`. Both are supported and tested on the candidate tree, but only Node 24 is in every published release's verified set today (see the table above), so Node 24 is the line that works against the tarball you can actually install. Node 24 also stays the conservative choice because the local example harness requires 24 or newer and the reference stacks emit the `nodejs24.x` Lambda runtime.
- **Projects on Node 22:** nothing to do now. Track the 2027-02 major, then move to a line that major supports — Node 24, or Node 26 by then.
- **Projects on Node 20 or older:** below today's declared floor (`>=22`), whatever a historical row says about an older tag. Move to a line the release you install verifies: Node 22 or Node 24 today, Node 26 once the release after `v5.2.0` is published. See [Migration 11](/migration-guide/#migration-11-node-20-to-node-24-lambda-runtime) for the Lambda-runtime side and this page for the package side.

## Reproducing these claims locally

Each row above is a committed evidence record, verified by CI without executing anything. A row names two records — the `ts` gate (the suite and the clean-consumer install) and the `ts-pack` gate (the packed package) — so reproducing a line means re-executing both on that line, not one of them.

Collection is incremental: a record that still applies to the tree is reused and its commands do not run. Every command below therefore carries `--force`, which re-executes the gate inside the digest-pinned image its profile names. Drop `--force` and you are re-verifying the committed record instead of reproducing the claim.

```bash
# oldest line (deprecated, still tested): suite + consumer install, then package
scripts/evidence/collect-in-container.sh --gate ts --profile floor-node22 --force
scripts/evidence/collect-in-container.sh --gate ts-pack --profile floor-node22 --force

# middle line
scripts/evidence/collect-in-container.sh --gate ts --profile floor-node24 --force
scripts/evidence/collect-in-container.sh --gate ts-pack --profile floor-node24 --force

# newest line
scripts/evidence/collect-in-container.sh --gate ts --profile floor-node26 --force
scripts/evidence/collect-in-container.sh --gate ts-pack --profile floor-node26 --force

# verify what CI verifies, for the tree you are about to push (executes nothing)
scripts/evidence/verify-all.sh
```

`scripts/evidence/collect-all.sh --force` re-executes every gate and profile in one run, including the `examples-local`, `deterministic-builds`, `theorycloud-subtree` and `rubric` records beside the Node lines.

The gate matrix, the proof profiles and their digest-pinned images live in `scripts/evidence/validation-gates.json`; [Validation evidence](/development/validation-evidence/) explains how a record binds to its inputs and where verify ends and a fresh run begins.
