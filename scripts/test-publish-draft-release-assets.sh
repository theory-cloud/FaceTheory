#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
script_path="${repo_root}/scripts/publish-draft-release-assets.sh"
tag="v1.2.3-rc"
target_commit="1111111111111111111111111111111111111111"

fail() {
  echo "test-publish-draft-release-assets: FAIL ($*)" >&2
  exit 1
}

write_fake_gh() {
  local bin_dir="$1"
  mkdir -p "${bin_dir}"
  cat > "${bin_dir}/apply_patch.py" <<'PY'
import hashlib
import json
import sys
from pathlib import Path

release_path = Path(sys.argv[1])
tags_dir = Path(sys.argv[2])
fields = {}
for arg in sys.argv[3:]:
    if "=" in arg:
        key, value = arg.split("=", 1)
        fields[key] = value

data = json.loads(release_path.read_text(encoding="utf-8"))
for key, value in fields.items():
    if key == "draft":
        data["draft"] = value == "true"
    elif key == "prerelease":
        data["prerelease"] = value == "true"
    else:
        data[key] = value

# Observed GitHub behavior (2026-10-17 RC incident): re-pointing a draft
# release's target without re-asserting tag_name drops the draft back to the
# `untagged-<hex>` placeholder, and publishing then creates that placeholder
# tag instead of the intended tag.
if "tag_name" not in fields and "target_commitish" in fields:
    digest = hashlib.sha256(
        f'{data.get("id")}:{data["target_commitish"]}'.encode("utf-8")
    ).hexdigest()[:20]
    data["tag_name"] = f"untagged-{digest}"

if data.get("draft") is False:
    (tags_dir / data["tag_name"]).write_text(
        (data.get("target_commitish") or "") + "\n", encoding="utf-8"
    )

release_path.write_text(json.dumps(data), encoding="utf-8")
PY
  cat > "${bin_dir}/gh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "${FAKE_GH_LOG}"
state="${FAKE_GH_STATE:?}"
if [[ "$1" == "api" ]]; then
  shift
  method="GET"
  endpoint=""
  input=""
  jq_expr=""
  fields=()
  while [[ "$#" -gt 0 ]]; do
    case "$1" in
      --method)
        method="$2"
        shift 2
        ;;
      --header|-H)
        shift 2
        ;;
      --input)
        input="$2"
        shift 2
        ;;
      -F|--field)
        fields+=("$2")
        shift 2
        ;;
      --jq)
        jq_expr="$2"
        shift 2
        ;;
      *)
        if [[ -z "${endpoint}" ]]; then
          endpoint="$1"
        fi
        shift
        ;;
    esac
  done
  case "${method} ${endpoint}" in
    "GET repos/theory-cloud/FaceTheory/releases?per_page=100&page=1")
      cat "${state}/list.json"
      ;;
    "GET repos/theory-cloud/FaceTheory/releases/99")
      cat "${state}/release.json"
      ;;
    "GET repos/theory-cloud/FaceTheory/releases/99/assets")
      if [[ "${jq_expr:-}" == ".[].name" ]]; then
        printf '%s\n' 'facetheory-reference-1.2.3-rc.tar.gz'
      else
        cat "${state}/assets.json"
      fi
      ;;
    "POST https://uploads.github.com/repos/theory-cloud/FaceTheory/releases/99/assets?name=theory-cloud-facetheory-1.2.3-rc.tgz"|"POST https://uploads.github.com/repos/theory-cloud/FaceTheory/releases/99/assets?name=SHA256SUMS.txt")
      [[ -n "${input}" && -f "${input}" ]] || exit 1
      printf '{"state":"uploaded"}\n'
      ;;
    "PATCH repos/theory-cloud/FaceTheory/releases/99")
      python3 "$(dirname "$0")/apply_patch.py" "${state}/release.json" "${state}/tags" "${fields[@]}"
      cat "${state}/release.json"
      ;;
    *)
      echo "unexpected gh api invocation: method=${method} endpoint=${endpoint}" >&2
      exit 1
      ;;
  esac
  exit 0
fi
if [[ "$1 $2" == "release view" ]]; then
  echo "release view should not be used when releases list returns an id" >&2
  exit 1
fi
echo "unexpected gh invocation: $*" >&2
exit 1
SH
  chmod +x "${bin_dir}/gh"
}

seed_state() {
  local state="$1"
  local tag_name="$2"
  local draft="$3"
  local prerelease="$4"
  mkdir -p "${state}/tags"
  python3 - "${state}" "${tag_name}" "${draft}" "${prerelease}" "${target_commit}" <<'PY'
import json
import sys
from pathlib import Path

state = Path(sys.argv[1])
tag_name = sys.argv[2]
draft = sys.argv[3] == "true"
prerelease = sys.argv[4] == "true"
target_commit = sys.argv[5]
release = {
    "id": 99,
    "tag_name": tag_name,
    "target_commitish": target_commit,
    "draft": draft,
    "prerelease": prerelease,
    "upload_url": "https://uploads.github.com/repos/theory-cloud/FaceTheory/releases/99/assets{?name,label}",
    "html_url": f"https://github.test/releases/{tag_name}",
}
(state / "release.json").write_text(json.dumps(release), encoding="utf-8")
(state / "list.json").write_text(json.dumps([release]), encoding="utf-8")
(state / "assets.json").write_text(
    json.dumps([{"name": "facetheory-reference-1.2.3-rc.tar.gz"}]), encoding="utf-8"
)
PY
}

published_tag() {
  local state="$1"
  python3 - "${state}/release.json" <<'PY'
import json
import sys

print(json.load(open(sys.argv[1], encoding="utf-8"))["tag_name"])
PY
}

run_script() {
  local state="$1"
  local script="$2"
  local log="$3"
  FAKE_GH_STATE="${state}" FAKE_GH_LOG="${log}" \
    GH_BIN="${bin_dir}/gh" \
    GITHUB_REPOSITORY="theory-cloud/FaceTheory" \
    bash "${script}" "${tag}" "${dist_dir}"
}

publish_patch_reasserts_tag() {
  local log="$1"
  grep -Eq "PATCH repos/theory-cloud/FaceTheory/releases/99( +[^ ]+)* +tag_name=${tag}( |$)" "${log}"
}

tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT
bin_dir="${tmpdir}/bin"
dist_dir="${tmpdir}/dist"
mkdir -p "${dist_dir}"
printf 'pkg' > "${dist_dir}/theory-cloud-facetheory-1.2.3-rc.tgz"
printf 'ref' > "${dist_dir}/facetheory-reference-1.2.3-rc.tar.gz"
printf 'sum' > "${dist_dir}/SHA256SUMS.txt"
write_fake_gh "${bin_dir}"

# Positive: the committed script publishes the draft under its intended tag.
state="${tmpdir}/state"
log_file="${tmpdir}/gh.log"
seed_state "${state}" "${tag}" true true
out="$(run_script "${state}" "${script_path}" "${log_file}")"

grep -Fq 'release-assets: skip existing facetheory-reference-1.2.3-rc.tar.gz' <<<"${out}" || fail "existing asset was not skipped"
grep -Fq "release-assets: published ${tag}" <<<"${out}" || fail "release was not published"
grep -Fq 'POST https://uploads.github.com/repos/theory-cloud/FaceTheory/releases/99/assets?name=theory-cloud-facetheory-1.2.3-rc.tgz' "${log_file}" || fail "package asset upload missing"
grep -Fq 'POST https://uploads.github.com/repos/theory-cloud/FaceTheory/releases/99/assets?name=SHA256SUMS.txt' "${log_file}" || fail "checksum upload missing"
if grep -Fq 'POST https://uploads.github.com/repos/theory-cloud/FaceTheory/releases/99/assets?name=facetheory-reference-1.2.3-rc.tar.gz' "${log_file}"; then
  fail "existing reference asset was uploaded"
fi
grep -Fq 'PATCH repos/theory-cloud/FaceTheory/releases/99' "${log_file}" || fail "publish patch missing"
publish_patch_reasserts_tag "${log_file}" || fail "publish PATCH must re-assert tag_name"
if grep -Fq 'release view' "${log_file}"; then
  fail "script fell back to gh release view despite release id"
fi
[[ "$(published_tag "${state}")" == "${tag}" ]] || fail "published release kept a placeholder tag name"
[[ -f "${state}/tags/${tag}" ]] || fail "publishing did not create the intended tag"
[[ "$(cat "${state}/tags/${tag}")" == "${target_commit}" ]] || fail "published tag does not point at the release target"
if compgen -G "${state}/tags/untagged-*" >/dev/null; then
  fail "publishing created an untagged placeholder tag"
fi

# Mutation probe: dropping tag_name from the publish PATCH must be detected.
mutated_dir="${tmpdir}/mutated-scripts"
mkdir -p "${mutated_dir}"
cp "${repo_root}/scripts/release-json-by-tag.sh" "${mutated_dir}/"
mutated="${mutated_dir}/publish-mutated.sh"
python3 - "${script_path}" "${mutated}" <<'PY'
import sys
from pathlib import Path

source = Path(sys.argv[1]).read_text(encoding="utf-8")
needle = '    -f "tag_name=${tag}" \\\n'
if needle not in source:
    raise SystemExit("publish PATCH no longer re-asserts tag_name")
Path(sys.argv[2]).write_text(source.replace(needle, "", 1), encoding="utf-8")
PY
mutated_state="${tmpdir}/mutated-state"
mutated_log="${tmpdir}/mutated.log"
seed_state "${mutated_state}" "${tag}" true true
run_script "${mutated_state}" "${mutated}" "${mutated_log}" >/dev/null
if publish_patch_reasserts_tag "${mutated_log}"; then
  fail "removing tag_name from the publish PATCH was not detected"
fi

echo "test-publish-draft-release-assets: PASS"
