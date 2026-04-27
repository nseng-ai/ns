from __future__ import annotations

from pathlib import Path

from twerk_core.gh.pr_testing import FakePRGateway
from twerk_core.git.testing import FakeGitGateway
from twerk_core.git.types import FileStatus, WorktreeInfo
from twerk_slots.allocation import (
    DirtyWorktreeError,
    SlotFreeOutcome,
    SlotNotAssignedError,
    free_slot_assignment,
)
from twerk_slots.context import SlotsCliContext
from twerk_slots.gateway.testing.clipboard import FakeClipboardGateway
from twerk_slots.gateway.testing.pool_state import FakePoolStateGateway
from twerk_slots.gateway.testing.storage import FakeSlotsStorageGateway
from twerk_slots.pool_state import PoolState, SlotAssignment
from twerk_slots.repo_context import RepoContext

ROOT = Path("/tmp/t")
NOW = "2026-04-12T00:00:00+00:00"
EARLIER = "2026-04-01T00:00:00+00:00"


def _make_repo() -> RepoContext:
    repo_root = ROOT / "repo"
    repo_dir = ROOT / "slots" / "repos" / "repo"
    worktrees_dir = repo_dir / "worktrees"
    return RepoContext(
        root=repo_root,
        main_repo_root=repo_root,
        repo_name="repo",
        repo_dir=repo_dir,
        worktrees_dir=worktrees_dir,
        pool_json_path=repo_dir / "pool.json",
    )


def _seeded_storage(*, existing_paths: set[Path] | None = None) -> FakeSlotsStorageGateway:
    repo = _make_repo()
    base = {repo.root, repo.repo_dir, repo.worktrees_dir}
    if existing_paths:
        base |= existing_paths
    return FakeSlotsStorageGateway(existing_paths=base)


def _assigned_state(
    slot_name: str,
    branch_name: str,
    worktree_path: Path,
    *,
    assigned_at: str = NOW,
) -> PoolState:
    return PoolState(
        pool_size=4,
        assignments=(
            SlotAssignment(
                slot_name=slot_name,
                branch_name=branch_name,
                assigned_at=assigned_at,
                worktree_path=worktree_path,
            ),
        ),
    )


# -- free_slot_assignment happy path -----------------------------------------


def test_free_slot_happy_path() -> None:
    repo = _make_repo()
    slot_path = repo.worktrees_dir / "slot-01"
    seeded = _assigned_state("slot-01", "feat/x", slot_path)
    git = FakeGitGateway(
        repo_root=repo.root,
        branches={"feat/x"},
        worktrees=(WorktreeInfo(path=slot_path, branch="feat/x", is_bare=False),),
        current_branch_by_path={slot_path: "feat/x"},
        trunk_branch="main",
    )
    storage = _seeded_storage(existing_paths={slot_path})
    pool_state_gw = FakePoolStateGateway(repo.pool_json_path, initial_state=seeded)

    ctx = SlotsCliContext(
        repo=repo,
        git=git,
        storage=storage,
        pool_state=pool_state_gw,
        clipboard=FakeClipboardGateway(),
        pr=FakePRGateway(),
        slots_root=ROOT / "slots",
    )
    outcome = free_slot_assignment(ctx, slot_name="slot-01")

    assert isinstance(outcome, SlotFreeOutcome)
    assert outcome.slot_name == "slot-01"
    assert outcome.branch_name == "feat/x"
    assert outcome.worktree_path == slot_path
    # Worktree detached at trunk; no branch created, no checkout.
    assert git._detach_head_calls == [(slot_path, "main")]
    assert git._create_branch_calls == []
    assert git._checkout_calls == []
    # Assignment removed from persisted state.
    saved = pool_state_gw.load()
    assert saved is not None
    assert saved.assignments == ()


def test_free_slot_is_idempotent_when_repeated() -> None:
    """Freeing a slot is safe to repeat: a second free after a reassignment
    just re-detaches the worktree at trunk without touching branch state."""
    repo = _make_repo()
    slot_path = repo.worktrees_dir / "slot-01"
    seeded = _assigned_state("slot-01", "feat/x", slot_path)
    git = FakeGitGateway(
        repo_root=repo.root,
        branches={"feat/x"},
        worktrees=(WorktreeInfo(path=slot_path, branch="feat/x", is_bare=False),),
        current_branch_by_path={slot_path: "feat/x"},
        trunk_branch="main",
    )
    storage = _seeded_storage(existing_paths={slot_path})
    pool_state_gw = FakePoolStateGateway(repo.pool_json_path, initial_state=seeded)

    ctx = SlotsCliContext(
        repo=repo,
        git=git,
        storage=storage,
        pool_state=pool_state_gw,
        clipboard=FakeClipboardGateway(),
        pr=FakePRGateway(),
        slots_root=ROOT / "slots",
    )
    outcome = free_slot_assignment(ctx, slot_name="slot-01")

    assert isinstance(outcome, SlotFreeOutcome)
    assert git._detach_head_calls == [(slot_path, "main")]
    assert git._create_branch_calls == []


# -- failure modes -----------------------------------------------------------


def test_free_slot_unknown_slot_returns_not_assigned_error() -> None:
    repo = _make_repo()
    git = FakeGitGateway(repo_root=repo.root)
    storage = _seeded_storage()
    pool_state_gw = FakePoolStateGateway(
        repo.pool_json_path,
        initial_state=PoolState(pool_size=4, assignments=()),
    )

    ctx = SlotsCliContext(
        repo=repo,
        git=git,
        storage=storage,
        pool_state=pool_state_gw,
        clipboard=FakeClipboardGateway(),
        pr=FakePRGateway(),
        slots_root=ROOT / "slots",
    )
    outcome = free_slot_assignment(ctx, slot_name="slot-07")

    assert isinstance(outcome, SlotNotAssignedError)
    assert outcome.slot_name == "slot-07"
    # No state mutation.
    assert git._create_branch_calls == []
    assert git._checkout_calls == []
    assert pool_state_gw._save_calls == []


def test_free_slot_dirty_worktree_returns_dirty_error() -> None:
    repo = _make_repo()
    slot_path = repo.worktrees_dir / "slot-01"
    seeded = _assigned_state("slot-01", "feat/x", slot_path)
    git = FakeGitGateway(
        repo_root=repo.root,
        branches={"feat/x"},
        worktrees=(WorktreeInfo(path=slot_path, branch="feat/x", is_bare=False),),
        current_branch_by_path={slot_path: "feat/x"},
        file_status_by_path={slot_path: FileStatus(False, True, False)},
        trunk_branch="main",
    )
    storage = _seeded_storage(existing_paths={slot_path})
    pool_state_gw = FakePoolStateGateway(repo.pool_json_path, initial_state=seeded)

    ctx = SlotsCliContext(
        repo=repo,
        git=git,
        storage=storage,
        pool_state=pool_state_gw,
        clipboard=FakeClipboardGateway(),
        pr=FakePRGateway(),
        slots_root=ROOT / "slots",
    )
    outcome = free_slot_assignment(ctx, slot_name="slot-01")

    assert isinstance(outcome, DirtyWorktreeError)
    assert outcome.slot_name == "slot-01"
    assert outcome.worktree_path == slot_path
    # No state mutation on dirty refusal.
    assert git._create_branch_calls == []
    assert git._checkout_calls == []
    assert pool_state_gw.load() == seeded  # unchanged


# -- sync-before-free behavior -----------------------------------------------


def test_free_slot_syncs_before_freeing() -> None:
    """pool.json says slot-01 is feat/x, but git shows feat/y. sync updates the
    recorded branch; the freed assignment reports the synced branch name."""
    repo = _make_repo()
    slot_path = repo.worktrees_dir / "slot-01"
    seeded = _assigned_state("slot-01", "feat/x", slot_path, assigned_at=EARLIER)
    git = FakeGitGateway(
        repo_root=repo.root,
        branches={"feat/x", "feat/y"},
        worktrees=(WorktreeInfo(path=slot_path, branch="feat/y", is_bare=False),),
        current_branch_by_path={slot_path: "feat/y"},
        trunk_branch="main",
    )
    storage = _seeded_storage(existing_paths={slot_path})
    pool_state_gw = FakePoolStateGateway(repo.pool_json_path, initial_state=seeded)

    ctx = SlotsCliContext(
        repo=repo,
        git=git,
        storage=storage,
        pool_state=pool_state_gw,
        clipboard=FakeClipboardGateway(),
        pr=FakePRGateway(),
        slots_root=ROOT / "slots",
    )
    outcome = free_slot_assignment(ctx, slot_name="slot-01")

    assert isinstance(outcome, SlotFreeOutcome)
    # Outcome reports the synced branch, not the stale pool.json value.
    assert outcome.branch_name == "feat/y"
    # Worktree detached at trunk regardless of the freed branch.
    assert git._detach_head_calls == [(slot_path, "main")]
    assert git._create_branch_calls == []
