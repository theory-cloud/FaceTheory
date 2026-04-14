.PHONY: ts-build ts-typecheck ts-lint ts-format ts-format-check ts-test verify-version-alignment verify-ts-pack build-release-assets ensure-release-branches test-ensure-release-branches stage-theorycloud-facetheory-subtree verify-theorycloud-facetheory-subtree sync-theorycloud-facetheory-subtree trigger-theorycloud-publish test-theorycloud-targets test-trigger-theorycloud-publish-awscurl rubric

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

verify-version-alignment:
	./scripts/verify-version-alignment.sh

verify-ts-pack:
	./scripts/verify-ts-pack.sh

build-release-assets:
	./scripts/build-release-assets.sh "$$(./scripts/read-version.sh)" dist

ensure-release-branches:
	./scripts/ensure-release-branches.sh

test-ensure-release-branches:
	./scripts/test-ensure-release-branches.sh

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

rubric: ts-typecheck ts-lint ts-test verify-version-alignment verify-ts-pack
