#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PIN_FILE="${ROOT_DIR}/.go-version"

if [[ ! -f "${PIN_FILE}" ]]; then
  echo "go-version-pin: FAIL (missing .go-version)" >&2
  exit 1
fi

pinned="$(tr -d '[:space:]' < "${PIN_FILE}")"
if [[ ! "${pinned}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "go-version-pin: FAIL (.go-version must be X.Y.Z, got '${pinned}')" >&2
  exit 1
fi

if command -v go >/dev/null 2>&1; then
  actual="$(go env GOVERSION 2>/dev/null || true)"
  if [[ -z "${actual}" ]]; then
    actual="$(go version | awk '{print $3}')"
  fi
  if [[ "${actual}" != "go${pinned}" ]]; then
    echo "go-version-pin: FAIL (go toolchain ${actual} != go${pinned})" >&2
    exit 1
  fi
  echo "go-version-pin: PASS (${actual})"
else
  echo "go-version-pin: PASS (${pinned}, go binary not installed)"
fi
