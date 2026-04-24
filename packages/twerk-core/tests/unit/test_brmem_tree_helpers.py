"""Tests for the snapshot-tree plumbing helpers in ``twerk_core.brmem.real``.

These tests exercise :func:`_build_tree_from_entries` and
:func:`_enumerate_tree_entries` against a real on-disk git repository, so they
are integration-style even though the plan places them under ``tests/unit/``.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

from twerk_core.brmem.real import (
    _build_tree_from_entries,
    _enumerate_tree_entries,
    _snapshot_ref_name,
)


def _run_git(repo: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=repo,
        capture_output=True,
        text=True,
        check=True,
    )


def _init_repo(tmp_path: Path) -> Path:
    repo = tmp_path / "repo"
    repo.mkdir()
    _run_git(repo, "init")
    _run_git(repo, "config", "user.name", "Twerk Tests")
    _run_git(repo, "config", "user.email", "twerk@example.com")
    (repo / "README.md").write_text("hello\n", encoding="utf-8")
    _run_git(repo, "add", "README.md")
    _run_git(repo, "commit", "-m", "initial")
    return repo


def _hash_blob(repo: Path, content: str) -> str:
    result = subprocess.run(
        ["git", "hash-object", "-w", "--stdin"],
        cwd=repo,
        input=content,
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout.strip()


def test_build_tree_round_trips_single_key_at_root(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    blob_sha = _hash_blob(repo, "body\n")

    tree_sha = _build_tree_from_entries(repo, {"body.md": blob_sha})

    assert _enumerate_tree_entries(repo, tree_sha) == [("body.md", blob_sha)]


def test_build_tree_round_trips_nested_key(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    blob_sha = _hash_blob(repo, "body\n")

    tree_sha = _build_tree_from_entries(repo, {"foo/body.md": blob_sha})

    assert _enumerate_tree_entries(repo, tree_sha) == [("foo/body.md", blob_sha)]


def test_build_tree_round_trips_multiple_keys_under_same_prefix(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    body_sha = _hash_blob(repo, "body\n")
    roadmap_sha = _hash_blob(repo, "roadmap\n")
    notes_sha = _hash_blob(repo, "notes\n")

    entries = {
        "foo/body.md": body_sha,
        "foo/roadmap.md": roadmap_sha,
        "foo/notes.md": notes_sha,
    }
    tree_sha = _build_tree_from_entries(repo, entries)

    enumerated = _enumerate_tree_entries(repo, tree_sha)
    assert sorted(enumerated) == sorted(entries.items())


def test_build_tree_empty_entries_returns_empty_tree_sha(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)

    tree_sha = _build_tree_from_entries(repo, {})

    # Git's canonical empty-tree SHA.
    assert tree_sha == "4b825dc642cb6eb9a060e54bf8d69288fbee4904"
    assert _enumerate_tree_entries(repo, tree_sha) == []


def test_enumerate_tree_entries_missing_ref_returns_empty(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)

    assert _enumerate_tree_entries(repo, "refs/brmem/ns/does-not-exist/nope") == []


def test_build_tree_is_deterministic_for_same_inputs(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    body_sha = _hash_blob(repo, "body\n")
    roadmap_sha = _hash_blob(repo, "roadmap\n")

    entries = {"foo/body.md": body_sha, "foo/roadmap.md": roadmap_sha}
    first = _build_tree_from_entries(repo, entries)
    second = _build_tree_from_entries(repo, dict(entries))
    # Insertion order shouldn't matter either.
    reversed_entries = {
        "foo/roadmap.md": roadmap_sha,
        "foo/body.md": body_sha,
    }
    third = _build_tree_from_entries(repo, reversed_entries)

    assert first == second == third


def test_snapshot_ref_name_namespaced() -> None:
    assert _snapshot_ref_name("scratch", "feat/x") == "refs/brmem/ns/scratch/feat---x"


def test_snapshot_ref_name_base() -> None:
    assert _snapshot_ref_name(None, "feat/x") == "refs/brmem/base/feat---x"
