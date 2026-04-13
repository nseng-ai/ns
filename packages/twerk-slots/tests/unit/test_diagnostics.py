from __future__ import annotations

from pathlib import Path

from twerk_slots.diagnostics import (
    SyncIssue,
    _check_git_worktree_mismatch,
    _check_missing_branches,
    _check_orphan_dirs,
    _check_orphan_states,
    _managed_git_slots,
    _slot_dirs_on_disk,
    run_sync_diagnostics,
)
from twerk_slots.gateway.git import WorktreeInfo
from twerk_slots.gateway.testing import FakeGitGateway, FakeSlotsStorageGateway
from twerk_slots.pool_state import PoolState, SlotAssignment

WORKTREES_DIR = Path("/slots/repos/r/worktrees")


def _assignment(
    slot_name: str,
    branch_name: str = "feat/x",
    *,
    worktree_path: Path | None = None,
    assigned_at: str = "2026-04-12T00:00:00+00:00",
) -> SlotAssignment:
    return SlotAssignment(
        slot_name=slot_name,
        branch_name=branch_name,
        assigned_at=assigned_at,
        worktree_path=worktree_path if worktree_path is not None else WORKTREES_DIR / slot_name,
    )


# -- helpers ----------------------------------------------------------------


def test_managed_git_slots_filters_by_parent_and_shape() -> None:
    slot_path = WORKTREES_DIR / "slot-01"
    stray = Path("/somewhere/else/slot-02")
    non_slot = WORKTREES_DIR / "random"
    worktrees = (
        WorktreeInfo(path=slot_path, branch="feat/x", is_bare=False),
        WorktreeInfo(path=stray, branch="feat/y", is_bare=False),
        WorktreeInfo(path=non_slot, branch="feat/z", is_bare=False),
    )

    result = _managed_git_slots(worktrees, WORKTREES_DIR)

    assert set(result) == {"slot-01"}
    assert result["slot-01"].branch == "feat/x"


def test_slot_dirs_on_disk_filters_by_shape() -> None:
    storage = FakeSlotsStorageGateway(
        existing_paths={
            WORKTREES_DIR,
            WORKTREES_DIR / "slot-01",
            WORKTREES_DIR / "slot-02",
            WORKTREES_DIR / "random",
        },
    )

    assert _slot_dirs_on_disk(WORKTREES_DIR, storage) == ("slot-01", "slot-02")


def test_slot_dirs_on_disk_missing_worktrees_dir_returns_empty() -> None:
    storage = FakeSlotsStorageGateway()
    assert _slot_dirs_on_disk(WORKTREES_DIR, storage) == ()


# -- _check_orphan_states ---------------------------------------------------


def test_check_orphan_states_reports_missing_worktree() -> None:
    assignment = _assignment("slot-01")
    storage = FakeSlotsStorageGateway()  # no paths exist

    issues = _check_orphan_states((assignment,), storage)

    assert len(issues) == 1
    assert issues[0].code == "orphan-state"
    assert issues[0].slot_name == "slot-01"
    assert "directory does not exist" in issues[0].message


def test_check_orphan_states_clean_when_path_present() -> None:
    assignment = _assignment("slot-01")
    storage = FakeSlotsStorageGateway(existing_paths={assignment.worktree_path})

    assert _check_orphan_states((assignment,), storage) == []


# -- _check_orphan_dirs -----------------------------------------------------


def test_check_orphan_dirs_flags_out_of_range_names() -> None:
    state = PoolState(pool_size=2, assignments=())
    disk = ("slot-01", "slot-02", "slot-05")

    issues = _check_orphan_dirs(state, disk)

    assert [i.slot_name for i in issues] == ["slot-05"]
    assert issues[0].code == "orphan-dir"


def test_check_orphan_dirs_quiet_when_all_in_range() -> None:
    state = PoolState(pool_size=16, assignments=())
    disk = ("slot-01", "slot-16")

    assert _check_orphan_dirs(state, disk) == []


# -- _check_missing_branches ------------------------------------------------


def test_check_missing_branches_reports_deleted_branch() -> None:
    assignment = _assignment("slot-01", branch_name="feat/x")
    git = FakeGitGateway(repo_root=Path("/r"), branches=())

    issues = _check_missing_branches((assignment,), git)

    assert len(issues) == 1
    assert issues[0].code == "missing-branch"
    assert issues[0].slot_name == "slot-01"
    assert "feat/x" in issues[0].message


def test_check_missing_branches_clean_when_branch_present() -> None:
    assignment = _assignment("slot-01", branch_name="feat/x")
    git = FakeGitGateway(repo_root=Path("/r"), branches={"feat/x"})

    assert _check_missing_branches((assignment,), git) == []


# -- _check_git_worktree_mismatch -------------------------------------------


def test_check_git_worktree_mismatch_reports_branch_mismatch() -> None:
    assignment = _assignment("slot-01", branch_name="feat/x")
    state = PoolState(pool_size=4, assignments=(assignment,))
    git_slots = {
        "slot-01": WorktreeInfo(path=assignment.worktree_path, branch="feat/y", is_bare=False),
    }

    issues = _check_git_worktree_mismatch(state, git_slots)

    assert [i.code for i in issues] == ["branch-mismatch"]
    assert issues[0].slot_name == "slot-01"
    assert "feat/x" in issues[0].message and "feat/y" in issues[0].message


def test_check_git_worktree_mismatch_reports_git_registry_missing() -> None:
    assignment = _assignment("slot-01")
    state = PoolState(pool_size=4, assignments=(assignment,))

    issues = _check_git_worktree_mismatch(state, {})

    assert [i.code for i in issues] == ["git-registry-missing"]
    assert issues[0].slot_name == "slot-01"


def test_check_git_worktree_mismatch_reports_untracked_worktree() -> None:
    state = PoolState(pool_size=2, assignments=())
    git_slots = {
        "slot-05": WorktreeInfo(path=WORKTREES_DIR / "slot-05", branch="feat/rogue", is_bare=False),
    }

    issues = _check_git_worktree_mismatch(state, git_slots)

    assert [i.code for i in issues] == ["untracked-worktree"]
    assert issues[0].slot_name == "slot-05"


def test_check_git_worktree_mismatch_clean_when_registry_matches() -> None:
    assignment = _assignment("slot-01", branch_name="feat/x")
    state = PoolState(pool_size=4, assignments=(assignment,))
    git_slots = {
        "slot-01": WorktreeInfo(path=assignment.worktree_path, branch="feat/x", is_bare=False),
    }

    assert _check_git_worktree_mismatch(state, git_slots) == []


# -- run_sync_diagnostics ---------------------------------------------------


def test_run_sync_diagnostics_clean_pool_reports_no_issues() -> None:
    slot_path = WORKTREES_DIR / "slot-01"
    assignment = _assignment("slot-01", branch_name="feat/x", worktree_path=slot_path)
    state = PoolState(pool_size=4, assignments=(assignment,))
    storage = FakeSlotsStorageGateway(existing_paths={WORKTREES_DIR, slot_path})
    git = FakeGitGateway(
        repo_root=Path("/r"),
        branches={"feat/x"},
        worktrees=(WorktreeInfo(path=slot_path, branch="feat/x", is_bare=False),),
    )

    issues = run_sync_diagnostics(
        state=state, worktrees_dir=WORKTREES_DIR, git=git, storage=storage
    )

    assert issues == ()


def test_run_sync_diagnostics_aggregates_mixed_issues() -> None:
    slot_01 = WORKTREES_DIR / "slot-01"
    slot_02 = WORKTREES_DIR / "slot-02"
    slot_03 = WORKTREES_DIR / "slot-03"
    slot_99 = WORKTREES_DIR / "slot-99"  # out-of-range
    assignments = (
        _assignment("slot-01", branch_name="feat/x", worktree_path=slot_01),
        _assignment("slot-02", branch_name="feat/gone", worktree_path=slot_02),
        _assignment("slot-03", branch_name="feat/mismatch", worktree_path=slot_03),
        _assignment(
            "slot-04",
            branch_name="feat/no-registry",
            worktree_path=WORKTREES_DIR / "slot-04",
        ),
    )
    state = PoolState(pool_size=4, assignments=assignments)
    # Filesystem: slot-01 exists, slot-02 missing (orphan-state),
    # slot-03 exists, slot-99 exists (orphan-dir), slot-04 missing (orphan-state).
    storage = FakeSlotsStorageGateway(
        existing_paths={WORKTREES_DIR, slot_01, slot_03, slot_99},
    )
    git = FakeGitGateway(
        repo_root=Path("/r"),
        branches={"feat/x", "feat/mismatch", "feat/no-registry", "feat/rogue"},
        worktrees=(
            WorktreeInfo(path=slot_01, branch="feat/x", is_bare=False),
            # slot-03 registry disagrees with assignment -> branch-mismatch
            WorktreeInfo(path=slot_03, branch="feat/other", is_bare=False),
            # slot-99 registered in git but outside pool -> untracked-worktree
            WorktreeInfo(path=slot_99, branch="feat/rogue", is_bare=False),
        ),
    )

    issues = run_sync_diagnostics(
        state=state, worktrees_dir=WORKTREES_DIR, git=git, storage=storage
    )

    codes_by_slot = {(i.slot_name, i.code) for i in issues}
    assert ("slot-02", "orphan-state") in codes_by_slot
    assert ("slot-04", "orphan-state") in codes_by_slot
    assert ("slot-99", "orphan-dir") in codes_by_slot
    assert ("slot-02", "missing-branch") in codes_by_slot
    assert ("slot-03", "branch-mismatch") in codes_by_slot
    # slot-02 assignment has no git worktree registry entry
    assert ("slot-02", "git-registry-missing") in codes_by_slot
    assert ("slot-04", "git-registry-missing") in codes_by_slot
    assert ("slot-99", "untracked-worktree") in codes_by_slot
    # slot-01 is clean
    assert not any(slot == "slot-01" for slot, _ in codes_by_slot)


def test_run_sync_diagnostics_returns_tuple() -> None:
    state = PoolState(pool_size=4, assignments=())
    storage = FakeSlotsStorageGateway()
    git = FakeGitGateway(repo_root=Path("/r"))

    issues = run_sync_diagnostics(
        state=state, worktrees_dir=WORKTREES_DIR, git=git, storage=storage
    )

    assert isinstance(issues, tuple)


def test_sync_issue_frozen() -> None:
    issue = SyncIssue(code="orphan-state", message="x", slot_name="slot-01")
    try:
        issue.message = "y"  # type: ignore[misc]
    except Exception as exc:
        assert isinstance(exc, (AttributeError, TypeError))
    else:  # pragma: no cover
        raise AssertionError("SyncIssue should be frozen")
