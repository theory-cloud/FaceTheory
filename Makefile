.PHONY: ts-build ts-typecheck ts-lint ts-format ts-format-check ts-test verify-version-alignment verify-ts-pack build-release-assets rubric

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

rubric: ts-typecheck ts-lint ts-test verify-version-alignment verify-ts-pack
