#!/usr/bin/env bash
# Purpose: the local-examples gate command. It runs the harness self-test, every
# configured row through the released AppTheory local runner, and the teardown,
# and it binds the runner release the manifest pins.
#
# The runner tag lives in scripts/local/examples-local.json and nowhere else:
# this command reports it into the record instead of restating it, so a pin move
# changes one file.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${repo_root}"

runner_version="$(python3 - <<'PY'
import json
from pathlib import Path
manifest = json.loads(Path("scripts/local/examples-local.json").read_text(encoding="utf-8"))
runner = manifest["profile"]["apptheoryRunner"]
print(f"{runner['package']}@{runner['version']}")
PY
)"

echo "examples-local: runner ${runner_version}"
echo "examples-local: harness self-test"
node --test scripts/local/test-examples-local.mjs

# The infra packages install their own dependencies inside the harness target;
# the producing host and the container both start from a directory that has
# none, so this is not a host-only shortcut.
if [[ ! -d ts/node_modules ]]; then
  echo "examples-local: installing ts dependencies"
  (cd ts && npm ci --ignore-scripts --no-audit --no-fund)
fi

echo "examples-local: build the package the examples import"
(cd ts && npm run build)

echo "examples-local: install the pinned runner"
node scripts/local/run-examples-local.mjs --install-runner

echo "examples-local: install the infra examples' own dependencies"
for dir in infra/apptheory-ssr-site infra/apptheory-ssg-isr-site; do
  if [[ ! -d "${dir}/node_modules" ]]; then
    echo "examples-local: installing ${dir} dependencies"
    (cd "${dir}" && npm ci --ignore-scripts --no-audit --no-fund)
  fi
done

echo "examples-local: run every configured row"
node scripts/local/run-examples-local.mjs

echo "examples-local: teardown"
node scripts/local/run-examples-local.mjs --down

echo "examples-local: PASS (${runner_version})"
