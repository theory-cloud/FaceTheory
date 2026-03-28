# FaceTheory Documentation

This is the official documentation index for the canonical `docs/` surface.

## Quick Links

- [Changelog](../CHANGELOG.md)
- [Docs Contract](./_contract.yaml)
- [Getting Started](./getting-started.md)
- [API Reference](./api-reference.md)
- [Core Patterns](./core-patterns.md)
- [Testing Guide](./testing-guide.md)
- [Troubleshooting](./troubleshooting.md)
- [Migration Guide](./migration-guide.md)
- [Development Guidelines](./development-guidelines.md)
- [Concepts](./_concepts.yaml)
- [Patterns](./_patterns.yaml)
- [Decisions](./_decisions.yaml)
- [CDK And AWS Notes](./cdk/README.md)

## Scope

Canonical root:

- `docs/`

Fixed ingestible docs:

- `docs/README.md`
- `docs/_concepts.yaml`
- `docs/_patterns.yaml`
- `docs/_decisions.yaml`
- `docs/getting-started.md`
- `docs/api-reference.md`
- `docs/core-patterns.md`
- `docs/testing-guide.md`
- `docs/troubleshooting.md`
- `docs/migration-guide.md`

Fixed contract-only docs:

- `docs/_contract.yaml`
- `docs/development-guidelines.md`

Sanctioned optional ingestible docs:

- `docs/cdk/**`
- `docs/migration/**`
- `docs/llm-faq/**`

Out of scope for canonical retrieval:

- `docs/development/**`
- `docs/planning/**`
- `docs/internal/**`
- `docs/archive/**`

Roadmap and checklist material lives under `docs/planning/` so the root of `docs/` stays focused on the public contract.

## What FaceTheory Covers

FaceTheory is a TypeScript runtime for AWS-first SSR, SSG, and blocking ISR with package exports for React, Vue, and Svelte adapters, plus AppTheory and TableTheory integration points.

Use this doc set for supported interfaces, setup, verification, troubleshooting, and deployment guidance. Keep roadmap or planning material out of this navigation path.

The `v0.2.0-rc.2` GitHub release ships the runtime tarball, a reference bundle with docs plus examples, and `SHA256SUMS.txt` so consumers can install without cloning the repository. <!-- x-release-please-version -->
