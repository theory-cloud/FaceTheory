#!/usr/bin/env bash
# Purpose: prove the packed package works for a consumer project that holds
# nothing from this repository.
#
# `ts-pack` proves the tarball unpacks. This gate proves it *runs*: the packed
# artifact is installed into an empty project whose only other dependencies are
# the React peer pair the adapter renders with, and the consumer fixture then
# imports the published entry points, renders one SSR Face twice (the two
# renders must be byte-identical) and builds one SSG site onto a real
# filesystem.
#
# Nothing is skipped and nothing fails soft. A missing tarball, a missing
# export, a render difference or an empty SSG output exits non-zero. The gate
# runs under every supported Node major, so its record is the claim a release
# makes about the line it was produced on.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${repo_root}"

for tool in node npm; do
  if ! command -v "${tool}" >/dev/null 2>&1; then
    echo "consumer-install: BLOCKED (${tool} not found)" >&2
    exit 2
  fi
done

if [[ ! -d "ts" ]]; then
  echo "consumer-install: FAIL (missing ts/)" >&2
  exit 1
fi
if [[ ! -f "ts/package-lock.json" ]]; then
  echo "consumer-install: FAIL (missing ts/package-lock.json)" >&2
  exit 1
fi
if [[ ! -f "scripts/fixtures/consumer-install/ts/consumer.mjs" ]]; then
  echo "consumer-install: FAIL (missing the consumer fixture)" >&2
  exit 1
fi

version="$(./scripts/read-version.sh)"
expected_tgz="theory-cloud-facetheory-${version}.tgz"

# The consumer installs the same React peer pair this repository's own suite
# renders against, at the versions pinned in ts/package.json.
react_range="$(node -p "require('./ts/package.json').devDependencies.react")"
react_dom_range="$(node -p "require('./ts/package.json').devDependencies['react-dom']")"
if [[ -z "${react_range}" || -z "${react_dom_range}" ]]; then
  echo "consumer-install: FAIL (ts/package.json does not pin the React peer pair)" >&2
  exit 1
fi

work_dir="$(mktemp -d)"
trap 'rm -rf "${work_dir}"' EXIT

package_dir="${work_dir}/package"
artifacts_dir="${work_dir}/artifacts"
consumer_dir="${work_dir}/consumer"

# Pack the artifact exactly the way the release does: a clean copy of ts/, its
# own dependency install, its own build, npm pack.
cp -a ts "${package_dir}"
rm -rf "${package_dir}/node_modules" "${package_dir}/dist"
(cd "${package_dir}" && npm ci --ignore-scripts --no-audit --no-fund >/dev/null)
(cd "${package_dir}" && npm run build >/dev/null)

mkdir -p "${artifacts_dir}"
(cd "${package_dir}" && npm pack --silent --pack-destination "${artifacts_dir}" >/dev/null)

tarball="${artifacts_dir}/${expected_tgz}"
if [[ ! -f "${tarball}" ]]; then
  echo "consumer-install: FAIL (npm pack did not produce ${expected_tgz})" >&2
  exit 1
fi

# An empty consumer project. It carries no FaceTheory sources, no tsconfig, no
# workspace and no link back to this checkout.
mkdir -p "${consumer_dir}"
cat >"${consumer_dir}/package.json" <<'JSON'
{
  "name": "facetheory-consumer-install",
  "private": true,
  "version": "0.0.0",
  "type": "module"
}
JSON

(cd "${consumer_dir}" &&
  npm install --ignore-scripts --no-audit --no-fund --save-exact \
    "${tarball}" "react@${react_range}" "react-dom@${react_dom_range}" >/dev/null)

installed_package="${consumer_dir}/node_modules/@theory-cloud/facetheory/package.json"
if [[ ! -f "${installed_package}" ]]; then
  echo "consumer-install: FAIL (the tarball did not install @theory-cloud/facetheory)" >&2
  exit 1
fi

installed_version="$(node -p "require('${installed_package}').version")"
if [[ "${installed_version}" != "${version}" ]]; then
  echo "consumer-install: FAIL (installed ${installed_version}, expected ${version})" >&2
  exit 1
fi

cp scripts/fixtures/consumer-install/ts/consumer.mjs "${consumer_dir}/consumer.mjs"

echo "consumer-install(ts): node $(node --version), npm $(npm --version)"
echo "consumer-install(ts): artifact ${expected_tgz}, react ${react_range}, react-dom ${react_dom_range}"

(cd "${consumer_dir}" && node consumer.mjs)

echo "consumer-install: PASS (${expected_tgz} on node $(node --version))"
