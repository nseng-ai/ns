from __future__ import annotations

from pathlib import Path

from twerk_core.gh.pr_testing import FakePRGateway
from twerk_core.git.testing import FakeGitGateway
from twerk_core.git.types import WorktreeInfo
from twerk_slots.cli.slot.gt.navigation import (
    WorktreeTarget,
    build_navigation_result,
    find_worktree_for_branch,
)
from twerk_slots.context import SlotsCliContext
from twerk_slots.gateway.clipboard import ClipboardCopyFailure
from twerk_slots.gateway.testing import (
    FakeClipboardGateway,
    FakePoolStateGateway,
    FakeSlotsStorageGateway,
)
from twerk_slots.pool_state import PoolState, SlotAssignment
from twerk_slots.repo_context import RepoContext


def _slots_ctx(
    tmp_path: Path,
    *,
    git: FakeGitGateway,
    storage: FakeSlotsStorageGateway,
    pool_state: FakePoolStateGateway,
    clipboard: FakeClipboardGateway | None = None,
) -> SlotsCliContext:
    slots_root = tmp_path / "slots"
    repo = RepoContext(
        root=tmp_path / "repo",
        main_repo_root=tmp_path / "repo",
        repo_name="repo",
        repo_dir=slots_root / "repos" / "repo",
        worktrees_dir=slots_root / "repos" / "repo" / "worktrees",
        pool_json_path=slots_root / "repos" / "repo" / "pool.json",
    )
    return SlotsCliContext(
        repo=repo,
        git=git,
        storage=storage,
        pool_state=pool_state,
        clipboard=clipboard if clipboard is not None else FakeClipboardGateway(),
        pr=FakePRGateway(),
        slots_root=slots_root,
    )


def test_find_worktree_for_branch_prefers_pool_assignment(tmp_path: Path) -> None:
    slot_path = tmp_path / "slots" / "repos" / "repo" / "worktrees" / "slot-01"
    repo_path = tmp_path / "repo"
    state = PoolState(
        pool_size=4,
        assignments=(SlotAssignment("slot-01", "feat/child", "now", slot_path),),
    )
    git = FakeGitGateway(
        repo_root=repo_path,
        worktrees=(
            WorktreeInfo(path=repo_path, branch="feat/child", is_bare=False),
            WorktreeInfo(path=slot_path, branch="feat/child", is_bare=False),
        ),
        current_branch_by_path={slot_path: "feat/child", repo_path: "feat/child"},
    )
    ctx = _slots_ctx(
        tmp_path,
        git=git,
        storage=FakeSlotsStorageGateway(existing_paths={slot_path, repo_path}),
        pool_state=FakePoolStateGateway(tmp_path / "pool.json", initial_state=state),
    )

    assert find_worktree_for_branch(ctx, "feat/child") == WorktreeTarget(
        slot_name="slot-01",
        branch_name="feat/child",
        worktree_path=slot_path,
    )


def test_find_worktree_for_branch_falls_back_to_git_worktrees(tmp_path: Path) -> None:
    repo_path = tmp_path / "repo"
    git = FakeGitGateway(
        repo_root=repo_path,
        worktrees=(WorktreeInfo(path=repo_path, branch="main", is_bare=False),),
        current_branch_by_path={repo_path: "main"},
    )
    ctx = _slots_ctx(
        tmp_path,
        git=git,
        storage=FakeSlotsStorageGateway(existing_paths={repo_path}),
        pool_state=FakePoolStateGateway(tmp_path / "pool.json"),
    )

    assert find_worktree_for_branch(ctx, "main") == WorktreeTarget(
        slot_name=None,
        branch_name="main",
        worktree_path=repo_path,
    )


def test_build_navigation_result_copies_cd_command(tmp_path: Path) -> None:
    repo_path = tmp_path / "repo"
    clipboard = FakeClipboardGateway()
    ctx = _slots_ctx(
        tmp_path,
        git=FakeGitGateway(repo_root=repo_path),
        storage=FakeSlotsStorageGateway(existing_paths={repo_path}),
        pool_state=FakePoolStateGateway(tmp_path / "pool.json"),
        clipboard=clipboard,
    )

    result = build_navigation_result(
        ctx,
        WorktreeTarget(slot_name=None, branch_name="main", worktree_path=repo_path),
        no_clipboard=False,
    )

    assert result.cd_command == f"cd {repo_path}"
    assert result.clipboard_copied is True
    assert clipboard.last_copied == f"cd {repo_path}"


def test_build_navigation_result_surfaces_clipboard_failure(tmp_path: Path) -> None:
    repo_path = tmp_path / "repo"
    failure = ClipboardCopyFailure(reason="subprocess_error", detail="pbcopy failed")
    ctx = _slots_ctx(
        tmp_path,
        git=FakeGitGateway(repo_root=repo_path),
        storage=FakeSlotsStorageGateway(existing_paths={repo_path}),
        pool_state=FakePoolStateGateway(tmp_path / "pool.json"),
        clipboard=FakeClipboardGateway(should_succeed=False, failure=failure),
    )

    result = build_navigation_result(
        ctx,
        WorktreeTarget(slot_name=None, branch_name="main", worktree_path=repo_path),
        no_clipboard=False,
    )

    assert result.clipboard_copied is False
    assert result.clipboard_failure_reason == "subprocess_error"
    assert result.clipboard_failure_detail == "pbcopy failed"
