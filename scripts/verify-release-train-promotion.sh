#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

base=""
head=""
base_ref=""
head_sha=""
github_repository="${GITHUB_REPOSITORY:-}"
github_head_repository=""
pr_title=""
pr_author=""
remote="origin"
self_test="false"

# The canonical generated Release Please identity. The release workflow passes
# `secrets.RELEASE_PLEASE_TOKEN || github.token`, and no PAT secret exists, so
# release-please opens PRs with the default workflow token, which GitHub reports
# as this bot login. A different author means the generated-PR exception must be
# revisited in the same change that introduces it.
release_please_author="github-actions[bot]"

usage() {
  cat <<'USAGE'
usage: scripts/verify-release-train-promotion.sh --base <branch> --head <branch> [--base-ref <ref>] [--head-sha <sha>] [--github-repository owner/name] [--github-head-repository owner/name] [--pr-title <title>] [--pr-author <login>]
       scripts/verify-release-train-promotion.sh --self-test
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base) base="${2:-}"; shift 2 ;;
    --head) head="${2:-}"; shift 2 ;;
    --base-ref) base_ref="${2:-}"; shift 2 ;;
    --head-sha) head_sha="${2:-}"; shift 2 ;;
    --github-repository) github_repository="${2:-}"; shift 2 ;;
    --github-head-repository) github_head_repository="${2:-}"; shift 2 ;;
    --pr-title) pr_title="${2:-}"; shift 2 ;;
    --pr-author) pr_author="${2:-}"; shift 2 ;;
    --self-test) self_test="true"; shift ;;
    --help|-h) usage; exit 0 ;;
    *) echo "release-train-promotion: FAIL (unknown argument $1)" >&2; usage >&2; exit 1 ;;
  esac
done

fail() {
  echo "release-train-promotion: FAIL ($1)" >&2
  exit 1
}

pass() {
  echo "release-train-promotion: PASS ($1)"
}

normalize_branch() {
  local value="$1"
  value="${value#refs/heads/}"
  printf '%s\n' "${value}"
}

require_ref() {
  local ref="$1"
  git rev-parse --verify --quiet "${ref}^{commit}" >/dev/null || fail "missing ${ref}; fetch staging, premain, and main before running"
}

sha_for_ref() {
  local ref="$1"
  git rev-parse --verify "${ref}^{commit}"
}

release_ref() {
  local branch="$1"
  local ref="refs/remotes/${remote}/${branch}"
  require_ref "${ref}"
  printf '%s\n' "${ref}"
}

branch_sha() {
  sha_for_ref "$(release_ref "$1")"
}

# Reserved promotion edges (`main -> staging`, `staging -> premain`,
# `premain -> main`, and the generated release-please PRs) name a protected
# branch as their PR head, so the gate must bind the submitted head to that
# branch: the head repository has to be this repository, so a fork branch merely
# *named* `main`/`premain`/`staging` cannot impersonate a protected promotion,
# and for the symbolic edges the submitted head SHA must be exactly the fetched
# protected branch tip.
require_head_repository_is_trusted() {
  local description="$1"
  if [[ "${github_head_repository}" != "${github_repository}" ]]; then
    fail "${description}: head repository ${github_head_repository} is not ${github_repository}; a fork cannot target a reserved promotion branch"
  fi
}

require_reserved_head_binding() {
  local head_branch="$1"
  local description="$2"
  local tip

  [[ -n "${head_sha}" ]] || fail "${description} requires --head-sha"
  require_head_repository_is_trusted "${description}"
  tip="$(branch_sha "${head_branch}")"
  if [[ "${head_sha}" != "${tip}" ]]; then
    fail "${description}: submitted head ${head_sha} is not the fetched ${head_branch} tip ${tip}"
  fi
}

is_ancestor_ref() {
  local ancestor="$1"
  local descendant="$2"
  git merge-base --is-ancestor "${ancestor}" "${descendant}"
}

# Release-train promotion requires the protected target to carry no content
# outside the promoted source. Literal ancestry can over-reject when the target
# tip is a merge commit whose content is already contained in the source: after
# `staging -> premain` merges, the new premain tip is a merge whose tree is the
# staging tree it merged, while staging has since advanced past it.
#
# The fallback used to ask only whether `git rev-list --no-merges --count
# source..target` was zero, but a merge commit carries its own tree and can
# introduce conflict-resolution or crafted content absent from every parent,
# which `--no-merges` hides from the count. The two conditions below close that:
# no non-merge commit may diverge, AND the target tip's tree must be a tree the
# source already carries in its history. A tip tree the source has never seen
# means the target holds content outside the promoted source, however it was
# constructed, so it fails closed.
target_has_no_content_outside_source() {
  local source_ref="$1"
  local target_ref="$2"
  local extra_count target_tree tree

  extra_count="$(git rev-list --no-merges --count "${source_ref}..${target_ref}")"
  [[ "${extra_count}" == "0" ]] || return 1

  target_tree="$(git rev-parse "${target_ref}^{tree}")"
  while IFS= read -r tree; do
    if [[ "${tree}" == "${target_tree}" ]]; then
      return 0
    fi
  done < <(git log --format=%T "${source_ref}")
  return 1
}

require_protected_ancestor() {
  local ancestor_branch="$1"
  local descendant_branch="$2"
  local description="$3"
  local ancestor_ref descendant_ref
  ancestor_ref="$(release_ref "${ancestor_branch}")"
  descendant_ref="$(release_ref "${descendant_branch}")"
  if is_ancestor_ref "${ancestor_ref}" "${descendant_ref}"; then
    return 0
  fi
  if target_has_no_content_outside_source "${descendant_ref}" "${ancestor_ref}"; then
    return 0
  fi
  fail "${description}: ${ancestor_branch} is not an ancestor of ${descendant_branch}"
}

api_compare_status() {
  local ancestor_sha="$1"
  local descendant_sha="$2"
  local label="$3"

  if [[ "${ancestor_sha}" == "${descendant_sha}" ]]; then
    printf 'identical\n'
    return 0
  fi
  if [[ ! "${ancestor_sha}" =~ ^[0-9a-f]{40}$ || ! "${descendant_sha}" =~ ^[0-9a-f]{40}$ ]]; then
    fail "${label}: expected 40-character commit SHAs"
  fi
  if git cat-file -e "${descendant_sha}^{commit}" 2>/dev/null; then
    if git merge-base --is-ancestor "${ancestor_sha}" "${descendant_sha}"; then
      printf 'ahead\n'
    else
      printf 'diverged\n'
    fi
    return 0
  fi
  if ! command -v gh >/dev/null 2>&1; then
    fail "${label}: gh is required to verify PR head ancestry without fetching untrusted refs"
  fi

  local encoded_base encoded_head
  encoded_base="$(python3 - "${ancestor_sha}" <<'PY'
import sys, urllib.parse
print(urllib.parse.quote(sys.argv[1], safe=''))
PY
)"
  encoded_head="$(python3 - "${descendant_sha}" <<'PY'
import sys, urllib.parse
print(urllib.parse.quote(sys.argv[1], safe=''))
PY
)"

  gh api "repos/${github_repository}/compare/${encoded_base}...${encoded_head}" --jq '.status'
}

require_sha_contains_branch() {
  local ancestor_branch="$1"
  local descendant_sha="$2"
  local description="$3"
  local ancestor_sha status
  ancestor_sha="$(branch_sha "${ancestor_branch}")"
  status="$(api_compare_status "${ancestor_sha}" "${descendant_sha}" "${description}")" || fail "${description}: compare API failed"
  case "${status}" in
    ahead|identical) ;;
    *) fail "${description}: ${ancestor_branch} is not an ancestor of PR head (${status})" ;;
  esac
}

require_release_please_identity() {
  local description="$1"
  [[ -n "${pr_author}" ]] || fail "${description}: --pr-author is required to bind a generated Release Please PR to the canonical identity"
  if [[ "${pr_author}" != "${release_please_author}" ]]; then
    fail "${description}: PR author ${pr_author} is not the canonical Release Please identity ${release_please_author}"
  fi
}

release_please_base_ref() {
  local branch="$1"
  local ref
  if [[ -n "${base_ref}" ]]; then
    ref="${base_ref}"
  else
    ref="refs/remotes/${remote}/${branch}"
  fi
  require_ref "${ref}"
  printf '%s\n' "${ref}"
}

read_manifest_version() {
  local rev="$1"
  local manifest="$2"
  local output
  output="$(git show "${rev}:${manifest}" 2>/dev/null)" || fail "generated Release Please PR is missing ${manifest} at ${rev}"
  python3 -c 'import json,sys; print(json.load(sys.stdin)["."])' <<<"${output}" 2>/dev/null \
    || fail "generated Release Please PR has an unreadable ${manifest} at ${rev}"
}

require_release_please_title() {
  local line="$1"
  local version="$2"
  local expected="chore(${line}): release ${version}"
  [[ -n "${pr_title}" ]] || fail "generated ${line} Release Please PR requires --pr-title"
  if [[ "${pr_title}" != "${expected}" ]]; then
    fail "generated ${line} Release Please PR title '${pr_title}' is not the generated expectation '${expected}'"
  fi
}

# A generated release PR is fast-passed past feature review, so it must carry
# exactly the output Release Please derives from the protected branch: the same
# tree with only the version files, the annotated version markers, and one
# prepended changelog section changed. Anything else means the head is not the
# generated release and has to go through the ordinary review path.
verify_generated_release_diff() {
  local line="$1"
  local head_rev="$2"
  local base_rev="$3"

  git cat-file -e "${head_rev}^{commit}" 2>/dev/null \
    || fail "generated ${line} Release Please PR head ${head_rev} is not fetched; fetch refs/heads/<head> before running this gate"

  if ! python3 - "${line}" "${base_rev}" "${head_rev}" <<'PY'
import json
import re
import subprocess
import sys

line, base_rev, head_rev = sys.argv[1:4]

STABLE_MANIFEST = ".release-please-manifest.json"
PREMAIN_MANIFEST = ".release-please-manifest.premain.json"
VERSION_MARKER = "x-release-please-version"


def fail(message):
    print(f"release-train-promotion: FAIL ({message})", file=sys.stderr)
    raise SystemExit(1)


def show(rev, path):
    result = subprocess.run(
        ["git", "show", f"{rev}:{path}"], capture_output=True, text=True
    )
    if result.returncode != 0:
        fail(f"generated {line} Release Please PR is missing {path} at {rev}")
    return result.stdout


if line == "main":
    manifest = STABLE_MANIFEST
    changelog = "CHANGELOG.md"
    expected_files = {
        STABLE_MANIFEST,
        PREMAIN_MANIFEST,
        changelog,
        "VERSION",
        "README.md",
        "docs/README.md",
        "docs/api-reference.md",
        "docs/getting-started.md",
        "ts/README.md",
        "ts/package-lock.json",
        "ts/package.json",
    }
    required_files = {
        STABLE_MANIFEST,
        PREMAIN_MANIFEST,
        changelog,
        "VERSION",
        "ts/package-lock.json",
        "ts/package.json",
    }
    version_pattern = re.compile(r"^\d+\.\d+\.\d+$")
else:
    manifest = PREMAIN_MANIFEST
    changelog = "CHANGELOG.prerelease.md"
    expected_files = {
        PREMAIN_MANIFEST,
        changelog,
        "VERSION",
        "README.md",
        "docs/README.md",
        "docs/api-reference.md",
        "docs/getting-started.md",
        "ts/README.md",
        "ts/package-lock.json",
        "ts/package.json",
    }
    required_files = {
        PREMAIN_MANIFEST,
        changelog,
        "VERSION",
        "ts/package-lock.json",
        "ts/package.json",
    }
    version_pattern = re.compile(r"^\d+\.\d+\.\d+-rc(\.\d+)?$")


def manifest_version(rev):
    data = json.loads(show(rev, manifest))
    value = data.get(".")
    if not isinstance(value, str):
        fail(f"generated {line} Release Please PR has no root version in {manifest} at {rev}")
    return value


def version_key(value):
    match = re.fullmatch(r"(\d+)\.(\d+)\.(\d+)(?:-rc(?:\.(\d+))?)?", value)
    if not match:
        fail(f"generated {line} Release Please PR version {value} is not a release version")
    core = tuple(int(part) for part in match.group(1, 2, 3))
    if "-rc" not in value:
        return core + (1, 0)
    return core + (0, int(match.group(4) or 0))


def update_json(rev, path, updates):
    data = json.loads(show(rev, path))
    for keys, value in updates:
        target = data
        for key in keys[:-1]:
            if not isinstance(target.get(key), dict):
                fail(f"generated {line} Release Please PR expected {path} to carry {keys}, but it does not")
            target = target[key]
        target[keys[-1]] = value
    return data


VERSION_TOKEN = re.compile(r"\d+\.\d+\.\d+(?:-rc(?:\.\d+)?)?")
VERSION_RANGE_START = "x-release-please-start-version"
VERSION_RANGE_END = "x-release-please-end"


def update_marked_versions(text, new_version):
    # Release Please rewrites the version on every annotated line and inside
    # every annotated version range, whatever version that line currently names.
    # The base tree can carry a different version there than its own manifest
    # (the premain RC release rewrites the markers, and a later stable release
    # moves them again).
    lines = []
    in_range = False
    for source_line in text.splitlines(keepends=True):
        if VERSION_RANGE_END in source_line:
            in_range = False
            lines.append(VERSION_TOKEN.sub(new_version, source_line))
            continue
        if VERSION_RANGE_START in source_line:
            in_range = True
            lines.append(VERSION_TOKEN.sub(new_version, source_line))
            continue
        if in_range or VERSION_MARKER in source_line:
            lines.append(VERSION_TOKEN.sub(new_version, source_line))
        else:
            lines.append(source_line)
    return "".join(lines)


base_version = manifest_version(base_rev)
head_version = manifest_version(head_rev)

if base_version == head_version:
    fail(f"generated {line} Release Please PR leaves the version at {head_version}")
if not version_pattern.match(head_version):
    fail(f"generated {line} Release Please PR version {head_version} does not match the {line} release line")
if version_key(head_version) <= version_key(base_version):
    fail(
        f"generated {line} Release Please PR version {head_version} is not newer than the base version {base_version}"
    )

diff = subprocess.run(
    ["git", "diff", "--name-status", "--no-renames", base_rev, head_rev],
    capture_output=True,
    text=True,
)
if diff.returncode != 0:
    fail(f"could not read the generated {line} Release Please PR diff")
changed = {}
for raw_line in diff.stdout.splitlines():
    if not raw_line.strip():
        continue
    parts = raw_line.split("\t")
    if len(parts) != 2:
        fail(f"could not parse the generated {line} Release Please PR diff line: {raw_line}")
    status, path = parts
    changed[path] = status

unexpected = sorted(set(changed) - expected_files)
if unexpected:
    fail(
        "generated {0} Release Please PR changed paths outside the generated set: {1}".format(
            line, ", ".join(unexpected)
        )
    )
missing = sorted(required_files - set(changed))
if missing:
    fail(
        "generated {0} Release Please PR did not update required release files: {1}".format(
            line, ", ".join(missing)
        )
    )
for path in sorted(changed):
    if changed[path] != "M":
        fail(
            f"generated {line} Release Please PR must only modify release files, but {path} is {changed[path]}"
        )

for path in sorted(changed):
    head_text = show(head_rev, path)
    base_text = show(base_rev, path)

    if path in (STABLE_MANIFEST, PREMAIN_MANIFEST, "ts/package.json"):
        expected = update_json(base_rev, path, [((".",), head_version)] if path != "ts/package.json" else [(("version",), head_version)])
        if json.loads(head_text) != expected:
            fail(f"generated {line} Release Please PR {path} is not the generated version update")
        continue

    if path == "ts/package-lock.json":
        expected = update_json(
            base_rev,
            path,
            [(("version",), head_version), (("packages", "", "version"), head_version)],
        )
        if json.loads(head_text) != expected:
            fail(f"generated {line} Release Please PR {path} is not the generated version update")
        continue

    if path == changelog:
        head_prefix = "# Changelog\n\n"
        if not head_text.startswith(head_prefix):
            fail(f"generated {line} Release Please PR {path} does not start with the changelog title")
        base_anchor = base_text.find("\n## [")
        first_section = head_text.find("\n## [")
        second_section = head_text.find("\n## [", first_section + 1)
        if base_anchor < 0 or first_section < 0 or second_section < 0:
            fail(f"generated {line} Release Please PR {path} does not carry a prepended release section")
        if head_text[: first_section + 1] != head_prefix:
            fail(f"generated {line} Release Please PR {path} changes content before the release section")
        if head_text[second_section:] != base_text[base_anchor:]:
            fail(f"generated {line} Release Please PR {path} rewrites changelog history")
        section = head_text[first_section + 1 : second_section + 1]
        heading = section.splitlines()[0] if section.splitlines() else ""
        if not heading.startswith(f"## [{head_version}]("):
            fail(f"generated {line} Release Please PR {path} release section does not name {head_version}")
        if f"compare/v{base_version}...v{head_version}" not in heading:
            fail(f"generated {line} Release Please PR {path} release section does not compare {base_version} to {head_version}")
        continue

    expected_text = update_marked_versions(base_text, head_version)
    if head_text != expected_text:
        fail(f"generated {line} Release Please PR {path} is not the generated version marker update")
PY
  then
    exit 1
  fi
}

self_test_commit() {
  local tree="$1"
  shift
  GIT_AUTHOR_NAME="FaceTheory Release Self Test" \
  GIT_AUTHOR_EMAIL="facetheory-release-self-test@example.invalid" \
  GIT_AUTHOR_DATE="2026-06-19T00:00:00Z" \
  GIT_COMMITTER_NAME="FaceTheory Release Self Test" \
  GIT_COMMITTER_EMAIL="facetheory-release-self-test@example.invalid" \
  GIT_COMMITTER_DATE="2026-06-19T00:00:00Z" \
    git commit-tree "${tree}" "$@"
}

self_test_tree() {
  local content="$1"
  local blob
  blob="$(printf '%s\n' "${content}" | git hash-object -w --stdin)"
  printf '100644 blob %s\tself-test.txt\n' "${blob}" | git mktree
}

self_test_release_train_promotion() {
  local test_remote="facetheory-release-self-test/$$"
  local ref_prefix="refs/remotes/${test_remote}"
  local cleanup_refs=()
  local empty_tree content_tree rogue_tree
  local baseline source target_merge rogue_target output

  cleanup_release_train_self_test_refs() {
    local ref
    for ref in "${cleanup_refs[@]:-}"; do
      git update-ref -d "${ref}" >/dev/null 2>&1 || true
    done
    trap - RETURN
  }
  trap cleanup_release_train_self_test_refs RETURN

  empty_tree="$(git mktree </dev/null)"
  content_tree="$(self_test_tree 'source content')"
  rogue_tree="$(self_test_tree 'rogue target content')"
  baseline="$(self_test_commit "${empty_tree}" -m 'chore: seed release-train baseline')"
  source="$(self_test_commit "${content_tree}" -p "${baseline}" -m 'fix: source content')"
  target_merge="$(self_test_commit "${content_tree}" -p "${baseline}" -p "${source}" -m 'Merge source content into target')"
  rogue_target="$(self_test_commit "${rogue_tree}" -p "${baseline}" -m 'fix: rogue target content')"

  git update-ref "${ref_prefix}/staging" "${source}"
  git update-ref "${ref_prefix}/premain" "${target_merge}"
  cleanup_refs+=("${ref_prefix}/staging" "${ref_prefix}/premain")

  if ! output="$(
    (
      remote="${test_remote}"
      require_protected_ancestor "premain" "staging" "self-test staging -> premain benign divergence"
    ) 2>&1
  )"; then
    printf '%s\n' "${output}" >&2
    echo "release-train-promotion: FAIL (self-test benign merge-commit divergence was rejected)" >&2
    return 1
  fi
  echo "release-train-promotion: PASS (self-test benign merge-commit divergence accepted)"

  git update-ref "${ref_prefix}/premain" "${rogue_target}"
  if output="$(
    (
      remote="${test_remote}"
      require_protected_ancestor "premain" "staging" "self-test staging -> premain rogue target content"
    ) 2>&1
  )"; then
    printf '%s\n' "${output}" >&2
    echo "release-train-promotion: FAIL (self-test rogue target non-merge content was accepted)" >&2
    return 1
  fi
  if [[ "${output}" != *"self-test staging -> premain rogue target content: premain is not an ancestor of staging"* ]]; then
    printf '%s\n' "${output}" >&2
    echo "release-train-promotion: FAIL (self-test rogue target non-merge content did not preserve the fail-closed message)" >&2
    return 1
  fi
  echo "release-train-promotion: PASS (self-test rogue target non-merge content failed closed)"

  git update-ref "${ref_prefix}/main" "${source}"
  git update-ref "${ref_prefix}/staging" "${target_merge}"
  cleanup_refs+=("${ref_prefix}/main")
  if ! output="$(
    (
      remote="${test_remote}"
      require_protected_ancestor "staging" "main" "self-test main -> staging benign divergence"
    ) 2>&1
  )"; then
    printf '%s\n' "${output}" >&2
    echo "release-train-promotion: FAIL (self-test main -> staging benign divergence was rejected)" >&2
    return 1
  fi
  echo "release-train-promotion: PASS (self-test main -> staging benign divergence accepted)"

  git update-ref "${ref_prefix}/staging" "${rogue_target}"
  if output="$(
    (
      remote="${test_remote}"
      require_protected_ancestor "staging" "main" "self-test main -> staging rogue target content"
    ) 2>&1
  )"; then
    printf '%s\n' "${output}" >&2
    echo "release-train-promotion: FAIL (self-test main -> staging rogue target non-merge content was accepted)" >&2
    return 1
  fi
  if [[ "${output}" != *"self-test main -> staging rogue target content: staging is not an ancestor of main"* ]]; then
    printf '%s\n' "${output}" >&2
    echo "release-train-promotion: FAIL (self-test main -> staging rogue target content did not preserve the fail-closed message)" >&2
    return 1
  fi
  echo "release-train-promotion: PASS (self-test main -> staging rogue target non-merge content failed closed)"

  # Row 36: a crafted merge commit hides target-only content from the
  # --no-merges count, so the tree-equivalence condition must reject it.
  git update-ref "${ref_prefix}/staging" "${source}"
  git update-ref "${ref_prefix}/premain" "$(self_test_commit "${rogue_tree}" -p "${baseline}" -p "${source}" -m 'Merge source content into target with hidden payload')"
  if output="$(
    (
      remote="${test_remote}"
      require_protected_ancestor "premain" "staging" "self-test crafted merge hiding target content"
    ) 2>&1
  )"; then
    printf '%s\n' "${output}" >&2
    echo "release-train-promotion: FAIL (self-test crafted merge hiding target content was accepted)" >&2
    return 1
  fi
  echo "release-train-promotion: PASS (self-test crafted merge hiding target content failed closed)"

  # Row 7: a reserved promotion edge must bind the submitted head to the fetched
  # protected tip and reject forks, not merely compare upstream refs.
  git update-ref "${ref_prefix}/main" "${source}"
  if ! output="$(
    (
      remote="${test_remote}"
      head_sha="${source}"
      github_repository="theory-cloud/FaceTheory"
      github_head_repository="theory-cloud/FaceTheory"
      require_reserved_head_binding "main" "self-test reserved edge head binding"
    ) 2>&1
  )"; then
    printf '%s\n' "${output}" >&2
    echo "release-train-promotion: FAIL (self-test same-repo reserved head at the fetched tip was rejected)" >&2
    return 1
  fi
  echo "release-train-promotion: PASS (self-test same-repo reserved head at the fetched tip accepted)"

  if output="$(
    (
      remote="${test_remote}"
      head_sha="${source}"
      github_repository="theory-cloud/FaceTheory"
      github_head_repository="attacker/FaceTheory"
      require_reserved_head_binding "main" "self-test reserved edge head binding"
    ) 2>&1
  )"; then
    printf '%s\n' "${output}" >&2
    echo "release-train-promotion: FAIL (self-test fork reserved head was accepted)" >&2
    return 1
  fi
  echo "release-train-promotion: PASS (self-test fork reserved head failed closed)"

  if output="$(
    (
      remote="${test_remote}"
      head_sha="${baseline}"
      github_repository="theory-cloud/FaceTheory"
      github_head_repository="theory-cloud/FaceTheory"
      require_reserved_head_binding "main" "self-test reserved edge head binding"
    ) 2>&1
  )"; then
    printf '%s\n' "${output}" >&2
    echo "release-train-promotion: FAIL (self-test substituted reserved head SHA was accepted)" >&2
    return 1
  fi
  echo "release-train-promotion: PASS (self-test substituted reserved head SHA failed closed)"
}

self_test_tree_from_dir() {
  local dir="$1"
  local index="${dir}.index"
  local file relative blob

  rm -f "${index}"
  GIT_INDEX_FILE="${index}" git read-tree --empty
  while IFS= read -r -d '' file; do
    relative="${file#"${dir}"/}"
    blob="$(git hash-object -w --stdin <"${file}")"
    GIT_INDEX_FILE="${index}" git update-index --add --cacheinfo "100644,${blob},${relative}"
  done < <(find "${dir}" -type f -print0)
  GIT_INDEX_FILE="${index}" git write-tree
  rm -f "${index}"
}

self_test_write_release_tree() {
  local dir="$1"
  local version="$2"
  local base_version="$3"
  local line="$4"
  local changelog="CHANGELOG.md"
  local marker_line="export FACETHEORY_VERSION=${version} # x-release-please-version"

  if [[ "${line}" == "premain" ]]; then
    changelog="CHANGELOG.prerelease.md"
  fi

  rm -rf "${dir}"
  mkdir -p "${dir}/docs" "${dir}/ts"
  local stable_manifest_version="${version}"
  if [[ "${line}" == "premain" ]]; then
    stable_manifest_version="${base_version:-${version}}"
  fi
  printf '{\n  ".": "%s"\n}\n' "${stable_manifest_version}" >"${dir}/.release-please-manifest.json"
  printf '{\n  ".": "%s"\n}\n' "${version}" >"${dir}/.release-please-manifest.premain.json"

  {
    printf '# Changelog\n\n'
    if [[ -n "${base_version}" ]]; then
      printf '## [%s](https://example.invalid/compare/v%s...v%s) (2026-01-02)\n\n### Bug Fixes\n\n* next\n\n' \
        "${version}" "${base_version}" "${version}"
    fi
    printf '## [%s](https://example.invalid/compare/v0.9.0...v%s) (2026-01-01)\n\n### Bug Fixes\n\n* seed\n' \
      "${base_version:-${version}}" "${base_version:-${version}}"
  } >"${dir}/${changelog}"

  local other_changelog="CHANGELOG.md"
  if [[ "${changelog}" == "CHANGELOG.md" ]]; then
    other_changelog="CHANGELOG.prerelease.md"
  fi
  printf '# Changelog\n\n## [%s](https://example.invalid/compare/v0.9.0...v%s) (2026-01-01)\n\n### Bug Fixes\n\n* seed\n' \
    "${base_version:-${version}}" "${base_version:-${version}}" >"${dir}/${other_changelog}"

  printf '%s # x-release-please-version\n' "${version}" >"${dir}/VERSION"
  printf '## Install v%s <!-- x-release-please-version -->\n' "${version}" >"${dir}/README.md"
  printf '%s\n' "${marker_line}" >"${dir}/docs/README.md"
  printf '%s\n' "${marker_line}" >"${dir}/docs/api-reference.md"
  printf '%s\n' "${marker_line}" >"${dir}/docs/getting-started.md"
  {
    printf '%s\n' "${marker_line}"
    printf '<!-- x-release-please-start-version -->\n'
    printf '\n- [Getting Started](https://example.invalid/blob/v%s/docs/getting-started.md)\n' "${version}"
    printf '\n<!-- x-release-please-end -->\n'
  } >"${dir}/ts/README.md"
  printf '{\n  "name": "x",\n  "version": "%s",\n  "private": true\n}\n' "${version}" >"${dir}/ts/package.json"
  printf '{\n  "name": "x",\n  "version": "%s",\n  "lockfileVersion": 3,\n  "packages": {\n    "": {\n      "name": "x",\n      "version": "%s"\n    }\n  }\n}\n' \
    "${version}" "${version}" >"${dir}/ts/package-lock.json"
}

self_test_release_please_generated_diff() {
  local test_dir work_dir base_dir main_head_dir premain_head_dir
  local base_commit main_head_commit premain_head_commit
  local case_dir case_tree case_commit output

  test_dir="$(git rev-parse --git-path facetheory-release-self-tests)"
  work_dir="${test_dir}/release-please-$$"
  mkdir -p "${work_dir}"
  trap 'rm -rf "${work_dir}"' RETURN

  base_dir="${work_dir}/base"
  main_head_dir="${work_dir}/main-head"
  premain_head_dir="${work_dir}/premain-head"
  self_test_write_release_tree "${base_dir}" "1.0.0" "" main
  self_test_write_release_tree "${main_head_dir}" "1.1.0" "1.0.0" main
  self_test_write_release_tree "${premain_head_dir}" "1.1.0-rc.1" "1.0.0" premain

  base_commit="$(self_test_commit "$(self_test_tree_from_dir "${base_dir}")" -m 'chore: seed generated release baseline')"
  main_head_commit="$(self_test_commit "$(self_test_tree_from_dir "${main_head_dir}")" -p "${base_commit}" -m 'chore(main): release 1.1.0')"
  premain_head_commit="$(self_test_commit "$(self_test_tree_from_dir "${premain_head_dir}")" -p "${base_commit}" -m 'chore(premain): release 1.1.0-rc.1')"

  if ! output="$(
    (
      verify_generated_release_diff "main" "${main_head_commit}" "${base_commit}"
    ) 2>&1
  )"; then
    printf '%s\n' "${output}" >&2
    echo "release-train-promotion: FAIL (self-test generated stable release diff was rejected)" >&2
    return 1
  fi
  echo "release-train-promotion: PASS (self-test generated stable release diff accepted)"

  if ! output="$(
    (
      verify_generated_release_diff "premain" "${premain_head_commit}" "${base_commit}"
    ) 2>&1
  )"; then
    printf '%s\n' "${output}" >&2
    echo "release-train-promotion: FAIL (self-test generated RC release diff was rejected)" >&2
    return 1
  fi
  echo "release-train-promotion: PASS (self-test generated RC release diff accepted)"

  expect_release_diff_failure() {
    local label="$1"
    local expected="$2"
    local tree="$3"
    local commit
    commit="$(self_test_commit "${tree}" -p "${base_commit}" -m "chore(main): release ${label}")"
    if output="$(
      (
        verify_generated_release_diff "main" "${commit}" "${base_commit}"
      ) 2>&1
    )"; then
      printf '%s\n' "${output}" >&2
      echo "release-train-promotion: FAIL (self-test ${label} was accepted)" >&2
      return 1
    fi
    if [[ "${output}" != *"${expected}"* ]]; then
      printf '%s\n' "${output}" >&2
      echo "release-train-promotion: FAIL (self-test ${label} did not preserve the fail-closed message)" >&2
      return 1
    fi
    echo "release-train-promotion: PASS (self-test ${label} failed closed)"
  }

  case_dir="${work_dir}/unexpected-path"
  cp -R "${main_head_dir}" "${case_dir}"
  mkdir -p "${case_dir}/ts/src"
  printf 'export const evil = true;\n' >"${case_dir}/ts/src/evil.ts"
  expect_release_diff_failure "unexpected source path" \
    "changed paths outside the generated set: ts/src/evil.ts" \
    "$(self_test_tree_from_dir "${case_dir}")" || return 1

  case_dir="${work_dir}/readme-tamper"
  cp -R "${main_head_dir}" "${case_dir}"
  printf 'tampered prose\n' >>"${case_dir}/README.md"
  expect_release_diff_failure "tampered README" \
    "README.md is not the generated version marker update" \
    "$(self_test_tree_from_dir "${case_dir}")" || return 1

  case_dir="${work_dir}/lock-tamper"
  cp -R "${main_head_dir}" "${case_dir}"
  python3 - "${case_dir}/ts/package-lock.json" <<'PY'
import json
import sys

path = sys.argv[1]
with open(path, encoding="utf-8") as handle:
    data = json.load(handle)
data["packages"][""]["dependencies"] = {"left-pad": "1.0.0"}
with open(path, "w", encoding="utf-8") as handle:
    json.dump(data, handle, indent=2)
    handle.write("\n")
PY
  expect_release_diff_failure "tampered lockfile" \
    "ts/package-lock.json is not the generated version update" \
    "$(self_test_tree_from_dir "${case_dir}")" || return 1

  case_dir="${work_dir}/changelog-history"
  cp -R "${main_head_dir}" "${case_dir}"
  python3 - "${case_dir}/CHANGELOG.md" <<'PY'
import sys

path = sys.argv[1]
with open(path, encoding="utf-8") as handle:
    text = handle.read()
anchor = text.find("## [1.0.0]")
if anchor < 0:
    raise SystemExit(1)
with open(path, "w", encoding="utf-8") as handle:
    handle.write(text[:anchor] + text[anchor:].replace("* seed", "* rewritten history"))
PY
  expect_release_diff_failure "rewritten changelog history" \
    "rewrites changelog history" \
    "$(self_test_tree_from_dir "${case_dir}")" || return 1

  case_dir="${work_dir}/missing-version"
  cp -R "${main_head_dir}" "${case_dir}"
  printf '1.0.0 # x-release-please-version\n' >"${case_dir}/VERSION"
  expect_release_diff_failure "missing version file update" \
    "did not update required release files: VERSION" \
    "$(self_test_tree_from_dir "${case_dir}")" || return 1

  case_dir="${work_dir}/stale-version"
  cp -R "${main_head_dir}" "${case_dir}"
  self_test_write_release_tree "${case_dir}" "0.9.0" "1.0.0" main
  expect_release_diff_failure "not newer version" \
    "is not newer than the base version 1.0.0" \
    "$(self_test_tree_from_dir "${case_dir}")" || return 1

  case_dir="${work_dir}/rc-on-main"
  cp -R "${main_head_dir}" "${case_dir}"
  self_test_write_release_tree "${case_dir}" "1.1.0-rc.1" "1.0.0" main
  expect_release_diff_failure "RC version on the stable line" \
    "does not match the main release line" \
    "$(self_test_tree_from_dir "${case_dir}")" || return 1

  unset -f expect_release_diff_failure

  if ! ( pr_author="github-actions[bot]"; require_release_please_identity "self-test identity" ) >/dev/null 2>&1; then
    echo "release-train-promotion: FAIL (self-test canonical Release Please identity was rejected)" >&2
    return 1
  fi
  echo "release-train-promotion: PASS (self-test canonical Release Please identity accepted)"

  if ( pr_author="mallory"; require_release_please_identity "self-test identity" ) >/dev/null 2>&1; then
    echo "release-train-promotion: FAIL (self-test forged Release Please identity was accepted)" >&2
    return 1
  fi
  echo "release-train-promotion: PASS (self-test forged Release Please identity failed closed)"

  if ( pr_author=""; require_release_please_identity "self-test identity" ) >/dev/null 2>&1; then
    echo "release-train-promotion: FAIL (self-test missing Release Please identity was accepted)" >&2
    return 1
  fi
  echo "release-train-promotion: PASS (self-test missing Release Please identity failed closed)"

  if ! ( pr_title="chore(main): release 1.1.0"; require_release_please_title "main" "1.1.0" ) >/dev/null 2>&1; then
    echo "release-train-promotion: FAIL (self-test generated release title was rejected)" >&2
    return 1
  fi
  echo "release-train-promotion: PASS (self-test generated release title accepted)"

  if ( pr_title="chore(main): release 1.0.9"; require_release_please_title "main" "1.1.0" ) >/dev/null 2>&1; then
    echo "release-train-promotion: FAIL (self-test mismatched release title was accepted)" >&2
    return 1
  fi
  echo "release-train-promotion: PASS (self-test mismatched release title failed closed)"
}

if [[ "${self_test}" == "true" ]]; then
  self_test_release_train_promotion || exit $?
  self_test_release_please_generated_diff || exit $?
  exit 0
fi

base="$(normalize_branch "${base}")"
head="$(normalize_branch "${head}")"

[[ -n "${base}" ]] || fail "missing PR base branch"
[[ -n "${head}" ]] || fail "missing PR head branch"

if [[ -z "${github_head_repository}" ]]; then
  github_head_repository="${github_repository}"
fi

case "${base}" in
  staging|premain|main) ;;
  *)
    pass "non-release target ${head} -> ${base}"
    exit 0
    ;;
esac

if [[ -z "${github_repository}" ]]; then
  if command -v gh >/dev/null 2>&1; then
    github_repository="$(gh repo view --json nameWithOwner --jq '.nameWithOwner')"
  else
    fail "GITHUB_REPOSITORY is required"
  fi
fi

if [[ ! "${github_repository}" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
  fail "GitHub repository must be owner/name, got ${github_repository}"
fi

if [[ "${base}" == "staging" ]]; then
  case "${head}" in
    premain|release-please--branches--premain|release-please--branches--main)
      fail "invalid PR edge ${head} -> staging; only feature integration or main -> staging back-merge is allowed"
      ;;
  esac

  if [[ "${head}" == "main" ]]; then
    require_reserved_head_binding "main" "main -> staging back-merge"
    require_protected_ancestor "staging" "main" "main -> staging back-merge must include staging"
    pass "main -> staging back-merge"
    exit 0
  fi

  [[ -n "${head_sha}" ]] || fail "staging integration requires --head-sha"
  if [[ "${github_head_repository}" != "${github_repository}" ]]; then
    fail "staging integration from forks is not release-train-verifiable without fetching untrusted refs"
  fi
  require_sha_contains_branch "staging" "${head_sha}" "staging integration must include current staging"
  require_sha_contains_branch "main" "${head_sha}" "staging integration must include current main baseline"
  pass "feature -> staging integration contains staging and main baselines"
  exit 0
fi

if [[ "${base}" == "premain" ]]; then
  case "${head}" in
    staging)
      require_reserved_head_binding "staging" "staging -> premain prerelease promotion"
      require_protected_ancestor "premain" "staging" "staging -> premain prerelease promotion must include premain"
      require_protected_ancestor "main" "staging" "staging -> premain prerelease promotion must include main"
      pass "staging -> premain prerelease promotion"
      ;;
    release-please--branches--premain)
      require_release_please_identity "generated premain Release Please PR"
      require_reserved_head_binding "release-please--branches--premain" "generated premain Release Please PR"
      require_sha_contains_branch "premain" "${head_sha}" "generated premain Release Please PR must be based on premain"
      premain_version="$(read_manifest_version "${head_sha}" ".release-please-manifest.premain.json")"
      require_release_please_title "premain" "${premain_version}"
      verify_generated_release_diff "premain" "${head_sha}" "$(release_please_base_ref premain)"
      pass "generated premain RC Release Please PR"
      ;;
    *)
      fail "invalid PR edge ${head} -> premain; only staging or release-please--branches--premain may target premain"
      ;;
  esac
  exit 0
fi

if [[ "${base}" == "main" ]]; then
  case "${head}" in
    premain)
      require_reserved_head_binding "premain" "premain -> main stable promotion"
      require_protected_ancestor "main" "premain" "premain -> main stable promotion must include main"
      pass "premain -> main stable promotion"
      ;;
    release-please--branches--main)
      require_release_please_identity "generated main Release Please PR"
      require_reserved_head_binding "release-please--branches--main" "generated main Release Please PR"
      require_sha_contains_branch "main" "${head_sha}" "generated main Release Please PR must be based on main"
      main_version="$(read_manifest_version "${head_sha}" ".release-please-manifest.json")"
      require_release_please_title "main" "${main_version}"
      verify_generated_release_diff "main" "${head_sha}" "$(release_please_base_ref main)"
      pass "generated main stable Release Please PR"
      ;;
    *)
      fail "invalid PR edge ${head} -> main; only premain or release-please--branches--main may target main"
      ;;
  esac
  exit 0
fi
