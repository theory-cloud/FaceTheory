#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
guard="${repo_root}/scripts/verify-release-publish-binding.sh"

fail() {
  echo "test-verify-release-publish-binding: FAIL ($*)"
  exit 1
}

tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT

seed() {
  local target="$1"
  mkdir -p "${target}/.github/workflows"
  cp "${repo_root}/.github/workflows/release.yml" "${target}/.github/workflows/"
  cp "${repo_root}/.github/workflows/prerelease.yml" "${target}/.github/workflows/"
}

run_guard() {
  REPO_ROOT="$1" bash "${guard}"
}

# Positive: the committed publication sites satisfy every invariant.
seed "${tmpdir}/positive"
run_guard "${tmpdir}/positive" >/dev/null || fail "committed publication sites failed the guard"

# Negative: a publication site that does not receive the verified source commit.
seed "${tmpdir}/no-expected"
python3 - "${tmpdir}/no-expected/.github/workflows/release.yml" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
lines = [line for line in path.read_text(encoding="utf-8").splitlines() if "EXPECTED_SOURCE_COMMIT:" not in line]
path.write_text("\n".join(lines) + "\n", encoding="utf-8")
PY
if run_guard "${tmpdir}/no-expected" >/dev/null 2>&1; then
  fail "publication site without EXPECTED_SOURCE_COMMIT unexpectedly passed"
fi

# Negative: one site loses the binding block (parity break).
seed "${tmpdir}/asymmetric"
python3 - "${tmpdir}/asymmetric/.github/workflows/prerelease.yml" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
lines = path.read_text(encoding="utf-8").splitlines()
start = next(i for i, line in enumerate(lines) if "release-publish-target-binding:start" in line)
end = next(i for i, line in enumerate(lines) if "release-publish-target-binding:end" in line)
del lines[start : end + 1]
path.write_text("\n".join(lines) + "\n", encoding="utf-8")
PY
if run_guard "${tmpdir}/asymmetric" >/dev/null 2>&1; then
  fail "site without the binding block unexpectedly passed"
fi

# Negative: the binding no longer re-resolves a mutable branch target.
seed "${tmpdir}/no-branch-check"
python3 - "${tmpdir}/no-branch-check/.github/workflows/release.yml" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
needle = '              gh api "repos/${repo}/branches/${target_commitish#refs/heads/}" --jq .commit.sha 2>/dev/null || true\n'
path.write_text(text.replace(needle, "              true\n"), encoding="utf-8")
PY
if run_guard "${tmpdir}/no-branch-check" >/dev/null 2>&1; then
  fail "binding without branch re-resolution unexpectedly passed"
fi

# Negative: the target pin happens after the draft is published.
seed "${tmpdir}/late-pin"
python3 - "${tmpdir}/late-pin/.github/workflows/release.yml" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
lines = path.read_text(encoding="utf-8").splitlines()
target = next(
    i for i, line in enumerate(lines) if '-f "target_commitish=${expected_source_commit}" >/dev/null' in line
)
start = max(
    i
    for i in range(target)
    if 'gh api --method PATCH "repos/${repo}/releases/${release_id}"' in lines[i]
)
pin_lines = lines[start : target + 1]
del lines[start : target + 1]
draft = next(i for i, line in enumerate(lines) if "-F draft=false" in line)
lines[draft + 1 : draft + 1] = pin_lines
path.write_text("\n".join(lines) + "\n", encoding="utf-8")
PY
if run_guard "${tmpdir}/late-pin" >/dev/null 2>&1; then
  fail "target pinned after publish unexpectedly passed"
fi

# Negative: the final publish PATCH stops re-asserting the pinned target.
seed "${tmpdir}/unpinned-publish"
python3 - "${tmpdir}/unpinned-publish/.github/workflows/release.yml" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
needle = (
    '            -F draft=false \\\n'
    '            -f "tag_name=${TAG_NAME}" \\\n'
    '            -f "target_commitish=${expected_source_commit}" \\\n'
    '            -F prerelease=false \\\n'
)
path.write_text(
    text.replace(
        needle,
        '            -F draft=false \\\n'
        '            -f "tag_name=${TAG_NAME}" \\\n'
        '            -F prerelease=false \\\n',
        1,
    ),
    encoding="utf-8",
)
PY
if run_guard "${tmpdir}/unpinned-publish" >/dev/null 2>&1; then
  fail "final publish PATCH without the pinned target unexpectedly passed"
fi

# Runtime: execute the exact binding block from the workflow against a mocked gh.
stub_dir="${tmpdir}/stub"
mkdir -p "${stub_dir}"
cat > "${stub_dir}/gh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
[[ "${1:-}" == "api" ]] || { echo "unexpected gh invocation: $*" >&2; exit 1; }
shift
method="GET"
endpoint=""
fields=()
while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --method)
      method="$2"
      shift 2
      ;;
    --jq|-H|--header)
      shift 2
      ;;
    -f|--field)
      fields+=("$2")
      shift 2
      ;;
    *)
      if [[ -z "${endpoint}" ]]; then endpoint="$1"; fi
      shift
      ;;
  esac
done
if [[ "${method}" == "PATCH" ]]; then
  printf 'PATCH %s %s\n' "${endpoint}" "${fields[*]}" >> "${FAKE_GH_LOG}"
  echo "{}"
  exit 0
fi
case "${endpoint}" in
  */branches/*)
    printf '%s\n' "${FAKE_BRANCH_SHA}"
    ;;
  *)
    echo "unexpected gh endpoint: ${endpoint}" >&2
    exit 1
    ;;
esac
SH
chmod +x "${stub_dir}/gh"

harness="${tmpdir}/harness.sh"
expected_sha="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
other_sha="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
{
  echo '#!/usr/bin/env bash'
  echo 'set -euo pipefail'
  echo 'repo="theory-cloud/FaceTheory"'
  echo 'release_id="99"'
  echo 'TAG_NAME="v1.2.3"'
  echo 'EXPECTED_SOURCE_COMMIT="$2"'
  echo 'release_fields=("99" "false" "upload" "html" "$1")'
  python3 - "${repo_root}/.github/workflows/release.yml" <<'PY'
import sys
from pathlib import Path

lines = Path(sys.argv[1]).read_text(encoding="utf-8").splitlines()
start = next(i for i, line in enumerate(lines) if "release-publish-target-binding:start" in line)
end = next(i for i, line in enumerate(lines) if "release-publish-target-binding:end" in line)
for line in lines[start + 1 : end]:
    print(line)
PY
  echo 'echo BINDING-PASS'
} > "${harness}"

run_binding() {
  local target="$1" expected="$2" branch_sha="$3" log="$4"
  PATH="${stub_dir}:${PATH}" FAKE_GH_LOG="${log}" FAKE_BRANCH_SHA="${branch_sha}" \
    bash "${harness}" "${target}" "${expected}"
}

# Positive: the draft already targets the verified full SHA.
log="${tmpdir}/sha.log"
run_binding "${expected_sha}" "${expected_sha}" "" "${log}" >/dev/null ||
  fail "exact-SHA publish target did not pass"
grep -Fq "PATCH repos/theory-cloud/FaceTheory/releases/99 tag_name=v1.2.3 target_commitish=${expected_sha}" "${log}" ||
  fail "exact-SHA publish target was not pinned via PATCH with its tag name"

# Positive: a branch target that still resolves to the verified SHA.
log="${tmpdir}/branch.log"
run_binding "main" "${expected_sha}" "${expected_sha}" "${log}" >/dev/null ||
  fail "branch target resolving to the verified SHA did not pass"
grep -Fq "tag_name=v1.2.3" "${log}" ||
  fail "branch target PATCH did not re-assert the tag name"
grep -Fq "target_commitish=${expected_sha}" "${log}" ||
  fail "branch target was not pinned to the verified SHA"

# Negative: a branch that moved after verification.
if run_binding "main" "${expected_sha}" "${other_sha}" "${tmpdir}/drift.log" >/dev/null 2>&1; then
  fail "moved branch publish target unexpectedly passed"
fi

# Negative: an exact SHA that is not the verified source commit.
if run_binding "${other_sha}" "${expected_sha}" "" "${tmpdir}/wrong.log" >/dev/null 2>&1; then
  fail "mismatched publish target unexpectedly passed"
fi

# Negative: a missing expected source commit.
if run_binding "${expected_sha}" "" "" "${tmpdir}/missing.log" >/dev/null 2>&1; then
  fail "missing expected source commit unexpectedly passed"
fi

# Negative: the binding PATCH stops re-asserting the release tag name. This is
# the 2026-10-17 regression shape: GitHub rewrites the draft tag to
# untagged-<hex> and publishing creates that placeholder tag.
seed "${tmpdir}/binding-no-tag"
python3 - "${tmpdir}/binding-no-tag/.github/workflows/release.yml" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
lines = path.read_text(encoding="utf-8").splitlines()
start = next(i for i, line in enumerate(lines) if "release-publish-target-binding:start" in line)
end = next(i for i, line in enumerate(lines) if "release-publish-target-binding:end" in line)
drop = next(i for i in range(start, end) if "tag_name=${TAG_NAME}" in lines[i])
del lines[drop]
path.write_text("\n".join(lines) + "\n", encoding="utf-8")
PY
if run_guard "${tmpdir}/binding-no-tag" >/dev/null 2>&1; then
  fail "binding PATCH without tag_name unexpectedly passed"
fi

# Negative: the final publish PATCH stops re-asserting the release tag name.
seed "${tmpdir}/publish-no-tag"
python3 - "${tmpdir}/publish-no-tag/.github/workflows/release.yml" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
lines = path.read_text(encoding="utf-8").splitlines()
draft = next(i for i, line in enumerate(lines) if "-F draft=false" in line)
drop = next(i for i in range(draft, len(lines)) if "tag_name=${TAG_NAME}" in lines[i])
del lines[drop]
path.write_text("\n".join(lines) + "\n", encoding="utf-8")
PY
if run_guard "${tmpdir}/publish-no-tag" >/dev/null 2>&1; then
  fail "publish PATCH without tag_name unexpectedly passed"
fi

# Negative: a publication site stops verifying the published release tag.
seed "${tmpdir}/no-postcondition"
python3 - "${tmpdir}/no-postcondition/.github/workflows/prerelease.yml" <<'PY'
import re
import sys
from pathlib import Path

path = Path(sys.argv[1])
lines = path.read_text(encoding="utf-8").splitlines()
start = next(i for i, line in enumerate(lines) if "name: Verify published release tag" in line)
end = next(i for i in range(start + 1, len(lines)) if re.match(r"^  [A-Za-z0-9_-]+:\s*$", lines[i]))
del lines[start : end]
path.write_text("\n".join(lines) + "\n", encoding="utf-8")
PY
if run_guard "${tmpdir}/no-postcondition" >/dev/null 2>&1; then
  fail "publication site without the published-tag postcondition unexpectedly passed"
fi

# Negative: the publish step stops exporting the release id for the postcondition.
seed "${tmpdir}/no-release-id"
python3 - "${tmpdir}/no-release-id/.github/workflows/release.yml" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
lines = [
    line
    for line in path.read_text(encoding="utf-8").splitlines()
    if 'echo "release_id=${release_id}" >> "${GITHUB_OUTPUT}"' not in line
]
path.write_text("\n".join(lines) + "\n", encoding="utf-8")
PY
if run_guard "${tmpdir}/no-release-id" >/dev/null 2>&1; then
  fail "postcondition without an exported release id unexpectedly passed"
fi

# Static: cleanup-failed-draft must keep deleting drafts only. A failed publish
# postcondition must never make the cleanup job delete a published release.
for workflow in .github/workflows/prerelease.yml .github/workflows/release.yml; do
  grep -Fq 'map(select(.tag_name == env.TAG_NAME and .draft == true))' "${workflow}" ||
    fail "${workflow} cleanup must only delete draft releases"
done

# Runtime: the published-release-tag postcondition script.
post_script="${repo_root}/scripts/verify-published-release-tag.sh"
post_stub_dir="${tmpdir}/post-stub"
mkdir -p "${post_stub_dir}"
cat > "${post_stub_dir}/gh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
[[ "${1:-}" == "api" ]] || { echo "unexpected gh invocation: $*" >&2; exit 1; }
shift
endpoint="${1:-}"
case "${endpoint}" in
  */releases/99)
    [[ -n "${FAKE_RELEASE_JSON:-}" ]] || exit 1
    printf '%s\n' "${FAKE_RELEASE_JSON}"
    ;;
  */git/ref/tags/*)
    [[ -n "${FAKE_REF_JSON:-}" ]] || exit 1
    printf '%s\n' "${FAKE_REF_JSON}"
    ;;
  */git/tags/*)
    [[ -n "${FAKE_TAG_JSON:-}" ]] || exit 1
    printf '%s\n' "${FAKE_TAG_JSON}"
    ;;
  *)
    echo "unexpected gh endpoint: ${endpoint}" >&2
    exit 1
    ;;
esac
SH
chmod +x "${post_stub_dir}/gh"

run_postcondition_script() {
  local script="$1" tag="$2" release_json="$3" ref_json="$4" tag_json="$5" log="$6"
  PATH="${post_stub_dir}:${PATH}" \
  GH_BIN="${post_stub_dir}/gh" \
  GITHUB_REPOSITORY="theory-cloud/FaceTheory" \
  FAKE_RELEASE_JSON="${release_json}" \
  FAKE_REF_JSON="${ref_json}" \
  FAKE_TAG_JSON="${tag_json}" \
    bash "${script}" "${tag}" "99" "${expected_sha}" >"${log}" 2>&1
}

run_postcondition() {
  run_postcondition_script "${post_script}" "$@"
}

published_rc='{"draft":false,"tag_name":"v1.2.3-rc","prerelease":true}'
published_stable='{"draft":false,"tag_name":"v1.2.3","prerelease":false}'
ref_commit="{\"object\":{\"type\":\"commit\",\"sha\":\"${expected_sha}\"}}"
ref_annotated='{"object":{"type":"tag","sha":"cccccccccccccccccccccccccccccccccccccccc"}}'
tag_object="{\"object\":{\"type\":\"commit\",\"sha\":\"${expected_sha}\"}}"

# Positive: published RC, correct tag, lightweight tag ref on the source commit.
if ! run_postcondition "v1.2.3-rc" "${published_rc}" "${ref_commit}" "" "${tmpdir}/post-pass.log"; then
  cat "${tmpdir}/post-pass.log" >&2
  fail "published RC with a correct tag ref failed the postcondition"
fi
grep -Fq "published-release-tag: PASS (v1.2.3-rc -> ${expected_sha})" "${tmpdir}/post-pass.log" ||
  fail "published-tag postcondition did not report the resolved tag"

# Positive: an annotated tag is dereferenced to its commit.
if ! run_postcondition "v1.2.3-rc" "${published_rc}" "${ref_annotated}" "${tag_object}" "${tmpdir}/post-annotated.log"; then
  cat "${tmpdir}/post-annotated.log" >&2
  fail "annotated published tag failed the postcondition"
fi

# Negative (a): GitHub kept the untagged-<hex> placeholder.
if run_postcondition "v1.2.3-rc" '{"draft":false,"tag_name":"untagged-fb5dc7816e2a84b46b74","prerelease":true}' "${ref_commit}" "" "${tmpdir}/post-untagged.log"; then
  fail "untagged placeholder release tag unexpectedly passed"
fi
grep -Fq 'tag_name untagged-fb5dc7816e2a84b46b74 != v1.2.3-rc' "${tmpdir}/post-untagged.log" ||
  fail "untagged placeholder did not report the tag mismatch"

# Negative (b): the tag ref does not exist.
if run_postcondition "v1.2.3-rc" "${published_rc}" "" "" "${tmpdir}/post-missing-ref.log"; then
  fail "missing tag ref unexpectedly passed"
fi
grep -Fq 'missing git tag ref refs/tags/v1.2.3-rc' "${tmpdir}/post-missing-ref.log" ||
  fail "missing tag ref did not report the missing ref"

# Negative (c): the tag ref points at another commit.
if run_postcondition "v1.2.3-rc" "${published_rc}" "{\"object\":{\"type\":\"commit\",\"sha\":\"${other_sha}\"}}" "" "${tmpdir}/post-wrong-ref.log"; then
  fail "tag ref on another commit unexpectedly passed"
fi
grep -Fq "points at ${other_sha}, expected ${expected_sha}" "${tmpdir}/post-wrong-ref.log" ||
  fail "wrong tag ref did not report the commit mismatch"

# Negative: the release is still a draft.
if run_postcondition "v1.2.3-rc" '{"draft":true,"tag_name":"v1.2.3-rc","prerelease":true}' "${ref_commit}" "" "${tmpdir}/post-draft.log"; then
  fail "draft release unexpectedly passed the publish postcondition"
fi

# Negative: the release object omits the draft field. Only an explicit
# `draft: false` proves publication; absence must fail closed.
if run_postcondition "v1.2.3-rc" '{"tag_name":"v1.2.3-rc","prerelease":true}' "${ref_commit}" "" "${tmpdir}/post-missing-draft.log"; then
  fail "release without a draft field unexpectedly passed"
fi
grep -Fq 'draft=missing, expected exactly false' "${tmpdir}/post-missing-draft.log" ||
  fail "missing draft field did not fail closed with a draft diagnostic"

# Negative: a null draft field must fail closed as well.
if run_postcondition "v1.2.3-rc" '{"draft":null,"tag_name":"v1.2.3-rc","prerelease":true}' "${ref_commit}" "" "${tmpdir}/post-null-draft.log"; then
  fail "release with a null draft field unexpectedly passed"
fi

# Negative: the prerelease flag does not match the tag shape.
if run_postcondition "v1.2.3-rc" '{"draft":false,"tag_name":"v1.2.3-rc","prerelease":false}' "${ref_commit}" "" "${tmpdir}/post-rc-flag.log"; then
  fail "RC published as a stable release unexpectedly passed"
fi
if run_postcondition "v1.2.3" '{"draft":false,"tag_name":"v1.2.3","prerelease":true}' "${ref_commit}" "" "${tmpdir}/post-stable-flag.log"; then
  fail "stable tag published as a prerelease unexpectedly passed"
fi

# Negative: the release cannot be read back.
if run_postcondition "v1.2.3-rc" "" "${ref_commit}" "" "${tmpdir}/post-missing-release.log"; then
  fail "unreadable release unexpectedly passed"
fi

# Mutation probe: restoring the lenient parser that treated a missing draft
# field as published must make the missing-draft case pass. That is precisely
# what the negative assertion above rejects, proving the case is sensitive to
# the strict `draft == false` check.
lenient_postcondition="${tmpdir}/verify-published-release-tag-lenient.sh"
python3 - "${post_script}" "${lenient_postcondition}" <<'PY'
import sys
from pathlib import Path

source = Path(sys.argv[1]).read_text(encoding="utf-8")
needle = '''if "draft" not in data:
    print("missing")
elif data.get("draft") is False:
    print("false")
else:
    print("true")
'''
if needle not in source:
    raise SystemExit("strict draft parsing no longer present")
Path(sys.argv[2]).write_text(
    source.replace(needle, 'print("false" if data.get("draft") is not True else "true")\n', 1),
    encoding="utf-8",
)
PY
if ! run_postcondition_script "${lenient_postcondition}" "v1.2.3-rc" '{"tag_name":"v1.2.3-rc","prerelease":true}' "${ref_commit}" "" "${tmpdir}/post-missing-draft-lenient.log"; then
  fail "lenient draft parsing still rejected a missing draft field"
fi

echo "test-verify-release-publish-binding: PASS"
