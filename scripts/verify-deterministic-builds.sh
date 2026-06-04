#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if ! command -v sha256sum >/dev/null 2>&1; then
  echo "deterministic-builds: BLOCKED (sha256sum not found)" >&2
  exit 1
fi

version="$(./scripts/read-version.sh)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

export SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-1700000000}"

if ! scripts/build-release-assets.sh "${version}" "${tmp_dir}/one" >"${tmp_dir}/one.log" 2>&1; then
  cat "${tmp_dir}/one.log" >&2
  echo "deterministic-builds: FAIL (first release asset build failed)" >&2
  exit 1
fi
if ! scripts/build-release-assets.sh "${version}" "${tmp_dir}/two" >"${tmp_dir}/two.log" 2>&1; then
  cat "${tmp_dir}/two.log" >&2
  echo "deterministic-builds: FAIL (second release asset build failed)" >&2
  exit 1
fi

for dir in one two; do
  (
    cd "${tmp_dir}/${dir}"
    sha256sum \
      "theory-cloud-facetheory-${version}.tgz" \
      "facetheory-reference-${version}.tar.gz" \
      SHA256SUMS.txt | sort -k2
  ) > "${tmp_dir}/${dir}.sha256"
done

if ! diff -u "${tmp_dir}/one.sha256" "${tmp_dir}/two.sha256"; then
  echo "deterministic-builds: FAIL (release assets changed between identical builds)" >&2
  exit 1
fi

echo "deterministic-builds: PASS (${version})"
