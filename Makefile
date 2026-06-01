.PHONY: ts-build ts-typecheck ts-lint ts-format ts-format-check ts-test verify-control-plane-guardrails verify-version-alignment verify-ts-pack verify-npm-audit verify-go-version-pin build-release-assets ensure-release-branches test-ensure-release-branches test-verify-release-draft-target test-check-release-baseline-ready test-resolve-release-source-ref test-publish-draft-release-assets test-verify-release-readiness test-release-workflow-changelog-preservation stage-theorycloud-facetheory-subtree verify-theorycloud-facetheory-subtree sync-theorycloud-facetheory-subtree trigger-theorycloud-publish test-theorycloud-targets test-trigger-theorycloud-publish-awscurl rubric

ts-build:
	cd ts && npm run build

ts-typecheck:
	cd ts && npm run typecheck

ts-lint:
	cd ts && npm run lint

ts-format:
	cd ts && npm run format

ts-format-check:
	cd ts && npm run format:check

ts-test:
	cd ts && npm test

verify-control-plane-guardrails:
	cd ts && npm run guardrail:control-plane

verify-version-alignment:
	./scripts/verify-version-alignment.sh

verify-ts-pack:
	./scripts/verify-ts-pack.sh

verify-npm-audit:
	./scripts/verify-npm-audit.sh

verify-go-version-pin:
	./scripts/verify-go-version-pin.sh

build-release-assets:
	./scripts/build-release-assets.sh "$$(./scripts/read-version.sh)" dist

ensure-release-branches:
	./scripts/ensure-release-branches.sh

test-ensure-release-branches:
	./scripts/test-ensure-release-branches.sh

test-verify-release-draft-target:
	./scripts/test-verify-release-draft-target.sh

test-check-release-baseline-ready:
	./scripts/test-check-release-baseline-ready.sh

test-release-workflow-changelog-preservation:
	./scripts/test-release-workflow-changelog-preservation.sh

test-resolve-release-source-ref:
	./scripts/test-resolve-release-source-ref.sh

test-publish-draft-release-assets:
	./scripts/test-publish-draft-release-assets.sh

test-verify-release-readiness:
	./scripts/test-verify-release-readiness.sh

stage-theorycloud-facetheory-subtree:
	./scripts/stage_theorycloud_facetheory_subtree.sh --output "$${THEORYCLOUD_FACETHEORY_SUBTREE_OUTPUT_DIR:-/tmp/facetheory-theorycloud}"

verify-theorycloud-facetheory-subtree:
	./scripts/verify_theorycloud_facetheory_subtree.sh "$${THEORYCLOUD_FACETHEORY_SUBTREE_OUTPUT_DIR:-/tmp/facetheory-theorycloud}"

sync-theorycloud-facetheory-subtree:
	./scripts/sync_theorycloud_facetheory_subtree.sh --stage "$${THEORYCLOUD_STAGE:-lab}" --output "$${THEORYCLOUD_FACETHEORY_SUBTREE_OUTPUT_DIR:-/tmp/facetheory-theorycloud}"

trigger-theorycloud-publish:
	./scripts/trigger_theorycloud_publish.sh --stage "$${THEORYCLOUD_STAGE:-lab}"

test-theorycloud-targets:
	./scripts/test-theorycloud-targets.sh

test-trigger-theorycloud-publish-awscurl:
	./scripts/test-trigger-theorycloud-publish-awscurl.sh

rubric: ts-typecheck ts-lint ts-test verify-control-plane-guardrails verify-version-alignment verify-ts-pack verify-npm-audit verify-go-version-pin test-verify-release-draft-target test-check-release-baseline-ready test-resolve-release-source-ref test-publish-draft-release-assets test-verify-release-readiness test-release-workflow-changelog-preservation
