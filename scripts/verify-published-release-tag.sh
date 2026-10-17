#!/usr/bin/env bash
# Purpose: fail closed after a draft release is published when the published
# release did not get the intended tag.
#
# Incident 2026-10-17: the `release-publish-target-binding` block from
# FACESEC45-M1 (#532) PATCHed the draft release without `tag_name`. GitHub
# replaced the draft's tag name with its `untagged-<hex>` placeholder, and the
# final `-F draft=false` PATCH created that placeholder tag, so the RC run went
# green while `v5.0.0-rc` never existed. The asset upload had already been
# performed by the time the old postcondition ran, and that postcondition only
# checked release-please outputs, never the published release itself.
#
# Invariants enforced after the publish PATCH at every publication site
# (prerelease, stable, existing-tag):
#   A. the release read back by id is published: `draft` is present and exactly
#      `false` (a missing or null field fails closed);
#   B. its `tag_name` is exactly the intended tag;
#   C. its `prerelease` flag matches the tag shape (RC tag => prerelease);
#   D. `git/ref/tags/<tag>` exists and resolves (dereferencing annotated tag
#      objects) to the verified, immutable source commit.
#
# Usage: verify-published-release-tag.sh <tag> <release-id> <expected-commit>
set -euo pipefail

tag="${1:-}"
release_id="${2:-}"
expected_commit="${3:-}"
gh_bin="${GH_BIN:-gh}"
repo="${GITHUB_REPOSITORY:-}"

fail() {
  echo "published-release-tag: FAIL ($*)" >&2
  exit 1
}

if [[ -z "${tag}" ]]; then
  fail "missing tag name"
fi
if [[ ! "${tag}" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]*$ ]]; then
  fail "unsupported tag name ${tag}"
fi
if [[ ! "${release_id}" =~ ^[0-9]+$ ]]; then
  fail "missing release id"
fi
if [[ ! "${expected_commit}" =~ ^[0-9a-f]{40}$ ]]; then
  fail "missing expected source commit"
fi
if ! command -v "${gh_bin}" >/dev/null 2>&1; then
  fail "${gh_bin} not found"
fi

if [[ -z "${repo}" ]]; then
  remote_url="$(git config --get remote.origin.url 2>/dev/null || true)"
  case "${remote_url}" in
    https://github.com/*.git)
      repo="${remote_url#https://github.com/}"
      repo="${repo%.git}"
      ;;
    https://github.com/*)
      repo="${remote_url#https://github.com/}"
      ;;
    git@github.com:*.git)
      repo="${remote_url#git@github.com:}"
      repo="${repo%.git}"
      ;;
  esac
fi
if [[ -z "${repo}" ]]; then
  fail "missing GITHUB_REPOSITORY and could not infer repo"
fi

release_json="$("${gh_bin}" api "repos/${repo}/releases/${release_id}" 2>/dev/null || true)"
if [[ -z "${release_json}" ]]; then
  fail "could not read release ${release_id}"
fi

mapfile -t release_fields < <(
  RELEASE_JSON="${release_json}" python3 - <<'PY'
import json
import os

data = json.loads(os.environ["RELEASE_JSON"])
if "draft" not in data:
    print("missing")
elif data.get("draft") is False:
    print("false")
else:
    print("true")
print(data.get("tag_name") or "")
print("true" if data.get("prerelease") is True else "false")
PY
)

is_draft="${release_fields[0]:-}"
release_tag="${release_fields[1]:-}"
is_prerelease="${release_fields[2]:-}"

if [[ "${is_draft}" != "false" ]]; then
  fail "release ${release_id} is not published (draft=${is_draft:-<missing>}, expected exactly false)"
fi
if [[ "${release_tag}" != "${tag}" ]]; then
  fail "published release ${release_id} tag_name ${release_tag:-<empty>} != ${tag}"
fi

expected_prerelease="false"
if [[ "${tag}" =~ -rc(\.|$) ]]; then
  expected_prerelease="true"
fi
if [[ "${is_prerelease}" != "${expected_prerelease}" ]]; then
  fail "published release ${release_id} prerelease ${is_prerelease:-<empty>} != ${expected_prerelease}"
fi

mapfile -t ref_fields < <(
  REF_JSON="$("${gh_bin}" api "repos/${repo}/git/ref/tags/${tag}" 2>/dev/null || true)" python3 - <<'PY'
import json
import os

raw = os.environ.get("REF_JSON") or ""
if not raw:
    print("")
    print("")
    raise SystemExit(0)
data = json.loads(raw)
obj = data.get("object") or {}
print(obj.get("type") or "")
print(obj.get("sha") or "")
PY
)

ref_type="${ref_fields[0]:-}"
ref_sha="${ref_fields[1]:-}"
if [[ -z "${ref_type}" || -z "${ref_sha}" ]]; then
  fail "missing git tag ref refs/tags/${tag}"
fi

hop=0
while [[ "${ref_type}" != "commit" ]]; do
  if [[ "${ref_type}" != "tag" ]]; then
    fail "refs/tags/${tag} resolves to unsupported object type ${ref_type}"
  fi
  hop=$((hop + 1))
  if [[ "${hop}" -gt 5 ]]; then
    fail "refs/tags/${tag} tag object chain is too deep"
  fi
  mapfile -t ref_fields < <(
    TAG_JSON="$("${gh_bin}" api "repos/${repo}/git/tags/${ref_sha}" 2>/dev/null || true)" python3 - <<'PY'
import json
import os

raw = os.environ.get("TAG_JSON") or ""
if not raw:
    print("")
    print("")
    raise SystemExit(0)
data = json.loads(raw)
obj = data.get("object") or {}
print(obj.get("type") or "")
print(obj.get("sha") or "")
PY
  )
  ref_type="${ref_fields[0]:-}"
  ref_sha="${ref_fields[1]:-}"
  if [[ -z "${ref_type}" || -z "${ref_sha}" ]]; then
    fail "could not dereference refs/tags/${tag} annotated tag object"
  fi
done

if [[ "${ref_sha}" != "${expected_commit}" ]]; then
  fail "refs/tags/${tag} points at ${ref_sha}, expected ${expected_commit}"
fi

echo "published-release-tag: PASS (${tag} -> ${expected_commit})"
