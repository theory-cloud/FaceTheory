#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
script_src="${repo_root}/scripts/build-release-assets.sh"

fail() {
  echo "test-build-release-assets: FAIL ($*)" >&2
  exit 1
}

scratch="$(mktemp -d)"
cleanup() {
  chmod -R u+rwX "${scratch}" 2>/dev/null || true
  rm -rf "${scratch}"
}
trap cleanup EXIT

# Stub npm so the test exercises the tracked-source reference assembly without a
# real (networked) install/build.
bin_dir="${scratch}/bin"
mkdir -p "${bin_dir}"
cat > "${bin_dir}/npm" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "pack" ]]; then
  dest=""
  shift
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --pack-destination) dest="$2"; shift 2 ;;
      *) shift ;;
    esac
  done
  [[ -n "${dest}" ]] || exit 1
  version="$(node -e "console.log(require('./package.json').version)")"
  printf 'stub-package\n' > "${dest}/theory-cloud-facetheory-${version}.tgz"
fi
exit 0
SH
chmod +x "${bin_dir}/npm"

make_fixture() {
  local dir="$1"
  mkdir -p "${dir}/scripts" "${dir}/docs" "${dir}/ts/examples/example-a" \
    "${dir}/infra/apptheory-ssr-site/src" "${dir}/infra/apptheory-ssr-site/deploy"
  cp "${script_src}" "${dir}/scripts/build-release-assets.sh"
  printf '{"name":"fixture","version":"1.2.3"}\n' > "${dir}/ts/package.json"
  printf 'root readme\n' > "${dir}/README.md"
  printf 'changelog\n' > "${dir}/CHANGELOG.md"
  printf 'license\n' > "${dir}/LICENSE"
  printf 'ts readme\n' > "${dir}/ts/README.md"
  printf 'ts license\n' > "${dir}/ts/LICENSE"
  printf 'docs readme\n' > "${dir}/docs/README.md"
  printf 'tracked doc\n' > "${dir}/docs/tracked.md"
  printf 'example\n' > "${dir}/ts/examples/example-a/README.md"
  printf 'infra src\n' > "${dir}/infra/apptheory-ssr-site/src/stack.ts"
  printf 'committed deploy snapshot\n' > "${dir}/infra/apptheory-ssr-site/deploy/keep.txt"
  git -C "${dir}" init -q
  git -C "${dir}" add -A
  # Hermetic COMMIT-FREE fixture: write the index to a tree object and point the
  # fixture HEAD straight at it. `git archive HEAD` accepts any tree-ish, so the
  # real build script's tracked-source assembly is exercised without ever
  # creating a commit object or touching git signing configuration.
  local tree
  tree="$(git -C "${dir}" write-tree)"
  printf '%s\n' "${tree}" > "${dir}/.git/HEAD"
  if git -C "${dir}" rev-parse --verify --quiet 'HEAD^{commit}' >/dev/null 2>&1; then
    fail "fixture unexpectedly created a commit object"
  fi
}

run_build() {
  local dir="$1" out="$2"
  PATH="${bin_dir}:${PATH}" bash "${dir}/scripts/build-release-assets.sh" "1.2.3" "${out}"
}

# Ordinary: tracked source is bundled; committed deploy snapshots stay pruned.
clean="${scratch}/clean"
make_fixture "${clean}"
clean_out="${scratch}/clean-out"
if ! run_build "${clean}" "${clean_out}" >"${scratch}/clean.log" 2>&1; then
  cat "${scratch}/clean.log" >&2
  fail "clean reference build failed"
fi
ref="${clean_out}/facetheory-reference-1.2.3.tar.gz"
[[ -f "${ref}" ]] || fail "reference tarball was not produced"
[[ -f "${clean_out}/theory-cloud-facetheory-1.2.3.tgz" ]] || fail "package tarball was not produced"
[[ -f "${clean_out}/SHA256SUMS.txt" ]] || fail "SHA256SUMS.txt was not produced"
mapfile -t entries < <(tar -tzf "${ref}")
printf '%s\n' "${entries[@]}" | grep -qx 'facetheory-reference-1.2.3/docs/tracked.md' || fail "tracked docs file missing from bundle"
printf '%s\n' "${entries[@]}" | grep -qx 'facetheory-reference-1.2.3/ts/examples/example-a/README.md' || fail "tracked example missing from bundle"
printf '%s\n' "${entries[@]}" | grep -qx 'facetheory-reference-1.2.3/README.md' || fail "root README missing from bundle"
if printf '%s\n' "${entries[@]}" | grep -q 'infra/apptheory-ssr-site/deploy/'; then
  fail "committed deploy snapshot was not pruned from the bundle"
fi

# Negative: an untracked sensitive file under a shipped root is rejected, and it
# can never enter the reference bundle.
dirty="${scratch}/dirty"
make_fixture "${dirty}"
printf 'SECRET=leaked\n' > "${dirty}/docs/secret-untracked.env"
dirty_out="${scratch}/dirty-out"
if run_build "${dirty}" "${dirty_out}" >"${scratch}/dirty.log" 2>&1; then
  fail "untracked file under a shipped root was not rejected"
fi
grep -Fq "untracked files under shipped reference roots" "${scratch}/dirty.log" || fail "untracked rejection was not reported"
if [[ -f "${dirty_out}/facetheory-reference-1.2.3.tar.gz" ]]; then
  fail "reference bundle was produced despite an untracked sensitive file"
fi
if grep -rqs "SECRET=leaked" "${dirty_out}" 2>/dev/null; then
  fail "untracked sensitive content leaked into release assets"
fi

# Determinism: two identical builds produce identical reference bytes (GNU tar
# only; BSD tar does not honour SOURCE_DATE_EPOCH repacking).
if tar --version 2>/dev/null | grep -q 'GNU tar'; then
  det_a="${scratch}/det-a"
  det_b="${scratch}/det-b"
  SOURCE_DATE_EPOCH=1700000000 PATH="${bin_dir}:${PATH}" \
    bash "${clean}/scripts/build-release-assets.sh" "1.2.3" "${det_a}" >"${scratch}/det-a.log" 2>&1 \
    || { cat "${scratch}/det-a.log" >&2; fail "first deterministic build failed"; }
  SOURCE_DATE_EPOCH=1700000000 PATH="${bin_dir}:${PATH}" \
    bash "${clean}/scripts/build-release-assets.sh" "1.2.3" "${det_b}" >"${scratch}/det-b.log" 2>&1 \
    || { cat "${scratch}/det-b.log" >&2; fail "second deterministic build failed"; }
  cmp -s "${det_a}/facetheory-reference-1.2.3.tar.gz" "${det_b}/facetheory-reference-1.2.3.tar.gz" \
    || fail "reference bundle is not deterministic"
fi

echo "test-build-release-assets: PASS"
