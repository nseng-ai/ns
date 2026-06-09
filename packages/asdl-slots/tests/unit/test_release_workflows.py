from __future__ import annotations

import subprocess
from pathlib import Path

from asdl_core.gh.pr_testing import FakePRGateway
from asdl_core.git.types import DetachedHead, FileStatus, WorktreeInfo, WorktreeOccupancy
from asdl_slots.lifecycle.outcomes import SlotLifecycleFailure
from asdl_slots.lifecycle.release import (
    SlotFreeReleaseExecution,
    SlotFreeReleasePreview,
    SlotGcReleasePreview,
    execute_free_release,
    execute_gc_release,
    plan_free_release,
    plan_gc_release,
)
from asdl_slots.lifecycle.release_cleanup import SLOT_RELEASE_ALL_CLEANUP_ACTIONS
from asdl_slots.testing.lifecycle_context import (
    make_pr,
    make_slots_lifecycle_context,
    slot_path,
    slot_worktree,
)


def test_plan_free_release_includes_cleanup_preview_without_mutating(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    pr = FakePRGateway(prs_by_branch={"feat/x": make_pr(42, "OPEN", "feat/x")})
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main", "feat/x"),
        worktrees=(slot_worktree(slots_root, 1, "feat/x"),),
        pr_gateway=pr,
    )

    preview = plan_free_release(
        ctx,
        ("slot-01",),
        cleanup_actions=SLOT_RELEASE_ALL_CLEANUP_ACTIONS,
    )

    assert isinstance(preview, SlotFreeReleasePreview)
    assert preview.cleanup_actions == SLOT_RELEASE_ALL_CLEANUP_ACTIONS
    assert [(entry.action, entry.status, entry.pr_number) for entry in preview.cleanup] == [
        ("pr", "planned", 42),
        ("local_branch", "planned", None),
    ]
    assert git._detach_head_calls == []
    assert git.delete_local_branch_calls == ()
    assert pr.close_calls == ()


def test_execute_free_release_detaches_then_runs_cleanup(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    pr = FakePRGateway(prs_by_branch={"feat/x": make_pr(42, "OPEN", "feat/x")})
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main", "feat/x"),
        worktrees=(slot_worktree(slots_root, 1, "feat/x"),),
        pr_gateway=pr,
    )
    preview = plan_free_release(
        ctx,
        ("slot-01",),
        cleanup_actions=SLOT_RELEASE_ALL_CLEANUP_ACTIONS,
    )
    assert isinstance(preview, SlotFreeReleasePreview)
    assert preview.cleanup_actions == SLOT_RELEASE_ALL_CLEANUP_ACTIONS

    execution = execute_free_release(ctx, preview)

    assert isinstance(execution, SlotFreeReleaseExecution)
    assert [freed.slot_name for freed in execution.outcome.freed] == ["slot-01"]
    assert [(entry.action, entry.status, entry.pr_number) for entry in execution.cleanup] == [
        ("pr", "success", 42),
        ("local_branch", "success", None),
    ]
    assert git._detach_head_calls == [(slot_path(slots_root, 1), "main")]
    assert git.delete_local_branch_calls == (("feat/x", True),)
    assert pr.close_calls == (42,)


def test_execute_free_release_stops_before_cleanup_when_detach_fails(
    tmp_path: Path,
) -> None:
    slots_root = tmp_path / "slots"
    worktree_path = slot_path(slots_root, 1)
    pr = FakePRGateway(prs_by_branch={"feat/x": make_pr(42, "OPEN", "feat/x")})
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main", "feat/x"),
        worktrees=(slot_worktree(slots_root, 1, "feat/x"),),
        detach_head_failures_by_path={
            worktree_path: subprocess.CalledProcessError(
                128,
                ["git", "checkout", "--detach", "main"],
                stderr="fatal: reference is not a tree: main",
            ),
        },
        pr_gateway=pr,
    )
    preview = plan_free_release(
        ctx,
        ("slot-01",),
        cleanup_actions=SLOT_RELEASE_ALL_CLEANUP_ACTIONS,
    )
    assert isinstance(preview, SlotFreeReleasePreview)
    assert preview.cleanup_actions == SLOT_RELEASE_ALL_CLEANUP_ACTIONS

    execution = execute_free_release(ctx, preview)

    assert isinstance(execution, SlotLifecycleFailure)
    assert execution.error_type == "slot_allocation_error"
    assert "Failed to detach slot-01" in execution.message
    assert git._detach_head_calls == [(worktree_path, "main")]
    assert git.delete_local_branch_calls == ()
    assert pr.close_calls == ()
    assert git.branch_exists("feat/x")


def test_execute_free_release_mid_loop_failure_preserves_partial_message(
    tmp_path: Path,
) -> None:
    slots_root = tmp_path / "slots"
    first_path = slot_path(slots_root, 1)
    second_path = slot_path(slots_root, 2)
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main", "feat/a", "feat/b"),
        worktrees=(
            slot_worktree(slots_root, 1, "feat/a"),
            slot_worktree(slots_root, 2, "feat/b"),
        ),
        detach_head_failures_by_path={
            second_path: subprocess.CalledProcessError(
                128,
                ["git", "checkout", "--detach", "main"],
                stderr="fatal: reference is not a tree: main",
            ),
        },
    )
    preview = plan_free_release(ctx, ("slot-01", "slot-02"), cleanup_actions=("local_branch",))
    assert isinstance(preview, SlotFreeReleasePreview)
    assert preview.cleanup_actions == ("local_branch",)

    execution = execute_free_release(ctx, preview)

    assert isinstance(execution, SlotLifecycleFailure)
    assert execution.message.endswith("Already freed: slot-01.")
    assert git._detach_head_calls == [(first_path, "main"), (second_path, "main")]
    assert git.delete_local_branch_calls == ()
    assert git.get_current_branch(first_path) == DetachedHead()
    assert git.get_current_branch(second_path) == "feat/b"


def test_plan_gc_release_returns_preview_outcome_with_cleanup_without_mutating(
    tmp_path: Path,
) -> None:
    slots_root = tmp_path / "slots"
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main", "feat/done"),
        worktrees=(slot_worktree(slots_root, 1, "feat/done"),),
        prs_by_branch={"feat/done": make_pr(7, "MERGED", "feat/done")},
    )

    preview = plan_gc_release(ctx, cleanup_actions=("local_branch",))

    assert isinstance(preview, SlotGcReleasePreview)
    assert preview.cleanup_actions == ("local_branch",)
    assert preview.outcome.dry_run is True
    assert [entry.action for entry in preview.outcome.entries] == ["would_free"]
    assert [(entry.action, entry.status) for entry in preview.outcome.entries[0].cleanup] == [
        ("local_branch", "planned")
    ]
    assert git._detach_head_calls == []
    assert git.delete_local_branch_calls == ()
    assert git.branch_exists("feat/done")


def test_execute_gc_release_frees_would_free_entries_and_attaches_cleanup(
    tmp_path: Path,
) -> None:
    slots_root = tmp_path / "slots"
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main", "feat/done"),
        worktrees=(slot_worktree(slots_root, 1, "feat/done"),),
        prs_by_branch={"feat/done": make_pr(7, "MERGED", "feat/done")},
    )
    preview = plan_gc_release(ctx, cleanup_actions=("local_branch",))
    assert isinstance(preview, SlotGcReleasePreview)
    assert preview.cleanup_actions == ("local_branch",)

    outcome = execute_gc_release(ctx, preview)

    assert [entry.action for entry in outcome.entries] == ["freed"]
    assert [(entry.action, entry.status) for entry in outcome.entries[0].cleanup] == [
        ("local_branch", "success")
    ]
    assert outcome.cleanup_error_count == 0
    assert git._detach_head_calls == [(slot_path(slots_root, 1), "main")]
    assert git.delete_local_branch_calls == (("feat/done", True),)
    assert not git.branch_exists("feat/done")


def test_execute_gc_release_preserves_dirty_recheck_semantics(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    worktree_path = slot_path(slots_root, 1)
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main", "feat/done"),
        worktrees=(slot_worktree(slots_root, 1, "feat/done"),),
        prs_by_branch={"feat/done": make_pr(7, "MERGED", "feat/done")},
    )
    preview = plan_gc_release(ctx, cleanup_actions=("local_branch",))
    assert isinstance(preview, SlotGcReleasePreview)
    assert preview.cleanup_actions == ("local_branch",)
    git._file_status_by_path[worktree_path] = FileStatus(False, True, False)

    outcome = execute_gc_release(ctx, preview)

    assert [entry.action for entry in outcome.entries] == ["skipped_dirty"]
    assert outcome.skipped_count == 1
    assert git._detach_head_calls == []
    assert git.delete_local_branch_calls == ()


def test_execute_gc_release_preserves_operation_recheck_semantics(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    operation_path = slot_path(slots_root, 1)
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        worktrees=(slot_worktree(slots_root, 1, "feat/done"),),
        prs_by_branch={"feat/done": make_pr(7, "MERGED", "feat/done")},
    )
    preview = plan_gc_release(ctx, cleanup_actions=("local_branch",))
    assert isinstance(preview, SlotGcReleasePreview)
    assert preview.cleanup_actions == ("local_branch",)
    git._worktrees = [WorktreeInfo(path=operation_path, branch=None, is_bare=False)]
    git._operations_by_path[operation_path] = WorktreeOccupancy(
        path=operation_path,
        branch="feat/done",
        operation="bisect",
    )

    outcome = execute_gc_release(ctx, preview)

    assert [entry.action for entry in outcome.entries] == ["skipped_operation"]
    assert outcome.skipped_count == 1
    assert "bisect" in (outcome.entries[0].message or "")
    assert git._detach_head_calls == []
    assert git.delete_local_branch_calls == ()


def test_plan_gc_release_surfaces_pool_empty_failure(tmp_path: Path) -> None:
    ctx, git = make_slots_lifecycle_context(tmp_path)

    preview = plan_gc_release(ctx, cleanup_actions=("local_branch",))

    assert isinstance(preview, SlotLifecycleFailure)
    assert preview.error_type == "pool_empty"
    assert git._detach_head_calls == []
