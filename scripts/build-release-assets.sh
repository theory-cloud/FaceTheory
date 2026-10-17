#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE_DIR="$ROOT_DIR/ts"

if [[ $# -ge 1 && -n "${1}" ]]; then
  VERSION="${1}"
elif [[ -x "$ROOT_DIR/scripts/read-version.sh" ]] || [[ -f "$ROOT_DIR/VERSION" ]]; then
  VERSION="$("$ROOT_DIR/scripts/read-version.sh")"
else
  VERSION="$(cd "$PACKAGE_DIR" && npm pkg get version | tr -d '\"')"
fi

OUTPUT_DIR="${2:-/tmp/facetheory-release-v${VERSION}}"
REFERENCE_DIR="$OUTPUT_DIR/facetheory-reference-$VERSION"

rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"
OUTPUT_DIR="$(cd "$OUTPUT_DIR" && pwd)"
REFERENCE_DIR="$OUTPUT_DIR/facetheory-reference-$VERSION"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

tmp_package_dir="${tmp_dir}/ts"
cp -a "$PACKAGE_DIR" "$tmp_package_dir"

rm -rf "$tmp_package_dir/node_modules"
rm -rf "$tmp_package_dir/dist"

(
  cd "$tmp_package_dir"
  npm ci --ignore-scripts >/dev/null
  npm run build >/dev/null
)

if [[ -n "${SOURCE_DATE_EPOCH:-}" ]]; then
  SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH}" TMP_PACKAGE_DIR="${tmp_package_dir}" python3 - <<'PY'
import os
from pathlib import Path

epoch = int(os.environ["SOURCE_DATE_EPOCH"])
root = Path(os.environ["TMP_PACKAGE_DIR"])

targets = [
    root / "LICENSE",
    root / "README.md",
    root / "package.json",
]

dist = root / "dist"
if dist.is_dir():
    targets.extend(dist.rglob("*"))

for path in targets:
    if path.exists():
        os.utime(path, (epoch, epoch))
PY
fi

(
  cd "$tmp_package_dir"
  npm pack --pack-destination "$OUTPUT_DIR"
)

# Assemble the reference bundle from tracked source only. `git archive` emits the
# committed blobs at HEAD, so untracked files (including sensitive or generated
# files accidentally left under docs/, infra/, or ts/examples/) can never enter a
# shipped release asset.
if ! command -v git >/dev/null 2>&1 || ! git -C "$ROOT_DIR" rev-parse --git-dir >/dev/null 2>&1; then
  echo "build-release-assets: FAIL (a git checkout is required to assemble the reference bundle from tracked source)" >&2
  exit 1
fi

untracked="$(git -C "$ROOT_DIR" ls-files --others --exclude-standard -- docs infra ts/examples)"
if [[ -n "${untracked}" ]]; then
  echo "build-release-assets: FAIL (untracked files under shipped reference roots):" >&2
  printf '%s\n' "${untracked}" >&2
  exit 1
fi

mkdir -p "$REFERENCE_DIR"
git -C "$ROOT_DIR" archive --format=tar HEAD -- \
  README.md CHANGELOG.md LICENSE \
  docs infra ts/README.md ts/LICENSE ts/examples \
  | tar -x -C "$REFERENCE_DIR"

# Keep the reference bundle focused on source docs and examples, not workspace artifacts.
find "$REFERENCE_DIR/infra" "$REFERENCE_DIR/ts/examples" \
  \( -type d \( -name node_modules -o -name deploy -o -name dist -o -name dist-static \) \) \
  -prune -exec rm -rf {} +

if [[ -n "${SOURCE_DATE_EPOCH:-}" ]]; then
  SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH}" REFERENCE_DIR="${REFERENCE_DIR}" python3 - <<'PY'
import os
from pathlib import Path

epoch = int(os.environ["SOURCE_DATE_EPOCH"])
root = Path(os.environ["REFERENCE_DIR"])

for path in [root, *root.rglob("*")]:
    if path.exists():
        os.utime(path, (epoch, epoch))
PY
fi

reference_tarball="$OUTPUT_DIR/facetheory-reference-$VERSION.tar.gz"
if [[ -n "${SOURCE_DATE_EPOCH:-}" ]] && tar --version 2>/dev/null | grep -q 'GNU tar'; then
  GZIP=-n tar \
    --sort=name \
    --mtime="@${SOURCE_DATE_EPOCH}" \
    --owner=0 \
    --group=0 \
    --numeric-owner \
    -czf "$reference_tarball" \
    -C "$OUTPUT_DIR" \
    "facetheory-reference-$VERSION"
else
  tar -czf "$reference_tarball" -C "$OUTPUT_DIR" "facetheory-reference-$VERSION"
fi

(
  cd "$OUTPUT_DIR"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum ./*.tgz ./*.tar.gz > SHA256SUMS.txt
  else
    shasum -a 256 ./*.tgz ./*.tar.gz > SHA256SUMS.txt
  fi
)

printf '%s\n' "$OUTPUT_DIR"
