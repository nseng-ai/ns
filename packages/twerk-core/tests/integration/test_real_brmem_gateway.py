from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from twerk_core.brmem.gateway import InvalidBranchNameError, parse_entry_ref
from twerk_core.brmem.real import RealBranchMemoryGateway


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


def test_real_brmem_round_trip_uses_entry_refs_and_preserves_history(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)
    head_before = _run_git(repo, "rev-parse", "HEAD").stdout.strip()
    status_before = _run_git(repo, "status", "--porcelain").stdout

    first_commit = gateway.put_artifact("workbr", "plan", "feat/x", "docs/notes.md", "one\n")
    second_commit = gateway.put_artifact("workbr", "plan", "feat/x", "docs/notes.md", "two\n")

    entry_ref = "refs/brmem/workbr/plan/feat---x"
    assert _run_git(repo, "rev-parse", entry_ref).stdout.strip() == second_commit
    assert gateway.get_artifact("workbr", "plan", "feat/x", "docs/notes.md") == "two\n"
    assert (
        gateway.get_artifact("workbr", "plan", "feat/x", "docs/notes.md", at=first_commit)
        == "one\n"
    )

    head_after = _run_git(repo, "rev-parse", "HEAD").stdout.strip()
    status_after = _run_git(repo, "status", "--porcelain").stdout
    assert head_after == head_before
    assert status_after == status_before == ""


def test_real_brmem_multiple_entries_coexist_on_same_branch(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    gateway.put_artifact("workbr", "plan", "feat/x", "a.md", "a\n")
    gateway.put_artifact("workbr", "notes", "feat/x", "b.md", "b\n")
    gateway.put_artifact("workbr", "plan", "feat/x", "a.md", "a-updated\n")

    assert gateway.get_artifact("workbr", "plan", "feat/x", "a.md") == "a-updated\n"
    assert gateway.get_artifact("workbr", "notes", "feat/x", "b.md") == "b\n"
    assert gateway.list_artifacts("workbr", "plan", "feat/x") == ["a.md"]
    assert gateway.list_artifacts("workbr", "notes", "feat/x") == ["b.md"]


def test_real_brmem_same_namespace_key_on_two_branches(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    gateway.put_artifact("workbr", "plan", "feat/x", "a.md", "x\n")
    gateway.put_artifact("workbr", "plan", "feat/y", "a.md", "y\n")

    assert gateway.get_artifact("workbr", "plan", "feat/x", "a.md") == "x\n"
    assert gateway.get_artifact("workbr", "plan", "feat/y", "a.md") == "y\n"


def test_real_brmem_list_entries_encodes_and_decodes_branch(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    gateway.put_artifact("workbr", "plan", "feature/foo", "a.md", "a\n")

    entries = gateway.list_entries()

    assert len(entries) == 1
    assert entries[0].ref_name == "refs/brmem/workbr/plan/feature---foo"
    assert entries[0].branch == "feature/foo"

    decoded = parse_entry_ref(entries[0].ref_name)
    assert decoded is not None
    assert decoded.branch == "feature/foo"


def test_real_brmem_list_entries_filters(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    gateway.put_artifact("workbr", "plan", "feat/x", "a.md", "a\n")
    gateway.put_artifact("workbr", "plan", "feat/y", "a.md", "a\n")
    gateway.put_artifact("objectives", "obj-1", "feat/x", "a.md", "a\n")

    ws = gateway.list_entries(namespace="workbr")
    assert [(e.namespace, e.key, e.branch) for e in ws] == [
        ("workbr", "plan", "feat/x"),
        ("workbr", "plan", "feat/y"),
    ]

    fx = gateway.list_entries(branch="feat/x")
    assert [(e.namespace, e.key, e.branch) for e in fx] == [
        ("objectives", "obj-1", "feat/x"),
        ("workbr", "plan", "feat/x"),
    ]


def test_real_brmem_list_entries_silently_skips_malformed_refs(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    gateway.put_artifact("workbr", "plan", "feat/x", "a.md", "a\n")
    head = _run_git(repo, "rev-parse", "refs/brmem/workbr/plan/feat---x").stdout.strip()
    _run_git(repo, "update-ref", "refs/brmem/onlytwo/segments", head)

    entries = gateway.list_entries()

    assert [e.ref_name for e in entries] == ["refs/brmem/workbr/plan/feat---x"]


def test_real_brmem_list_entries_ignores_legacy_brs_refs(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    gateway.put_artifact("workbr", "plan", "feat/x", "a.md", "a\n")
    head = _run_git(repo, "rev-parse", "refs/brmem/workbr/plan/feat---x").stdout.strip()
    _run_git(repo, "update-ref", "refs/brmem/brs/feat---legacy", head)

    entries = gateway.list_entries()

    assert [e.ref_name for e in entries] == ["refs/brmem/workbr/plan/feat---x"]


def test_real_brmem_rejects_branch_names_containing_encoding_separator(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    with pytest.raises(InvalidBranchNameError):
        gateway.put_artifact("workbr", "plan", "feat---x", "notes.md", "hello\n")


def test_real_brmem_list_artifacts_round_trip_sorted(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    gateway.put_artifact("workbr", "plan", "feat/x", "docs/b.md", "b\n")
    gateway.put_artifact("workbr", "plan", "feat/x", "docs/a.md", "a\n")

    assert gateway.list_artifacts("workbr", "plan", "feat/x") == [
        "docs/a.md",
        "docs/b.md",
    ]

    git_output = _run_git(
        repo, "ls-tree", "-r", "--name-only", "refs/brmem/workbr/plan/feat---x"
    ).stdout
    assert sorted(line for line in git_output.splitlines() if line) == [
        "docs/a.md",
        "docs/b.md",
    ]


def test_real_brmem_list_artifacts_empty_for_unknown_entry(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    assert gateway.list_artifacts("workbr", "plan", "no-such-branch") == []


def test_real_brmem_check_entry_returns_diagnostic(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    gateway.put_artifact("workbr", "plan", "feat/x", "a.md", "a\n")
    gateway.put_artifact("workbr", "plan", "feat/x", "b.md", "b\n")

    diagnostic = gateway.check_entry("workbr", "plan", "feat/x")

    assert diagnostic is not None
    assert diagnostic.artifact_count == 2


def test_real_brmem_check_entry_returns_none_for_missing(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    assert gateway.check_entry("workbr", "plan", "feat/x") is None
