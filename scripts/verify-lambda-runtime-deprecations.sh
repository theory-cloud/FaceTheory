#!/usr/bin/env bash
# Purpose: fail when a FaceTheory surface that declares an AWS Lambda runtime
# declares one AWS has deprecated (nodejs20.x and older).
#
# The checker owns the scope, the deprecated set, and the modelled declaration
# forms. This wrapper deliberately accepts no arguments and always runs the
# checker's self-test before the scan, so no caller can narrow the scan or waive
# a surface.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if ! command -v node >/dev/null 2>&1; then
  echo "lambda-runtime-deprecations: BLOCKED (node not found)" >&2
  exit 2
fi
for surface in \
  "infra/apptheory-ssr-site/src/stack.ts" \
  "infra/apptheory-ssg-isr-site/src/stack.ts" \
  "ts/src/create-templates/index.ts"; do
  if [[ ! -f "${surface}" ]]; then
    echo "lambda-runtime-deprecations: FAIL (missing ${surface})" >&2
    exit 1
  fi
done
if [[ "$#" -ne 0 ]]; then
  echo "lambda-runtime-deprecations: FAIL (this gate takes no arguments)" >&2
  exit 1
fi

node scripts/check-lambda-runtime-deprecations.mjs --self-test
