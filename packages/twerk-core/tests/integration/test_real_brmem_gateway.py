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

    first_commit = gateway.put("workbr", "plan", "feat/x", "one\n")
    second_commit = gateway.put("workbr", "plan", "feat/x", "two\n")

    entry_ref = "refs/brmem/ns/workbr/feat---x/plan"
    assert _run_git(repo, "rev-parse", entry_ref).stdout.strip() == second_commit
    assert gateway.get("workbr", "plan", "feat/x") == "two\n"
    assert gateway.get("workbr", "plan", "feat/x", at=first_commit) == "one\n"

    head_after = _run_git(repo, "rev-parse", "HEAD").stdout.strip()
    status_after = _run_git(repo, "status", "--porcelain").stdout
    assert head_after == head_before
    assert status_after == status_before == ""


def test_real_brmem_multiple_entries_coexist_on_same_branch(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    gateway.put("workbr", "plan", "feat/x", "a\n")
    gateway.put("workbr", "notes", "feat/x", "b\n")
    gateway.put("workbr", "plan", "feat/x", "a-updated\n")

    assert gateway.get("workbr", "plan", "feat/x") == "a-updated\n"
    assert gateway.get("workbr", "notes", "feat/x") == "b\n"


def test_real_brmem_sibling_keys_under_a_prefix_are_independent(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    gateway.put("workbr", "plan/a.md", "feat/x", "a\n")
    gateway.put("workbr", "plan/b.md", "feat/x", "b\n")

    assert gateway.get("workbr", "plan/a.md", "feat/x") == "a\n"
    assert gateway.get("workbr", "plan/b.md", "feat/x") == "b\n"

    entries = gateway.list_entries(namespace="workbr", branch="feat/x")
    assert [(e.key, e.ref_name) for e in entries] == [
        ("plan/a.md", "refs/brmem/ns/workbr/feat---x/plan/a.md"),
        ("plan/b.md", "refs/brmem/ns/workbr/feat---x/plan/b.md"),
    ]


def test_real_brmem_same_namespace_key_on_two_branches(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    gateway.put("workbr", "plan", "feat/x", "x\n")
    gateway.put("workbr", "plan", "feat/y", "y\n")

    assert gateway.get("workbr", "plan", "feat/x") == "x\n"
    assert gateway.get("workbr", "plan", "feat/y") == "y\n"


def test_real_brmem_list_entries_encodes_and_decodes_branch(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    gateway.put("workbr", "plan", "feature/foo", "a\n")

    entries = gateway.list_entries()

    assert len(entries) == 1
    assert entries[0].ref_name == "refs/brmem/ns/workbr/feature---foo/plan"
    assert entries[0].branch == "feature/foo"

    decoded = parse_entry_ref(entries[0].ref_name)
    assert decoded is not None
    assert decoded.branch == "feature/foo"


def test_real_brmem_list_entries_preserves_native_slashes_in_keys(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    gateway.put("workbr", "plan/plan.md", "feat/x", "a\n")

    entries = gateway.list_entries()

    assert len(entries) == 1
    assert entries[0].ref_name == "refs/brmem/ns/workbr/feat---x/plan/plan.md"
    assert entries[0].key == "plan/plan.md"
    assert entries[0].branch == "feat/x"

    decoded = parse_entry_ref(entries[0].ref_name)
    assert decoded is not None
    assert decoded.key == "plan/plan.md"
    assert decoded.branch == "feat/x"


def test_real_brmem_list_entries_filters(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    gateway.put("workbr", "plan", "feat/x", "a\n")
    gateway.put("workbr", "plan", "feat/y", "a\n")
    gateway.put("objectives", "obj-1", "feat/x", "a\n")

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

    gateway.put("workbr", "plan", "feat/x", "a\n")
    head = _run_git(repo, "rev-parse", "refs/brmem/ns/workbr/feat---x/plan").stdout.strip()
    # Malformed ref under the ns/ prefix (missing key segment).
    _run_git(repo, "update-ref", "refs/brmem/ns/onlytwo/segments", head)
    # Malformed ref under the base/ prefix (missing key segment).
    _run_git(repo, "update-ref", "refs/brmem/base/justone", head)

    entries = gateway.list_entries()

    assert [e.ref_name for e in entries] == ["refs/brmem/ns/workbr/feat---x/plan"]


def test_real_brmem_list_entries_ignores_refs_outside_base_and_ns_subtrees(
    tmp_path: Path,
) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    gateway.put("workbr", "plan", "feat/x", "a\n")
    head = _run_git(repo, "rev-parse", "refs/brmem/ns/workbr/feat---x/plan").stdout.strip()
    # A stray ref that does not live under refs/brmem/base/ or refs/brmem/ns/.
    _run_git(repo, "update-ref", "refs/brmem/brs/feat---legacy/plan", head)

    entries = gateway.list_entries()

    assert [e.ref_name for e in entries] == ["refs/brmem/ns/workbr/feat---x/plan"]


def test_real_brmem_base_namespace_round_trip(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    first = gateway.put(None, "scratchpad", "feat/x", "one\n")
    second = gateway.put(None, "scratchpad", "feat/x", "two-and-three\n")

    entry_ref = "refs/brmem/base/feat---x/scratchpad"
    assert _run_git(repo, "rev-parse", entry_ref).stdout.strip() == second
    assert gateway.get(None, "scratchpad", "feat/x") == "two-and-three\n"
    assert gateway.get(None, "scratchpad", "feat/x", at=first) == "one\n"

    diagnostic = gateway.check(None, "scratchpad", "feat/x")
    assert diagnostic is not None
    assert diagnostic.head_sha == second


def test_real_brmem_base_and_namespaced_entries_coexist(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    gateway.put(None, "plan.md", "feat/x", "base\n")
    gateway.put("workbr", "plan.md", "feat/x", "ns\n")

    assert gateway.get(None, "plan.md", "feat/x") == "base\n"
    assert gateway.get("workbr", "plan.md", "feat/x") == "ns\n"

    entries = gateway.list_entries()
    assert [(e.namespace, e.ref_name) for e in entries] == [
        (None, "refs/brmem/base/feat---x/plan.md"),
        ("workbr", "refs/brmem/ns/workbr/feat---x/plan.md"),
    ]


def test_real_brmem_rejects_branch_names_containing_encoding_separator(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    with pytest.raises(InvalidBranchNameError):
        gateway.put("workbr", "plan", "feat---x", "hello\n")


def test_real_brmem_check_returns_diagnostic(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    gateway.put("workbr", "plan", "feat/x", "one\n")
    second = gateway.put("workbr", "plan", "feat/x", "two-plus\n")

    diagnostic = gateway.check("workbr", "plan", "feat/x")

    assert diagnostic is not None
    assert diagnostic.head_sha == second
    assert diagnostic.size_bytes == 9


def test_real_brmem_check_returns_none_for_missing(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    assert gateway.check("workbr", "plan", "feat/x") is None


def test_real_brmem_check_at_historical(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    first = gateway.put("workbr", "plan", "feat/x", "one\n")
    gateway.put("workbr", "plan", "feat/x", "two-plus\n")

    diagnostic = gateway.check("workbr", "plan", "feat/x", at=first)

    assert diagnostic is not None
    assert diagnostic.size_bytes == 4
    assert diagnostic.head_sha == first


def test_real_brmem_content_blob_is_inspectable_via_git_show(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    gateway.put("workbr", "plan", "feat/x", "hello\n")

    result = _run_git(repo, "show", "refs/brmem/ns/workbr/feat---x/plan:content")
    assert result.stdout == "hello\n"
