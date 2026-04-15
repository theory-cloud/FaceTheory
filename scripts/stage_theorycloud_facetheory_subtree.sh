#!/usr/bin/env bash
set -euo pipefail

python3 - "$@" <<'PY'
from __future__ import annotations

import argparse
import fnmatch
import glob
import json
import os
import shutil
import subprocess
import sys
from collections import OrderedDict
from datetime import datetime, timezone
from pathlib import Path

MODULE_NAME = "theorycloud"
SUBTREE_NAME = "facetheory"
DEFAULT_SOURCE_REPO = "theory-cloud/FaceTheory"


def fail(message: str) -> None:
    print(f"stage-theorycloud-facetheory-subtree: FAIL ({message})", file=sys.stderr)
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
    canonical_prefix = canonical_root.rstrip("/") + "/"
    if not repo_path.startswith(canonical_prefix):
        fail(f"path {repo_path} is not under canonical root {canonical_root}")
    return repo_path[len(canonical_prefix) :]


def expand_required_patterns(repo_root: Path, patterns: list[str], description: str) -> list[str]:
    expanded: list[str] = []
    for pattern in patterns:
        matches = sorted(
            repo_relative(Path(match).resolve(), repo_root)
            for match in glob.glob(str(repo_root / pattern), recursive=True)
            if Path(match).is_file()
        )
        if not matches:
            fail(f"{description} entry {pattern} did not match any files")
        expanded.extend(matches)
    return expanded


def expand_optional_patterns(repo_root: Path, patterns: list[str]) -> list[str]:
    expanded: list[str] = []
    for pattern in patterns:
        matches = sorted(
            repo_relative(Path(match).resolve(), repo_root)
            for match in glob.glob(str(repo_root / pattern), recursive=True)
            if Path(match).is_file()
        )
        expanded.extend(matches)
    return expanded


def sorted_unique(values: list[str]) -> list[str]:
    return sorted(dict.fromkeys(values))


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
    parser.add_argument("--output", required=True, help="Directory where the facetheory subtree should be staged")
    parser.add_argument("--contract", default="docs/_contract.yaml", help="Path to the FaceTheory docs contract")
    parser.add_argument("--repo-root", default=".", help="FaceTheory repository root")
    parser.add_argument("--source-repo", default=None, help="Override source_repo in the subtree manifest")
    parser.add_argument(
        "--source-revision",
        default=None,
        help="Override source_revision in the subtree manifest (defaults to current git HEAD)",
    )
    args = parser.parse_args()

    repo_root = Path(args.repo_root).resolve()
    contract_path = (repo_root / args.contract).resolve()
    output_root = Path(args.output).resolve()

    if not (repo_root / ".git").exists():
        fail(f"repo root {repo_root} is not a git repository")
    if not contract_path.is_file():
        fail(f"missing contract file {contract_path}")

    canonical_root, sections = parse_contract(contract_path)
    canonical_root_path = (repo_root / canonical_root).resolve()
    if not canonical_root_path.is_dir():
        fail(f"canonical root {canonical_root_path} does not exist")

    fixed_ingestible = sorted_unique(expand_required_patterns(repo_root, sections["fixed_ingestible"], "fixed_ingestible"))
    _fixed_contract_only = expand_required_patterns(repo_root, sections["fixed_contract_only"], "fixed_contract_only")
    sanctioned_optional = sorted_unique(expand_optional_patterns(repo_root, sections["sanctioned_optional_ingestible"]))

    included_repo_paths = sorted_unique(fixed_ingestible + sanctioned_optional)
    all_repo_paths = sorted(
        repo_relative(path, repo_root)
        for path in canonical_root_path.rglob("*")
        if path.is_file()
    )
    included_set = set(included_repo_paths)
    all_set = set(all_repo_paths)
    excluded_repo_paths = sorted(all_set - included_set)

    missing_from_contract = sorted(included_set - all_set)
    if missing_from_contract:
        fail(f"contract-selected files missing from canonical root: {missing_from_contract}")

    included_rel_paths = [strip_canonical_root(path, canonical_root) for path in included_repo_paths]
    excluded_rel_paths = [strip_canonical_root(path, canonical_root) for path in excluded_repo_paths]
    exclusion_rules = derive_exclusion_rules(excluded_rel_paths, canonical_root, sections)

    try:
        remote_url = run_git(repo_root, "config", "--get", "remote.origin.url")
    except subprocess.CalledProcessError:
        remote_url = DEFAULT_SOURCE_REPO
    source_repo = normalize_remote_url(args.source_repo or os.environ.get("SOURCE_REPO") or remote_url)

    try:
        source_revision = args.source_revision or os.environ.get("SOURCE_REVISION") or run_git(repo_root, "rev-parse", "HEAD")
    except subprocess.CalledProcessError as exc:
        fail(f"unable to determine source revision: {exc.stderr.strip()}")

    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    subtree_root = output_root / SUBTREE_NAME
    shutil.rmtree(subtree_root, ignore_errors=True)
    subtree_root.mkdir(parents=True, exist_ok=True)

    for repo_path, rel_path in zip(included_repo_paths, included_rel_paths, strict=True):
        source_path = repo_root / repo_path
        destination_path = subtree_root / rel_path
        destination_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source_path, destination_path)

    manifest = OrderedDict(
        [
            ("module", MODULE_NAME),
            ("subtree", SUBTREE_NAME),
            ("source_repo", source_repo),
            ("source_revision", source_revision),
            ("generated_at", generated_at),
            ("included_file_count", len(included_rel_paths)),
            ("excluded_file_count", len(excluded_rel_paths)),
            ("exclusion_rules", exclusion_rules),
        ]
    )
    (subtree_root / "source-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    print(
        f"stage-theorycloud-facetheory-subtree: PASS (output={subtree_root}; included={len(included_rel_paths)}; excluded={len(excluded_rel_paths)})"
    )


if __name__ == "__main__":
    main()
PY
