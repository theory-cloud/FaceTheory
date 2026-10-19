#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

base_ref="${1:-}"
head_ref="${2:-}"
context_label="${3:-release}"

if [[ -z "${base_ref}" || -z "${head_ref}" ]]; then
  echo "${context_label}-readiness: FAIL (usage: scripts/verify-release-readiness.sh <base-ref> <head-ref> [context-label])"
  exit 1
fi

range="${base_ref}..${head_ref}"
diff_range="${base_ref}...${head_ref}"

echo "Checking commits in ${range}..."
release_commit_subject_regex='^(feat|fix|perf)(\([^)]+\))?(!)?:[[:space:]]'
mapfile -t commit_subjects < <(git log --format=%s "${range}")
for subject in "${commit_subjects[@]}"; do
  if [[ "${subject}" =~ ${release_commit_subject_regex} ]]; then
    echo "${context_label}-readiness: OK"
    exit 0
  fi
done

# Read the full name-status change set rather than only the added/copied/
# modified destinations. A deletion (`D`) or either side of a rename (`R`/`C`)
# can otherwise hide a non-allowlisted path from the release-infrastructure
# exception, so every path the range touches is collected and put through the
# allowlist below. Paths are tab-separated by git, so a path with spaces survives
# the read.
mapfile -t change_lines < <(git diff --name-status "${diff_range}")
changed_files=()
for change_line in "${change_lines[@]}"; do
  [[ -n "${change_line}" ]] || continue
  IFS=$'\t' read -r change_status change_from change_to <<< "${change_line}"
  case "${change_status}" in
    R*|C*) changed_files+=("${change_from}" "${change_to}") ;;
    *) changed_files+=("${change_from}") ;;
  esac
done
lockfile_path="ts/package-lock.json"
lockfile_rejection=""
fast_path_drift=()

# The installed dependency lockfile is admitted to the fast path only when the
# range's change to it is confined to the two npm project version fields that
# Release Please rewrites on every release: the root "version" and
# packages[""].version. Both revisions are parsed as JSON and every other leaf
# is required to be unchanged, so a range that resolves, adds, or removes a
# dependency stays excluded however the patch text is shaped. A semantic
# comparison is used deliberately: the diff text is never inspected, so a
# crafted hunk header, binary marker, or rename cannot describe a different
# change than the blobs the range actually produces.
lockfile_is_version_only_bump() {
  local base_ref="$1"
  local head_ref="$2"
  local merge_base base_entry head_entry base_mode base_type base_sha head_mode head_type head_sha
  local blob_dir reason

  if ! command -v python3 >/dev/null 2>&1; then
    lockfile_rejection="python3 is unavailable, so the lockfile contents cannot be inspected"
    return 1
  fi

  if ! merge_base="$(git merge-base "${base_ref}" "${head_ref}" 2>/dev/null)"; then
    lockfile_rejection="the range has no merge base, so the lockfile change cannot be scoped"
    return 1
  fi

  base_entry="$(git ls-tree "${merge_base}" -- "${lockfile_path}")"
  head_entry="$(git ls-tree "${head_ref}" -- "${lockfile_path}")"
  if [[ -z "${base_entry}" || -z "${head_entry}" ]]; then
    lockfile_rejection="the lockfile is added or deleted by this range"
    return 1
  fi

  read -r base_mode base_type base_sha <<< "${base_entry}"
  read -r head_mode head_type head_sha <<< "${head_entry}"
  base_sha="${base_sha%%$'\t'*}"
  head_sha="${head_sha%%$'\t'*}"
  if [[ "${base_type}" != "blob" || "${head_type}" != "blob" ]]; then
    lockfile_rejection="the lockfile is not a regular file in both revisions"
    return 1
  fi
  if [[ "${base_mode}" != "${head_mode}" ]]; then
    lockfile_rejection="the lockfile file mode changed (${base_mode} -> ${head_mode})"
    return 1
  fi
  case "${base_mode}" in
    100644|100755) ;;
    *)
      lockfile_rejection="the lockfile is not a regular file (mode ${base_mode})"
      return 1
      ;;
  esac

  blob_dir="$(mktemp -d)"
  if ! git cat-file blob "${base_sha}" > "${blob_dir}/base.json" 2>/dev/null; then
    rm -rf "${blob_dir}"
    lockfile_rejection="the lockfile blob at the range base is unreadable"
    return 1
  fi
  if ! git cat-file blob "${head_sha}" > "${blob_dir}/head.json" 2>/dev/null; then
    rm -rf "${blob_dir}"
    lockfile_rejection="the lockfile blob at the range head is unreadable"
    return 1
  fi

  if reason="$(
    BASE_LOCKFILE="${blob_dir}/base.json" HEAD_LOCKFILE="${blob_dir}/head.json" python3 - <<'PY'
import json
import os
import re

VERSION_PATTERN = re.compile(r"[0-9A-Za-z][0-9A-Za-z.+~-]*")
ALLOWED_PATHS = (("version",), ("packages", "", "version"))


def reject(message):
    print(message)
    raise SystemExit(1)


def render(path):
    rendered = ""
    for step in path:
        if isinstance(step, int):
            rendered += "[{0}]".format(step)
        elif re.fullmatch(r"[A-Za-z0-9_$]+", step):
            rendered += ("." if rendered else "") + step
        else:
            rendered += '["{0}"]'.format(step.replace("\\", "\\\\").replace('"', '\\"'))
    return rendered or "<root>"


def lookup(document, path):
    value = document
    for step in path:
        if not isinstance(value, dict) or step not in value:
            reject("the lockfile is missing {0}".format(render(path)))
        value = value[step]
    return value


def unique_object(pairs):
    seen = {}
    for key, value in pairs:
        if key in seen:
            reject("the lockfile repeats the object key {0!r}".format(key))
        seen[key] = value
    return seen


def reject_constant(name):
    reject("the lockfile carries the non-JSON constant {0}".format(name))


def load(label, path):
    try:
        with open(path, "rb") as handle:
            raw = handle.read()
    except OSError as error:
        reject("the {0} lockfile is unreadable: {1}".format(label, error))
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as error:
        reject("the {0} lockfile is not valid UTF-8: {1}".format(label, error))
    try:
        document = json.loads(
            text,
            object_pairs_hook=unique_object,
            parse_constant=reject_constant,
        )
    except SystemExit:
        raise
    except ValueError as error:
        reject("the {0} lockfile is not valid JSON: {1}".format(label, error))
    return text, document


def collect_differences(base, head, path, differences):
    if isinstance(base, dict) and isinstance(head, dict):
        if list(base) != list(head):
            differences.append((path, "object keys differ"))
            return
        for key in base:
            collect_differences(base[key], head[key], path + (key,), differences)
        return
    if isinstance(base, list) and isinstance(head, list):
        if len(base) != len(head):
            differences.append((path, "array length differs"))
            return
        for index in range(len(base)):
            collect_differences(base[index], head[index], path + (index,), differences)
        return
    if type(base) is not type(head) or base != head:
        differences.append((path, "value differs"))


def main():
    _, base_document = load("base", os.environ["BASE_LOCKFILE"])
    head_text, head_document = load("head", os.environ["HEAD_LOCKFILE"])

    if not isinstance(base_document, dict) or not isinstance(head_document, dict):
        reject("the lockfile root is not a JSON object")

    differences = []
    collect_differences(base_document, head_document, (), differences)
    if not differences:
        reject("the lockfile records no version change")

    for path, detail in differences:
        if path not in ALLOWED_PATHS:
            reject(
                "the lockfile change leaves the version fields: {0} {1}".format(
                    render(path), detail
                )
            )

    for path in ALLOWED_PATHS:
        value = lookup(head_document, path)
        if not isinstance(value, str) or not VERSION_PATTERN.fullmatch(value):
            reject(
                "the lockfile {0} is not a plain version string: {1!r}".format(
                    render(path), value
                )
            )

    root_version = lookup(head_document, ("version",))
    project_version = lookup(head_document, ("packages", "", "version"))
    if root_version != project_version:
        reject(
            'the lockfile root version {0!r} and packages[""].version {1!r} disagree'.format(
                root_version, project_version
            )
        )

    canonical = json.dumps(
        head_document, indent=2, ensure_ascii=False, allow_nan=False
    ) + "\n"
    if canonical != head_text:
        reject(
            "the lockfile text is not the canonical JSON form of its parsed document"
        )


try:
    main()
except RecursionError:
    reject("the lockfile nesting is too deep to compare")
PY
  )"; then
    rm -rf "${blob_dir}"
    return 0
  fi
  rm -rf "${blob_dir}"
  lockfile_rejection="${reason:-the lockfile change is not confined to the version fields}"
  return 1
}

if [[ "${#changed_files[@]}" -gt 0 ]]; then
  release_sync_only="true"
  lockfile_inspected="false"
  lockfile_admitted="false"
  for path in "${changed_files[@]}"; do
    case "${path}" in
      # Release metadata, the docs that carry version markers, and the release
      # helpers that only publish the generated assets. Workflow files and
      # verifier scripts (including their test harnesses) are deliberately
      # absent: a range that changes gate or CI code is user-facing and needs a
      # conventional release commit like any other change.
      .release-please-manifest*.json \
      | release-please-config*.json \
      | VERSION \
      | CHANGELOG.md \
      | CHANGELOG.prerelease.md \
      | README.md \
      | Makefile \
      | .gitignore \
      | docs/README.md \
      | docs/api-reference.md \
      | docs/getting-started.md \
      | scripts/build-release-assets.sh \
      | scripts/release-json-by-tag.sh \
      | scripts/resolve-release-source-ref.sh \
      | scripts/publish-draft-release-assets.sh \
      | scripts/generate-checksums.sh \
      | scripts/read-version.sh \
      | scripts/render-release-notes.sh \
      | ts/README.md \
      | ts/package.json)
        ;;
      # The lockfile is admissible on its version fields alone; anything else it
      # carries is a dependency-resolution change and disqualifies the range.
      "${lockfile_path}")
        if [[ "${lockfile_inspected}" == "false" ]]; then
          lockfile_inspected="true"
          if lockfile_is_version_only_bump "${base_ref}" "${head_ref}"; then
            lockfile_admitted="true"
          fi
        fi
        if [[ "${lockfile_admitted}" != "true" ]]; then
          release_sync_only="false"
          fast_path_drift+=("${lockfile_path} (${lockfile_rejection})")
        fi
        ;;
      *)
        release_sync_only="false"
        fast_path_drift+=("${path}")
        ;;
    esac
  done

  if [[ "${release_sync_only}" == "true" ]]; then
    echo "${context_label}-readiness: OK (release sync only change)"
    printf '%s\n' "${changed_files[@]}"
    exit 0
  fi
fi

echo "${context_label}-readiness: FAIL"
echo "No user-facing conventional commits (feat:/fix:/perf:) found in ${range}."
echo "release-please will skip, so no new release PR will be cut."
if [[ "${#fast_path_drift[@]}" -gt 0 ]]; then
  echo
  echo "Paths outside the release-sync fast path:"
  printf '  - %s\n' "${fast_path_drift[@]}"
fi
echo
echo "Commit subjects:"
printf '%s\n' "${commit_subjects[@]}"
exit 1
