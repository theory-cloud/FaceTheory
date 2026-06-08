# Served govern prompt references

FaceTheory does not vendor the namespace-managed govern prompt bodies. The THE-1952 scaffold was applied from `govern_lifecycle_turn` responses for `phase=govern`, `repo_key=facetheory`.

Served resources consulted:

- Lifecycle pack: `govern`
- Contract/profile: `theorycloud_governance_profile.v0.1`
- Profile resource: `theorymcp://namespaces/theorycloud/governance-profiles/theorycloud_governance_profile.v0.1/profiles/software_repo_gov_infra`
- Start prompt: `theorymcp://namespaces/theorycloud/lifecycle-packs/govern/genome/files/prompts%2Fgov-init.prompt.md`
- Validate prompt: `theorymcp://namespaces/theorycloud/lifecycle-packs/govern/genome/files/prompts%2Fgov-validate.prompt.md`
- Report schema: `theorymcp://namespaces/theorycloud/governance-profiles/theorycloud_governance_profile.v0.1/schemas/gov_rubric_report.v1`
- Served source commit: `bc41187efb6f5b3c3bfb4d9295836d4e071941d7`

The committed artifacts under `gov-infra/` are processed FaceTheory outputs, not a second copy of the platform scaffold.
