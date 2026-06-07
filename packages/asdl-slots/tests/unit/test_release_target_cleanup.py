from __future__ import annotations

import subprocess
from pathlib import Path

from asdl_core.gh.pr_testing import FakePRGateway
from asdl_core.gh.types import PRGatewayFailure
from asdl_core.git.types import DetachedHead, FileStatus
from asdl_slots.lifecycle.free import (
    SLOT_FREE_ALL_CLEANUP_ACTIONS,
    execute_free_plan,
    plan_free_slots,
)
from asdl_slots.lifecycle.gc import execute_gc_plan, plan_gc
from asdl_slots.lifecycle.outcomes import SlotLifecycleFailure
from asdl_slots.lifecycle.release_cleanup import execute_release_cleanup, plan_release_cleanup
from asdl_slots.testing.lifecycle_context import (
    make_pr,
    make_slots_lifecycle_context,
    slot_path,
    slot_worktree,
)


def test_plan_free_slots_validates_every_target_without_mutation(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    dirty_path = slot_path(slots_root, 2)
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main", "feat/a", "feat/b"),
        worktrees=(
            slot_worktree(slots_root, 1, "feat/a"),
            slot_worktree(slots_root, 2, "feat/b"),
        ),
        file_status_by_path={dirty_path: FileStatus(staged=False, modified=True, untracked=False)},
    )

    plan = plan_free_slots(ctx, ("slot-01", "slot-02"))

    assert isinstance(plan, SlotLifecycleFailure)
    assert plan.error_type == "invalid_slot_args"
    assert "slot-02 has uncommitted changes" in plan.message
    assert git.get_current_branch(slot_path(slots_root, 1)) == "feat/a"
    assert git.get_current_branch(dirty_path) == "feat/b"


def test_execute_free_plan_detaches_then_cleanup_closes_pr_and_deletes_branch(
    tmp_path: Path,
) -> None:
    slots_root = tmp_path / "slots"
    branch = "feat/done"
    pr = FakePRGateway(prs_by_branch={branch: make_pr(7, "OPEN", branch)})
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main", branch),
        worktrees=(slot_worktree(slots_root, 1, branch),),
        pr_gateway=pr,
    )
    plan = plan_free_slots(ctx, ("slot-01",))
    assert not isinstance(plan, SlotLifecycleFailure)

    outcome = execute_free_plan(ctx, plan)
    assert not isinstance(outcome, SlotLifecycleFailure)
    cleanup = plan_release_cleanup(
        ctx,
        outcome.freed,
        SLOT_FREE_ALL_CLEANUP_ACTIONS,
        trunk_branch=plan.trunk_branch,
    )

    assert outcome.freed[0].slot_name == "slot-01"
    assert isinstance(git.get_current_branch(slot_path(slots_root, 1)), DetachedHead)
    assert pr.close_calls == ()
    assert git.branch_exists(branch)
    assert [(entry.action, entry.status) for entry in cleanup] == [
        ("pr", "planned"),
        ("local_branch", "planned"),
    ]


def test_execute_free_plan_reports_already_freed_on_partial_failure(
    tmp_path: Path,
) -> None:
    slots_root = tmp_path / "slots"
    failing_path = slot_path(slots_root, 2)
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main", "feat/a", "feat/b"),
        worktrees=(
            slot_worktree(slots_root, 1, "feat/a"),
            slot_worktree(slots_root, 2, "feat/b"),
        ),
        detach_head_failures_by_path={
            failing_path: subprocess.CalledProcessError(
                returncode=128,
                cmd=["git", "checkout"],
                stderr="fatal: cannot detach",
            )
        },
    )
    plan = plan_free_slots(ctx, ("slot-01", "slot-02"))
    assert not isinstance(plan, SlotLifecycleFailure)

    outcome = execute_free_plan(ctx, plan)

    assert isinstance(outcome, SlotLifecycleFailure)
    assert outcome.error_type == "slot_allocation_error"
    assert "Already freed: slot-01." in outcome.message
    assert isinstance(git.get_current_branch(slot_path(slots_root, 1)), DetachedHead)
    assert git.get_current_branch(failing_path) == "feat/b"


def test_plan_release_cleanup_stops_on_pr_lookup_failure(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    branch = "feat/x"
    pr = FakePRGateway(lookup_failure=PRGatewayFailure(stderr="gh auth failed", returncode=4))
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main", branch),
        worktrees=(slot_worktree(slots_root, 1, branch),),
        pr_gateway=pr,
    )
    plan = plan_free_slots(ctx, ("slot-01",))
    assert not isinstance(plan, SlotLifecycleFailure)

    cleanup = plan_release_cleanup(
        ctx,
        plan.targets,
        SLOT_FREE_ALL_CLEANUP_ACTIONS,
        trunk_branch=plan.trunk_branch,
    )

    assert [(entry.action, entry.status, entry.message) for entry in cleanup] == [
        ("pr", "error", "gh auth failed")
    ]
    assert git.branch_exists(branch)


def test_plan_gc_classifies_mixed_pool_without_dirty_recheck(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    dirty_path = slot_path(slots_root, 4)
    pr = FakePRGateway(
        prs_by_branch={
            "feat/open": make_pr(1, "OPEN", "feat/open"),
            "feat/done": make_pr(2, "MERGED", "feat/done"),
            "feat/dirty": make_pr(3, "CLOSED", "feat/dirty"),
        }
    )
    ctx, _git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main", "feat/open", "feat/no-pr", "feat/done", "feat/dirty"),
        worktrees=(
            slot_worktree(slots_root, 1, "feat/open"),
            slot_worktree(slots_root, 2, "feat/no-pr"),
            slot_worktree(slots_root, 3, "feat/done"),
            slot_worktree(slots_root, 4, "feat/dirty"),
        ),
        file_status_by_path={dirty_path: FileStatus(staged=False, modified=True, untracked=False)},
        pr_gateway=pr,
    )

    plan = plan_gc(ctx)

    assert not isinstance(plan, SlotLifecycleFailure)
    assert plan.would_free_count == 2
    assert {entry.branch_name: entry.action for entry in plan.entries} == {
        "feat/open": "kept_open_pr",
        "feat/no-pr": "kept_no_pr",
        "feat/done": "would_free",
        "feat/dirty": "would_free",
    }


def test_execute_gc_plan_attaches_cleanup_only_to_freed_entries(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    dirty_path = slot_path(slots_root, 2)
    pr = FakePRGateway(
        prs_by_branch={
            "feat/done": make_pr(1, "MERGED", "feat/done"),
            "feat/dirty": make_pr(2, "MERGED", "feat/dirty"),
        }
    )
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main", "feat/done", "feat/dirty"),
        worktrees=(
            slot_worktree(slots_root, 1, "feat/done"),
            slot_worktree(slots_root, 2, "feat/dirty"),
        ),
        file_status_by_path={dirty_path: FileStatus(staged=False, modified=True, untracked=False)},
        pr_gateway=pr,
    )
    plan = plan_gc(ctx)
    assert not isinstance(plan, SlotLifecycleFailure)

    outcome = execute_gc_plan(ctx, plan, cleanup_actions=("local_branch",))

    action_by_branch = {entry.branch_name: entry.action for entry in outcome.entries}
    assert action_by_branch == {"feat/done": "freed", "feat/dirty": "skipped_dirty"}
    cleanup_by_branch = {entry.branch_name: entry.cleanup for entry in outcome.entries}
    assert [entry.status for entry in cleanup_by_branch["feat/done"]] == ["success"]
    assert cleanup_by_branch["feat/dirty"] == ()
    assert outcome.freed_count == 1
    assert outcome.skipped_count == 1
    assert outcome.cleanup_error_count == 0
    assert not git.branch_exists("feat/done")
    assert git.branch_exists("feat/dirty")


def test_execute_release_cleanup_executes_pr_close_and_branch_delete(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    branch = "feat/done"
    pr = FakePRGateway(prs_by_branch={branch: make_pr(7, "OPEN", branch)})
    ctx, git = make_slots_lifecycle_context(
        tmp_path,
        branches=("main", branch),
        worktrees=(slot_worktree(slots_root, 1, branch),),
        pr_gateway=pr,
    )
    plan = plan_free_slots(ctx, ("slot-01",))
    assert not isinstance(plan, SlotLifecycleFailure)
    outcome = execute_free_plan(ctx, plan)
    assert not isinstance(outcome, SlotLifecycleFailure)

    cleanup = execute_release_cleanup(
        ctx,
        outcome.freed,
        SLOT_FREE_ALL_CLEANUP_ACTIONS,
        trunk_branch=plan.trunk_branch,
    )

    assert pr.close_calls == (7,)
    assert not git.branch_exists(branch)
    assert [(entry.action, entry.status) for entry in cleanup] == [
        ("pr", "success"),
        ("local_branch", "success"),
    ]
