from __future__ import annotations

from pathlib import Path

from asdl_core.gh.pr_testing import FakePRGateway
from asdl_core.git.testing import FakeGitGateway
from asdl_core.git.types import WorktreeInfo
from asdl_slots.cli.slot.gt.navigation import (
    WorktreeTarget,
    build_navigation_result,
    find_worktree_for_branch,
)
from asdl_slots.context import SlotsCliContext
from asdl_slots.gateway.clipboard import ClipboardCopyFailure
from asdl_slots.gateway.testing.clipboard import FakeClipboardGateway
from asdl_slots.gateway.testing.storage import FakeSlotsStorageGateway
from asdl_slots.repo_context import RepoContext


def _slots_ctx(
    tmp_path: Path,
    *,
    git: FakeGitGateway,
    storage: FakeSlotsStorageGateway,
    clipboard: FakeClipboardGateway | None = None,
) -> SlotsCliContext:
    slots_root = tmp_path / "slots"
    repo = RepoContext(
        root=tmp_path / "repo",
        main_repo_root=tmp_path / "repo",
        repo_name="repo",
        repo_dir=slots_root / "repos" / "repo",
        worktrees_dir=slots_root / "repos" / "repo" / "worktrees",
    )
    return SlotsCliContext(
        repo=repo,
        git=git,
        storage=storage,
        clipboard=clipboard if clipboard is not None else FakeClipboardGateway(),
        pr=FakePRGateway(),
        slots_root=slots_root,
    )


def test_find_worktree_for_branch_returns_managed_slot(tmp_path: Path) -> None:
    slot_path = tmp_path / "slots" / "repos" / "repo" / "worktrees" / "slot-01"
    repo_path = tmp_path / "repo"
    git = FakeGitGateway(
        repo_root=repo_path,
        worktrees=(
            WorktreeInfo(path=repo_path, branch="main", is_bare=False),
            WorktreeInfo(path=slot_path, branch="feat/child", is_bare=False),
        ),
        current_branch_by_path={slot_path: "feat/child", repo_path: "main"},
    )
    ctx = _slots_ctx(
        tmp_path,
        git=git,
        storage=FakeSlotsStorageGateway(existing_paths={slot_path, repo_path}),
    )

    assert find_worktree_for_branch(ctx, "feat/child") == WorktreeTarget(
        slot_name="slot-01",
        branch_name="feat/child",
        worktree_path=slot_path,
    )


def test_find_worktree_for_branch_returns_generic_worktree(tmp_path: Path) -> None:
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
    )

    assert find_worktree_for_branch(ctx, "main") == WorktreeTarget(
        slot_name=None,
        branch_name="main",
        worktree_path=repo_path,
    )


def test_find_worktree_for_branch_missing_returns_none(tmp_path: Path) -> None:
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
    )

    assert find_worktree_for_branch(ctx, "feat/missing") is None


def test_build_navigation_result_copies_cd_command(tmp_path: Path) -> None:
    repo_path = tmp_path / "repo"
    clipboard = FakeClipboardGateway()
    ctx = _slots_ctx(
        tmp_path,
        git=FakeGitGateway(repo_root=repo_path),
        storage=FakeSlotsStorageGateway(existing_paths={repo_path}),
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
