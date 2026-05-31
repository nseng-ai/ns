from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from brmem.gateway import BrmemCopyConflictError, KeyNotFoundError
from brmem.real import RealBranchMemoryGateway
from brmem.ref_layout import BASE_NAMESPACE, InvalidBranchNameError, parse_entry_ref


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
    _run_git(repo, "config", "user.name", "Asdl Tests")
    _run_git(repo, "config", "user.email", "asdl@example.com")
    (repo / "README.md").write_text("hello\n", encoding="utf-8")
    _run_git(repo, "add", "README.md")
    _run_git(repo, "commit", "-m", "initial")
    return repo


def test_real_brmem_round_trip_uses_snapshot_refs_and_preserves_history(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)
    head_before = _run_git(repo, "rev-parse", "HEAD").stdout.strip()
    status_before = _run_git(repo, "status", "--porcelain").stdout

    first_commit = gateway.put("scratch", "plan", "feat/x", "one\n")
    second_commit = gateway.put("scratch", "plan", "feat/x", "two\n")

    snapshot_ref = "refs/brmem/ns/scratch/feat---x"
    assert _run_git(repo, "rev-parse", snapshot_ref).stdout.strip() == second_commit
    assert gateway.get("scratch", "plan", "feat/x") == "two\n"
    assert gateway.get("scratch", "plan", "feat/x", at=first_commit) == "one\n"

    # Consecutive puts form a linear commit history on the snapshot ref.
    log_lines = _run_git(repo, "log", "--format=%H", snapshot_ref).stdout.splitlines()
    assert log_lines == [second_commit, first_commit]

    head_after = _run_git(repo, "rev-parse", "HEAD").stdout.strip()
    status_after = _run_git(repo, "status", "--porcelain").stdout
    assert head_after == head_before
    assert status_after == status_before == ""


def test_real_brmem_multiple_entries_coexist_on_same_branch(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    gateway.put("scratch", "plan", "feat/x", "a\n")
    gateway.put("scratch", "notes", "feat/x", "b\n")
    gateway.put("scratch", "plan", "feat/x", "a-updated\n")

    assert gateway.get("scratch", "plan", "feat/x") == "a-updated\n"
    assert gateway.get("scratch", "notes", "feat/x") == "b\n"


def test_real_brmem_sibling_keys_under_a_prefix_are_independent(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    gateway.put("scratch", "plan/a.md", "feat/x", "a\n")
    gateway.put("scratch", "plan/b.md", "feat/x", "b\n")

    assert gateway.get("scratch", "plan/a.md", "feat/x") == "a\n"
    assert gateway.get("scratch", "plan/b.md", "feat/x") == "b\n"

    entries = gateway.list_entries(namespace="scratch", branch="feat/x")
    assert [(e.key, e.ref_name) for e in entries] == [
        ("plan/a.md", "refs/brmem/ns/scratch/feat---x:plan/a.md"),
        ("plan/b.md", "refs/brmem/ns/scratch/feat---x:plan/b.md"),
    ]


def test_real_brmem_same_namespace_key_on_two_branches(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    gateway.put("scratch", "plan", "feat/x", "x\n")
    gateway.put("scratch", "plan", "feat/y", "y\n")

    assert gateway.get("scratch", "plan", "feat/x") == "x\n"
    assert gateway.get("scratch", "plan", "feat/y") == "y\n"


def test_real_brmem_list_entries_encodes_and_decodes_branch(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    gateway.put("scratch", "plan", "feature/foo", "a\n")

    entries = gateway.list_all_entries()

    assert len(entries) == 1
    assert entries[0].ref_name == "refs/brmem/ns/scratch/feature---foo:plan"
    assert entries[0].branch == "feature/foo"

    decoded = parse_entry_ref(entries[0].ref_name)
    assert decoded is not None
    assert decoded.branch == "feature/foo"


def test_real_brmem_list_entries_preserves_native_slashes_in_keys(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    gateway.put("scratch", "plan/plan.md", "feat/x", "a\n")

    entries = gateway.list_all_entries()

    assert len(entries) == 1
    assert entries[0].ref_name == "refs/brmem/ns/scratch/feat---x:plan/plan.md"
    assert entries[0].key == "plan/plan.md"
    assert entries[0].branch == "feat/x"

    decoded = parse_entry_ref(entries[0].ref_name)
    assert decoded is not None
    assert decoded.key == "plan/plan.md"
    assert decoded.branch == "feat/x"


def test_real_brmem_list_entries_filters(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    gateway.put("scratch", "plan", "feat/x", "a\n")
    gateway.put("scratch", "plan", "feat/y", "a\n")
    gateway.put("notes", "obj-1", "feat/x", "a\n")

    ws = gateway.list_entries(namespace="scratch")
    assert [(e.namespace, e.key, e.branch) for e in ws] == [
        ("scratch", "plan", "feat/x"),
        ("scratch", "plan", "feat/y"),
    ]

    fx = gateway.list_all_entries(branch="feat/x")
    assert [(e.namespace, e.key, e.branch) for e in fx] == [
        ("notes", "obj-1", "feat/x"),
        ("scratch", "plan", "feat/x"),
    ]


def test_real_brmem_list_entries_silently_skips_malformed_snapshot_refs(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    gateway.put("scratch", "plan", "feat/x", "a\n")
    head = _run_git(repo, "rev-parse", "refs/brmem/ns/scratch/feat---x").stdout.strip()
    # Malformed ref under the ns/ prefix (has an extra path segment beyond
    # the single encoded-branch segment that the snapshot layout allows).
    _run_git(repo, "update-ref", "refs/brmem/ns/scratch/extra/feat---y", head)

    entries = gateway.list_all_entries()

    assert [e.ref_name for e in entries] == ["refs/brmem/ns/scratch/feat---x:plan"]


def test_real_brmem_list_entries_ignores_refs_outside_base_and_ns_subtrees(
    tmp_path: Path,
) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    gateway.put("scratch", "plan", "feat/x", "a\n")
    head = _run_git(repo, "rev-parse", "refs/brmem/ns/scratch/feat---x").stdout.strip()
    # A stray ref that does not live under refs/brmem/base/ or refs/brmem/ns/.
    _run_git(repo, "update-ref", "refs/brmem/brs/feat---legacy", head)

    entries = gateway.list_all_entries()

    assert [e.ref_name for e in entries] == ["refs/brmem/ns/scratch/feat---x:plan"]


def test_real_brmem_base_namespace_round_trip(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    first = gateway.put(BASE_NAMESPACE, "scratchpad", "feat/x", "one\n")
    second = gateway.put(BASE_NAMESPACE, "scratchpad", "feat/x", "two-and-three\n")

    snapshot_ref = "refs/brmem/base/feat---x"
    assert _run_git(repo, "rev-parse", snapshot_ref).stdout.strip() == second
    assert gateway.get(BASE_NAMESPACE, "scratchpad", "feat/x") == "two-and-three\n"
    assert gateway.get(BASE_NAMESPACE, "scratchpad", "feat/x", at=first) == "one\n"

    diagnostic = gateway.check(BASE_NAMESPACE, "scratchpad", "feat/x")
    assert diagnostic is not None
    assert diagnostic.head_sha == second


def test_real_brmem_base_and_namespaced_entries_coexist(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    gateway.put(BASE_NAMESPACE, "plan.md", "feat/x", "base\n")
    gateway.put("scratch", "plan.md", "feat/x", "ns\n")

    assert gateway.get(BASE_NAMESPACE, "plan.md", "feat/x") == "base\n"
    assert gateway.get("scratch", "plan.md", "feat/x") == "ns\n"

    entries = gateway.list_all_entries()
    assert [(e.namespace, e.ref_name) for e in entries] == [
        (BASE_NAMESPACE, "refs/brmem/base/feat---x:plan.md"),
        ("scratch", "refs/brmem/ns/scratch/feat---x:plan.md"),
    ]


def test_real_brmem_copy_entries_supports_base_namespace(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    gateway.put(BASE_NAMESPACE, "plan.md", "master", "plan\n")
    source_head = gateway.put(BASE_NAMESPACE, "notes/session.md", "master", "session\n")
    gateway.put("notes", "plan.md", "master", "named\n")

    copied = gateway.copy_entries(
        namespace=BASE_NAMESPACE,
        from_branch="master",
        to_branch="feat/x",
        overwrite=False,
        key_glob=None,
    )

    assert [(e.key, e.ref_name) for e in copied] == [
        ("notes/session.md", "refs/brmem/base/feat---x:notes/session.md"),
        ("plan.md", "refs/brmem/base/feat---x:plan.md"),
    ]
    assert _run_git(repo, "rev-parse", "refs/brmem/base/feat---x").stdout.strip() == source_head
    assert _run_git(repo, "rev-parse", "refs/brmem/base/master").stdout.strip() == source_head
    assert gateway.get(BASE_NAMESPACE, "plan.md", "feat/x") == "plan\n"
    assert gateway.get(BASE_NAMESPACE, "notes/session.md", "feat/x") == "session\n"
    assert gateway.get("notes", "plan.md", "feat/x") is None


def test_real_brmem_copy_entries_base_key_glob_rebuilds_tree(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    gateway.put(BASE_NAMESPACE, "plans/a.md", "master", "a\n")
    gateway.put(BASE_NAMESPACE, "notes/a.md", "master", "notes\n")
    gateway.put(BASE_NAMESPACE, "keep.md", "feat/x", "keep\n")

    copied = gateway.copy_entries(
        namespace=BASE_NAMESPACE,
        from_branch="master",
        to_branch="feat/x",
        overwrite=False,
        key_glob="plans/*",
    )

    assert [e.key for e in copied] == ["plans/a.md"]
    dest_ref = "refs/brmem/base/feat---x"
    commit_message = _run_git(repo, "log", "-1", "--format=%B", dest_ref).stdout
    assert (
        "brmem copy --base --from-branch master --to-branch feat/x --key-glob plans/*"
        in commit_message
    )
    tree_output = sorted(
        _run_git(repo, "ls-tree", "-r", "--name-only", dest_ref).stdout.splitlines()
    )
    assert tree_output == ["keep.md", "plans/a.md"]
    assert gateway.get(BASE_NAMESPACE, "plans/a.md", "feat/x") == "a\n"
    assert gateway.get(BASE_NAMESPACE, "keep.md", "feat/x") == "keep\n"
    assert gateway.get(BASE_NAMESPACE, "notes/a.md", "feat/x") is None


def test_real_brmem_copy_entries_empty_dest_snapshot_is_not_conflict(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    source_head = gateway.put("notes", "plan.md", "master", "plan\n")
    gateway.put("notes", "temporary.md", "feat/x", "temporary\n")
    empty_head = gateway.delete("notes", "temporary.md", "feat/x")

    copied = gateway.copy_entries(
        namespace="notes",
        from_branch="master",
        to_branch="feat/x",
        overwrite=False,
        key_glob=None,
    )

    assert [e.key for e in copied] == ["plan.md"]
    assert source_head != empty_head
    assert _run_git(repo, "rev-parse", "refs/brmem/ns/notes/feat---x").stdout.strip() == source_head
    assert gateway.get("notes", "plan.md", "feat/x") == "plan\n"


def test_real_brmem_rejects_branch_names_containing_encoding_separator(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    with pytest.raises(InvalidBranchNameError):
        gateway.put("scratch", "plan", "feat---x", "hello\n")


def test_real_brmem_check_returns_diagnostic(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    gateway.put("scratch", "plan", "feat/x", "one\n")
    second = gateway.put("scratch", "plan", "feat/x", "two-plus\n")

    diagnostic = gateway.check("scratch", "plan", "feat/x")

    assert diagnostic is not None
    assert diagnostic.head_sha == second
    assert diagnostic.size_bytes == 9


def test_real_brmem_check_returns_none_for_missing(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    assert gateway.check("scratch", "plan", "feat/x") is None


def test_real_brmem_check_at_historical(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    first = gateway.put("scratch", "plan", "feat/x", "one\n")
    gateway.put("scratch", "plan", "feat/x", "two-plus\n")

    diagnostic = gateway.check("scratch", "plan", "feat/x", at=first)

    assert diagnostic is not None
    assert diagnostic.size_bytes == 4
    assert diagnostic.head_sha == first


def test_real_brmem_content_blob_is_inspectable_via_git_show(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    gateway.put("scratch", "plan", "feat/x", "hello\n")

    # The snapshot-locator form from ``ref_name_for_entry`` is a valid
    # ``git show`` argument: ``<snapshot-ref>:<key>``.
    result = _run_git(repo, "show", "refs/brmem/ns/scratch/feat---x:plan")
    assert result.stdout == "hello\n"


def test_real_brmem_snapshot_tree_holds_every_key(tmp_path: Path) -> None:
    """All keys for a ``(namespace, branch)`` live in the same tree."""
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    gateway.put("notes", "foo/body.md", "feat/x", "body\n")
    gateway.put("notes", "foo/roadmap.md", "feat/x", "road\n")
    gateway.put("notes", "bar/body.md", "feat/x", "bar\n")

    tree_output = _run_git(
        repo, "ls-tree", "-r", "--name-only", "refs/brmem/ns/notes/feat---x"
    ).stdout.splitlines()
    assert sorted(tree_output) == [
        "bar/body.md",
        "foo/body.md",
        "foo/roadmap.md",
    ]


def test_real_brmem_copy_entries_reuses_source_snapshot_sha(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    gateway.put("notes", "foo/body.md", "master", "body\n")
    source_head = gateway.put("notes", "foo/roadmap.md", "master", "road\n")

    copied = gateway.copy_entries(
        namespace="notes",
        from_branch="master",
        to_branch="feat/x",
        overwrite=False,
        key_glob=None,
    )

    assert [(e.key, e.ref_name) for e in copied] == [
        ("foo/body.md", "refs/brmem/ns/notes/feat---x:foo/body.md"),
        ("foo/roadmap.md", "refs/brmem/ns/notes/feat---x:foo/roadmap.md"),
    ]
    # The destination snapshot ref is pointed at the source snapshot commit
    # — no new commit, no new tree.
    assert _run_git(repo, "rev-parse", "refs/brmem/ns/notes/feat---x").stdout.strip() == source_head
    assert _run_git(repo, "rev-parse", "refs/brmem/ns/notes/master").stdout.strip() == source_head


def test_real_brmem_copy_entries_raises_on_conflict_without_overwrite(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    gateway.put("notes", "foo/body.md", "master", "source\n")
    dest_sha = gateway.put("notes", "foo/body.md", "feat/x", "existing\n")

    with pytest.raises(BrmemCopyConflictError):
        gateway.copy_entries(
            namespace="notes",
            from_branch="master",
            to_branch="feat/x",
            overwrite=False,
            key_glob=None,
        )

    # Destination snapshot must be untouched — copy aborts before any ref
    # mutation.
    assert _run_git(repo, "rev-parse", "refs/brmem/ns/notes/feat---x").stdout.strip() == dest_sha


def test_real_brmem_copy_entries_overwrite_replaces_destination(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    source_sha = gateway.put("notes", "foo/body.md", "master", "source\n")
    gateway.put("notes", "foo/body.md", "feat/x", "existing\n")

    gateway.copy_entries(
        namespace="notes",
        from_branch="master",
        to_branch="feat/x",
        overwrite=True,
        key_glob=None,
    )

    # Destination snapshot is reassigned to the source commit verbatim.
    assert _run_git(repo, "rev-parse", "refs/brmem/ns/notes/feat---x").stdout.strip() == source_sha


def test_real_brmem_copy_entries_overwrite_drops_destination_only_keys(tmp_path: Path) -> None:
    """Snapshot-level overwrite replaces the destination entirely — keys that
    exist only on the destination are dropped when the source snapshot wins.
    """
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    source_sha = gateway.put("notes", "foo/body.md", "master", "source\n")
    gateway.put("notes", "foo/body.md", "feat/x", "existing\n")
    gateway.put("notes", "foo/notes.md", "feat/x", "dest-only\n")

    gateway.copy_entries(
        namespace="notes",
        from_branch="master",
        to_branch="feat/x",
        overwrite=True,
        key_glob=None,
    )

    assert _run_git(repo, "rev-parse", "refs/brmem/ns/notes/feat---x").stdout.strip() == source_sha
    tree_output = _run_git(
        repo, "ls-tree", "-r", "--name-only", "refs/brmem/ns/notes/feat---x"
    ).stdout.splitlines()
    assert tree_output == ["foo/body.md"]


def test_real_brmem_copy_entries_no_matching_source_returns_empty(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    copied = gateway.copy_entries(
        namespace="notes",
        from_branch="master",
        to_branch="feat/x",
        overwrite=False,
        key_glob=None,
    )

    assert copied == ()
    # Nothing should have been created on feat/x.
    assert (
        subprocess.run(
            ["git", "rev-parse", "--verify", "refs/brmem/ns/notes/feat---x"],
            cwd=repo,
            capture_output=True,
            text=True,
            check=False,
        ).returncode
        != 0
    )


def test_real_brmem_copy_entries_is_atomic_under_conflict(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    gateway.put("notes", "foo/body.md", "master", "body\n")
    gateway.put("notes", "foo/roadmap.md", "master", "road\n")
    # Destination contains an Entry that would be replaced.
    # Copy must refuse without mutating the destination snapshot at all.
    pre_existing = gateway.put("notes", "foo/body.md", "feat/x", "existing\n")

    with pytest.raises(BrmemCopyConflictError):
        gateway.copy_entries(
            namespace="notes",
            from_branch="master",
            to_branch="feat/x",
            overwrite=False,
            key_glob=None,
        )

    assert (
        _run_git(repo, "rev-parse", "refs/brmem/ns/notes/feat---x").stdout.strip() == pre_existing
    )
    # The source's additional key must not have leaked onto feat/x.
    tree_output = _run_git(
        repo, "ls-tree", "-r", "--name-only", "refs/brmem/ns/notes/feat---x"
    ).stdout.splitlines()
    assert tree_output == ["foo/body.md"]


def test_real_brmem_delete_removes_existing_key(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    parent_sha = gateway.put("scratch", "plan", "feat/x", "hello\n")
    new_sha = gateway.delete("scratch", "plan", "feat/x")

    snapshot_ref = "refs/brmem/ns/scratch/feat---x"
    assert new_sha != parent_sha
    assert _run_git(repo, "rev-parse", snapshot_ref).stdout.strip() == new_sha
    # New commit's parent is the previous snapshot — history is preserved.
    assert _run_git(repo, "rev-parse", f"{snapshot_ref}^").stdout.strip() == parent_sha
    assert gateway.get("scratch", "plan", "feat/x") is None


def test_real_brmem_delete_preserves_sibling_keys(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    gateway.put("scratch", "plan/a.md", "feat/x", "a\n")
    gateway.put("scratch", "plan/b.md", "feat/x", "b\n")

    gateway.delete("scratch", "plan/a.md", "feat/x")

    tree_output = _run_git(
        repo, "ls-tree", "-r", "--name-only", "refs/brmem/ns/scratch/feat---x"
    ).stdout.splitlines()
    assert tree_output == ["plan/b.md"]
    assert gateway.get("scratch", "plan/b.md", "feat/x") == "b\n"


def test_real_brmem_delete_missing_snapshot_raises(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    with pytest.raises(KeyNotFoundError):
        gateway.delete("scratch", "plan", "feat/x")


def test_real_brmem_delete_missing_key_raises(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    gateway.put("scratch", "plan", "feat/x", "hello\n")

    with pytest.raises(KeyNotFoundError):
        gateway.delete("scratch", "missing", "feat/x")


def test_real_brmem_delete_last_key_leaves_empty_tree_snapshot(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    gateway.put("scratch", "plan", "feat/x", "hello\n")
    new_sha = gateway.delete("scratch", "plan", "feat/x")

    snapshot_ref = "refs/brmem/ns/scratch/feat---x"
    # The ref still exists.
    assert _run_git(repo, "rev-parse", snapshot_ref).stdout.strip() == new_sha
    # The new commit's tree is git's canonical empty tree.
    tree_sha = _run_git(repo, "rev-parse", f"{new_sha}^{{tree}}").stdout.strip()
    assert tree_sha == "4b825dc642cb6eb9a060e54bf8d69288fbee4904"
    # And a second delete on the same key fails — delete is non-idempotent.
    with pytest.raises(KeyNotFoundError):
        gateway.delete("scratch", "plan", "feat/x")


def test_real_brmem_copy_entries_key_glob_rebuilds_tree_with_parent_pointer(
    tmp_path: Path,
) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    gateway.put("notes", "foo/body.md", "master", "foo-body\n")
    gateway.put("notes", "bar/body.md", "master", "bar-body\n")
    # Destination starts with one non-matching key that must be preserved.
    dest_head_before = gateway.put("notes", "bar/body.md", "feat/x", "dest-bar\n")
    dest_bar_blob_before = _run_git(
        repo,
        "rev-parse",
        "refs/brmem/ns/notes/feat---x:bar/body.md",
    ).stdout.strip()

    gateway.copy_entries(
        namespace="notes",
        from_branch="master",
        to_branch="feat/x",
        overwrite=False,
        key_glob="foo/*",
    )

    dest_ref = "refs/brmem/ns/notes/feat---x"
    dest_head_after = _run_git(repo, "rev-parse", dest_ref).stdout.strip()
    assert dest_head_after != dest_head_before

    # The new commit must have the prior dest commit as its parent — the
    # skill requires a linear history on the destination snapshot ref.
    parents = _run_git(repo, "rev-list", "--parents", "-n", "1", dest_head_after).stdout.split()
    assert parents[1:] == [dest_head_before]

    # Non-matching dest blob must be preserved bit-for-bit.
    dest_bar_blob_after = _run_git(repo, "rev-parse", f"{dest_ref}:bar/body.md").stdout.strip()
    assert dest_bar_blob_after == dest_bar_blob_before

    tree_output = sorted(
        _run_git(repo, "ls-tree", "-r", "--name-only", dest_ref).stdout.splitlines()
    )
    assert tree_output == ["bar/body.md", "foo/body.md"]


def test_real_brmem_copy_entries_key_glob_to_empty_dest_has_no_parent(
    tmp_path: Path,
) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    gateway.put("notes", "foo/body.md", "master", "foo-body\n")
    gateway.put("notes", "bar/body.md", "master", "bar-body\n")

    gateway.copy_entries(
        namespace="notes",
        from_branch="master",
        to_branch="feat/x",
        overwrite=False,
        key_glob="foo/*",
    )

    dest_ref = "refs/brmem/ns/notes/feat---x"
    dest_head = _run_git(repo, "rev-parse", dest_ref).stdout.strip()

    # Parentless commit: rev-list --parents prints just the commit sha.
    parents = _run_git(repo, "rev-list", "--parents", "-n", "1", dest_head).stdout.split()
    assert parents == [dest_head]

    tree_output = _run_git(repo, "ls-tree", "-r", "--name-only", dest_ref).stdout.splitlines()
    assert tree_output == ["foo/body.md"]


def test_real_brmem_copy_entries_key_glob_is_atomic_under_conflict(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    gateway.put("notes", "foo/body.md", "master", "source\n")
    dest_head = gateway.put("notes", "foo/body.md", "feat/x", "existing\n")

    with pytest.raises(BrmemCopyConflictError) as excinfo:
        gateway.copy_entries(
            namespace="notes",
            from_branch="master",
            to_branch="feat/x",
            overwrite=False,
            key_glob="foo/*",
        )

    assert [entry.key for entry in excinfo.value.conflicts] == ["foo/body.md"]
    # Destination ref must be untouched — conflict check runs before any ref
    # write.
    assert _run_git(repo, "rev-parse", "refs/brmem/ns/notes/feat---x").stdout.strip() == dest_head


def test_real_brmem_copy_entries_key_glob_zero_match_does_not_touch_dest(
    tmp_path: Path,
) -> None:
    repo = _init_repo(tmp_path)
    gateway = RealBranchMemoryGateway(cwd=repo)

    gateway.put("notes", "foo/body.md", "master", "source\n")

    copied = gateway.copy_entries(
        namespace="notes",
        from_branch="master",
        to_branch="feat/x",
        overwrite=False,
        key_glob="nope/*",
    )

    assert copied == ()
    # Destination ref must not exist: zero-match copies never create a ref.
    assert (
        subprocess.run(
            ["git", "rev-parse", "--verify", "refs/brmem/ns/notes/feat---x"],
            cwd=repo,
            capture_output=True,
            text=True,
            check=False,
        ).returncode
        != 0
    )
