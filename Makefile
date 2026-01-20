.PHONY: ts-build ts-typecheck ts-lint ts-format ts-test

ts-build:
	cd ts && npm run build

ts-typecheck:
	cd ts && npm run typecheck

ts-lint:
	cd ts && npm run lint

ts-format:
	cd ts && npm run format

ts-test:
	cd ts && npm test

