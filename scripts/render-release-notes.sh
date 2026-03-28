#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

tag="${1:-${GITHUB_REF_NAME:-}}"
if [[ -z "${tag}" ]]; then
  echo "release-notes: FAIL (missing tag name)"
  exit 1
fi

version="${tag#v}"
repo="theory-cloud/FaceTheory"
repo_url="https://github.com/${repo}"
docs_base="${repo_url}/blob/${tag}/docs"

mkdir -p dist

cat > dist/RELEASE_NOTES.md <<EOF
# FaceTheory ${tag}

## Highlights
- AWS-first SSR, SSG, and blocking ISR runtime for Node.js with React, Vue, and Svelte adapters.
- GitHub release asset install flow with a reference bundle, pinned docs, and SHA-256 checksums.
- AppTheory and TableTheory integration surfaces for AWS entrypoints and ISR metadata storage.

## Install
- Download \`theory-cloud-facetheory-${version}.tgz\` from this release and install it with \`npm install --save-exact ./theory-cloud-facetheory-${version}.tgz\`.
- Install the framework peers that match your adapter surface: React (\`react react-dom\`), React + AntD/Emotion (\`antd @emotion/react @emotion/cache @emotion/server\`), Vue (\`vue @vue/server-renderer\`), or Svelte (\`svelte\`).
- Download \`facetheory-reference-${version}.tar.gz\` if you want the canonical docs, runnable examples, and reference deployment stacks offline.

## Documentation
- Getting started: ${docs_base}/getting-started.md
- API reference: ${docs_base}/api-reference.md
- Core patterns: ${docs_base}/core-patterns.md
- Testing guide: ${docs_base}/testing-guide.md
- CDK and AWS notes: ${docs_base}/cdk/README.md

## Verification
- Download \`SHA256SUMS.txt\` and the artifacts into the same directory.
- Verify them with \`sha256sum -c SHA256SUMS.txt\`.
EOF

echo "release-notes: PASS (dist/RELEASE_NOTES.md)"
