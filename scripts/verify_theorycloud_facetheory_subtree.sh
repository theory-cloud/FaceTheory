#!/usr/bin/env bash
set -euo pipefail

python3 - "$@" <<'PY'
from __future__ import annotations

import argparse
import fnmatch
import glob
import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

MODULE_NAME = "theorycloud"
SUBTREE_NAME = "facetheory"
DEFAULT_SOURCE_REPO = "theory-cloud/FaceTheory"
REQUIRED_FIELDS = [
    "module",
    "subtree",
    "source_repo",
    "source_revision",
    "generated_at",
    "included_file_count",
    "excluded_file_count",
    "exclusion_rules",
]


def fail(message: str) -> None:
    print(f"verify-theorycloud-facetheory-subtree: FAIL ({message})", file=sys.stderr)
    raise SystemExit(1)


def run_git(repo_root: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=repo_root,
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    return result.stdout.strip()


def normalize_remote_url(value: str | None) -> str:
    if not value:
        return DEFAULT_SOURCE_REPO
    url = value.strip()
    prefixes = (
        "https://github.com/",
        "http://github.com/",
        "ssh://git@github.com/",
        "git@github.com:",
    )
    for prefix in prefixes:
        if url.startswith(prefix):
            url = url[len(prefix) :]
            break
    url = url.removesuffix(".git").strip("/")
    return url or DEFAULT_SOURCE_REPO


def parse_contract(contract_path: Path) -> tuple[str, dict[str, list[str]]]:
    sections: dict[str, list[str]] = {
        "fixed_ingestible": [],
        "fixed_contract_only": [],
        "sanctioned_optional_ingestible": [],
        "out_of_scope": [],
    }
    canonical_root: str | None = None
    in_contract = False
    current_section: str | None = None

    for raw_line in contract_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.rstrip()
        if not line.strip() or line.lstrip().startswith("#"):
            continue

        if not in_contract:
            if line.startswith("contract:"):
                in_contract = True
            continue

        if line and not line.startswith("  "):
            break

        stripped = line.strip()
        if line.startswith("  canonical_root:"):
            canonical_root = line.split(":", 1)[1].strip()
            current_section = None
            continue

        if line.startswith("  ") and stripped.endswith(":") and not stripped.startswith("-"):
            key = stripped[:-1]
            current_section = key if key in sections else None
            continue

        if current_section and line.startswith("    - "):
            sections[current_section].append(line.split("- ", 1)[1].strip())

    if not canonical_root:
        fail(f"missing contract.canonical_root in {contract_path}")
    return canonical_root, sections


def repo_relative(path: Path, repo_root: Path) -> str:
    return path.relative_to(repo_root).as_posix()


def strip_canonical_root(repo_path: str, canonical_root: str) -> str:
    prefix = canonical_root.rstrip("/") + "/"
    if not repo_path.startswith(prefix):
        fail(f"path {repo_path} is not under canonical root {canonical_root}")
    return repo_path[len(prefix) :]


def sorted_unique(values: list[str]) -> list[str]:
    return sorted(dict.fromkeys(values))


def expand_patterns(repo_root: Path, patterns: list[str], required: bool, label: str) -> list[str]:
    expanded: list[str] = []
    for pattern in patterns:
        matches = sorted(
            repo_relative(Path(match).resolve(), repo_root)
            for match in glob.glob(str(repo_root / pattern), recursive=True)
            if Path(match).is_file()
        )
        if required and not matches:
            fail(f"{label} entry {pattern} did not match any files")
        expanded.extend(matches)
    return expanded


def derive_exclusion_rules(
    excluded_rel_paths: list[str], canonical_root: str, sections: dict[str, list[str]]
) -> list[str]:
    rules: list[str] = []
    canonical_prefix = canonical_root.rstrip("/") + "/"
    for pattern in sections["fixed_contract_only"] + sections["out_of_scope"]:
        if pattern.startswith(canonical_prefix):
            rules.append(pattern[len(canonical_prefix) :])
        else:
            rules.append(pattern)
    normalized_rules = sorted_unique(rules)
    uncovered = [
        rel_path
        for rel_path in excluded_rel_paths
        if not any(fnmatch.fnmatch(rel_path, rule) for rule in normalized_rules)
    ]
    return sorted_unique(normalized_rules + uncovered)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("output", help="Directory containing the staged facetheory subtree")
    parser.add_argument("--contract", default="docs/_contract.yaml", help="Path to the FaceTheory docs contract")
    parser.add_argument("--repo-root", default=".", help="FaceTheory repository root")
    args = parser.parse_args()

    repo_root = Path(args.repo_root).resolve()
    contract_path = (repo_root / args.contract).resolve()
    output_root = Path(args.output).resolve()
    subtree_root = output_root / SUBTREE_NAME
    manifest_path = subtree_root / "source-manifest.json"

    if not contract_path.is_file():
        fail(f"missing contract file {contract_path}")
    if not subtree_root.is_dir():
        fail(f"missing staged subtree {subtree_root}")
    if not manifest_path.is_file():
        fail(f"missing provenance manifest {manifest_path}")
    if (output_root / "docs").exists():
        fail(f"unexpected docs wrapper at {output_root / 'docs'}")
    if (subtree_root / "docs").exists():
        fail(f"unexpected docs wrapper at {subtree_root / 'docs'}")

    canonical_root, sections = parse_contract(contract_path)
    canonical_root_path = (repo_root / canonical_root).resolve()
    if not canonical_root_path.is_dir():
        fail(f"canonical root {canonical_root_path} does not exist")

    fixed_ingestible = sorted_unique(expand_patterns(repo_root, sections["fixed_ingestible"], True, "fixed_ingestible"))
    _fixed_contract_only = expand_patterns(repo_root, sections["fixed_contract_only"], True, "fixed_contract_only")
    sanctioned_optional = sorted_unique(expand_patterns(repo_root, sections["sanctioned_optional_ingestible"], False, "sanctioned_optional_ingestible"))

    expected_repo_paths = sorted_unique(fixed_ingestible + sanctioned_optional)
    expected_rel_paths = [strip_canonical_root(path, canonical_root) for path in expected_repo_paths]
    expected_set = set(expected_rel_paths)

    all_repo_paths = sorted(
        repo_relative(path, repo_root)
        for path in canonical_root_path.rglob("*")
        if path.is_file()
    )
    excluded_repo_paths = sorted(set(all_repo_paths) - set(expected_repo_paths))
    excluded_rel_paths = [strip_canonical_root(path, canonical_root) for path in excluded_repo_paths]
    expected_exclusion_rules = derive_exclusion_rules(excluded_rel_paths, canonical_root, sections)

    actual_rel_paths = sorted(
        path.relative_to(subtree_root).as_posix()
        for path in subtree_root.rglob("*")
        if path.is_file() and path.name != "source-manifest.json"
    )
    actual_set = set(actual_rel_paths)

    missing = sorted(expected_set - actual_set)
    extra = sorted(actual_set - expected_set)
    if missing:
        fail(f"missing staged files: {missing}")
    if extra:
        fail(f"unexpected staged files: {extra}")

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    missing_fields = [field for field in REQUIRED_FIELDS if field not in manifest]
    if missing_fields:
        fail(f"manifest missing required fields: {missing_fields}")

    if manifest["module"] != MODULE_NAME:
        fail(f"manifest module={manifest['module']!r} want {MODULE_NAME!r}")
    if manifest["subtree"] != SUBTREE_NAME:
        fail(f"manifest subtree={manifest['subtree']!r} want {SUBTREE_NAME!r}")

    try:
        remote_url = run_git(repo_root, "config", "--get", "remote.origin.url")
    except subprocess.CalledProcessError:
        remote_url = DEFAULT_SOURCE_REPO
    expected_source_repo = normalize_remote_url(os.environ.get("SOURCE_REPO") or remote_url)
    if manifest["source_repo"] != expected_source_repo:
        fail(f"manifest source_repo={manifest['source_repo']!r} want {expected_source_repo!r}")

    try:
        expected_source_revision = os.environ.get("SOURCE_REVISION") or run_git(repo_root, "rev-parse", "HEAD")
    except subprocess.CalledProcessError as exc:
        fail(f"unable to determine source revision: {exc.stderr.strip()}")
    if manifest["source_revision"] != expected_source_revision:
        fail(
            f"manifest source_revision={manifest['source_revision']!r} want {expected_source_revision!r}"
        )

    try:
        datetime.fromisoformat(manifest["generated_at"].replace("Z", "+00:00"))
    except ValueError as exc:
        fail(f"manifest generated_at is not RFC3339: {exc}")

    if manifest["included_file_count"] != len(actual_rel_paths):
        fail(
            f"manifest included_file_count={manifest['included_file_count']} want {len(actual_rel_paths)}"
        )
    if manifest["excluded_file_count"] != len(excluded_rel_paths):
        fail(
            f"manifest excluded_file_count={manifest['excluded_file_count']} want {len(excluded_rel_paths)}"
        )
    if manifest["excluded_file_count"] < 0:
        fail("manifest excluded_file_count must be >= 0")
    if not isinstance(manifest["exclusion_rules"], list) or not manifest["exclusion_rules"]:
        fail("manifest exclusion_rules must be a non-empty list")
    if sorted(manifest["exclusion_rules"]) != expected_exclusion_rules:
        fail(
            "manifest exclusion_rules do not match contract-derived exclusions: "
            f"{sorted(manifest['exclusion_rules'])!r} want {expected_exclusion_rules!r}"
        )

    print(
        f"verify-theorycloud-facetheory-subtree: PASS (output={subtree_root}; included={len(actual_rel_paths)}; excluded={len(excluded_rel_paths)})"
    )


if __name__ == "__main__":
    main()
PY
