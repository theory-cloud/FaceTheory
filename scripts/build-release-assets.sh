#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE_DIR="$ROOT_DIR/ts"
VERSION="${1:-$(cd "$PACKAGE_DIR" && npm pkg get version | tr -d '\"')}"
OUTPUT_DIR="${2:-/tmp/facetheory-release-v${VERSION}}"
REFERENCE_DIR="$OUTPUT_DIR/facetheory-reference-$VERSION"

rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

(
  cd "$PACKAGE_DIR"
  npm run build
  npm pack --pack-destination "$OUTPUT_DIR"
)

mkdir -p "$REFERENCE_DIR/ts"
cp "$ROOT_DIR/README.md" "$ROOT_DIR/CHANGELOG.md" "$ROOT_DIR/LICENSE" "$REFERENCE_DIR/"
cp -R "$ROOT_DIR/docs" "$REFERENCE_DIR/docs"
cp -R "$ROOT_DIR/infra" "$REFERENCE_DIR/infra"
cp "$ROOT_DIR/ts/README.md" "$ROOT_DIR/ts/LICENSE" "$REFERENCE_DIR/ts/"
cp -R "$ROOT_DIR/ts/examples" "$REFERENCE_DIR/ts/examples"

# Keep the reference bundle focused on source docs and examples, not workspace artifacts.
find "$REFERENCE_DIR/infra" "$REFERENCE_DIR/ts/examples" \
  \( -type d \( -name node_modules -o -name deploy -o -name dist -o -name dist-static \) \) \
  -prune -exec rm -rf {} +

tar -czf "$OUTPUT_DIR/facetheory-reference-$VERSION.tar.gz" -C "$OUTPUT_DIR" "facetheory-reference-$VERSION"

(
  cd "$OUTPUT_DIR"
  shasum -a 256 ./*.tgz ./*.tar.gz > SHA256SUMS.txt
)

printf '%s\n' "$OUTPUT_DIR"
