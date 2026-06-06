from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from asdl_core.gh.pr_testing import FakePRGateway
from asdl_core.gh.types import PRGatewayFailure, PRState, PRSummary
from asdl_core.git.testing import FakeGitGateway
from asdl_core.git.types import (
    DetachedHead,
    FileStatus,
    GitCommandFailure,
    WorktreeInfo,
    WorktreeOccupancy,
)
from asdl_slots.context import SlotsCliContext
from asdl_slots.gateway.testing.clipboard import FakeClipboardGateway
from asdl_slots.gateway.testing.storage import FakeSlotsStorageGateway
from asdl_slots.lifecycle.outcomes import (
    SlotFreeOutcome,
    SlotFreePlan,
    SlotGcOutcome,
    SlotLifecycleFailure,
)
from asdl_slots.lifecycle.release import (
    SLOT_FREE_ALL_CLEANUP_ACTIONS,
    execute_cleanup_for_freed_slots,
    execute_free_plan,
    execute_gc_plan,
    outcome_from_gc_plan,
    plan_cleanup_for_free_targets,
    plan_free_slots,
    plan_gc,
    plan_gc_cleanup,
)
from asdl_slots.repo_context import RepoContext


def _slot_path(slots_root: Path, n: int) -> Path:
    return slots_root / "repos" / "repo" / "worktrees" / f"slot-{n:02d}"


def _slot_worktree(slots_root: Path, n: int, branch: str | None) -> WorktreeInfo:
    return WorktreeInfo(path=_slot_path(slots_root, n), branch=branch, is_bare=False)


def _release_context(
    tmp_path: Path,
    *,
    branches: tuple[str, ...] = (),
    worktrees: tuple[WorktreeInfo, ...] = (),
    trunk_branch: str = "main",
    file_status_by_path: dict[Path, FileStatus] | None = None,
    operations_by_path: dict[Path, WorktreeOccupancy] | None = None,
    detach_head_failures_by_path: dict[Path, subprocess.CalledProcessError] | None = None,
    delete_local_branch_failure_by_branch: dict[str, GitCommandFailure] | None = None,
    pr: FakePRGateway | None = None,
) -> tuple[SlotsCliContext, FakeGitGateway]:
    repo_root = (tmp_path / "repo").resolve()
    slots_root = tmp_path / "slots"
    repo_dir = slots_root / "repos" / "repo"
    repo = RepoContext(
        root=repo_root,
        main_repo_root=repo_root,
        repo_name="repo",
        repo_dir=repo_dir,
        worktrees_dir=repo_dir / "worktrees",
    )
    current_branch_by_path = {
        wt.path: wt.branch if wt.branch is not None else DetachedHead() for wt in worktrees
    }
    existing_paths = {repo_root, *(wt.path for wt in worktrees)}
    storage = FakeSlotsStorageGateway(existing_paths=existing_paths)
    git = FakeGitGateway(
        repo_root=repo_root,
        branches=branches,
        worktrees=worktrees,
        current_branch_by_path=current_branch_by_path,
        trunk_branch=trunk_branch,
        file_status_by_path=file_status_by_path,
        operations_by_path=operations_by_path,
        detach_head_failures_by_path=detach_head_failures_by_path,
        delete_local_branch_failure_by_branch=delete_local_branch_failure_by_branch,
        existing_paths=existing_paths,
        repository_root_by_cwd={repo_root: repo_root},
    )
    return (
        SlotsCliContext(
            repo=repo,
            git=git,
            storage=storage,
            clipboard=FakeClipboardGateway(),
            pr=pr if pr is not None else FakePRGateway(),
            slots_root=slots_root,
        ),
        git,
    )


def _make_pr(number: int, state: PRState, branch: str) -> PRSummary:
    return PRSummary(
        number=number,
        title=f"PR {number}",
        url=f"https://github.com/example/repo/pull/{number}",
        head_ref_name=branch,
        base_ref_name="main",
        state=state,
    )


def test_release_explicit_plan_execute_and_cleanup_preview_preserve_order(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    pr = FakePRGateway(prs_by_branch={"feat/a": _make_pr(11, "OPEN", "feat/a")})
    ctx, git = _release_context(
        tmp_path,
        branches=("main", "feat/a", "feat/b"),
        worktrees=(
            _slot_worktree(slots_root, 1, "feat/a"),
            _slot_worktree(slots_root, 2, "feat/b"),
        ),
        pr=pr,
    )

    plan = plan_free_slots(ctx, ("slot-02", "slot-01"))

    assert isinstance(plan, SlotFreePlan)
    assert tuple(target.slot_name for target in plan.targets) == ("slot-02", "slot-01")
    cleanup_preview = plan_cleanup_for_free_targets(
        ctx,
        plan.targets,
        SLOT_FREE_ALL_CLEANUP_ACTIONS,
        trunk_branch=plan.trunk_branch,
    )
    assert [(entry.slot_name, entry.action, entry.status) for entry in cleanup_preview] == [
        ("slot-02", "pr", "skipped"),
        ("slot-02", "local_branch", "planned"),
        ("slot-01", "pr", "planned"),
        ("slot-01", "local_branch", "planned"),
    ]
    assert git.get_current_branch(_slot_path(slots_root, 1)) == "feat/a"
    assert git.delete_local_branch_calls == ()
    assert pr.close_calls == ()

    outcome = execute_free_plan(ctx, plan)

    assert isinstance(outcome, SlotFreeOutcome)
    assert tuple(freed.slot_name for freed in outcome.freed) == ("slot-02", "slot-01")
    assert git.get_current_branch(_slot_path(slots_root, 1)) == DetachedHead()
    assert git.get_current_branch(_slot_path(slots_root, 2)) == DetachedHead()


def test_release_explicit_invalid_targets_combine_errors_before_detach(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    dirty_path = _slot_path(slots_root, 1)
    operation_path = _slot_path(slots_root, 2)
    ctx, git = _release_context(
        tmp_path,
        branches=("main", "feat/dirty", "feat/op"),
        worktrees=(
            _slot_worktree(slots_root, 1, "feat/dirty"),
            _slot_worktree(slots_root, 2, "feat/op"),
        ),
        file_status_by_path={dirty_path: FileStatus(staged=False, modified=True, untracked=False)},
        operations_by_path={
            operation_path: WorktreeOccupancy(
                path=operation_path,
                branch="feat/op",
                operation="rebase",
            )
        },
    )

    plan = plan_free_slots(
        ctx,
        ("slot-01", "slot-02", "slot-03"),
        preflight_errors=("selector failed",),
    )

    assert isinstance(plan, SlotLifecycleFailure)
    assert plan.error_type == "invalid_slot_args"
    assert "selector failed" in plan.message
    assert "slot-01 has uncommitted changes" in plan.message
    assert "feat/op" in plan.message
    assert "slot-03 is not currently assigned" in plan.message
    assert git.get_current_branch(dirty_path) == "feat/dirty"
    assert git.get_current_branch(operation_path) == "feat/op"


def test_release_explicit_execute_recheck_reports_already_freed(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    second_path = _slot_path(slots_root, 2)
    failure = subprocess.CalledProcessError(1, ["git", "checkout"], stderr="boom")
    ctx, git = _release_context(
        tmp_path,
        branches=("main", "feat/a", "feat/b"),
        worktrees=(
            _slot_worktree(slots_root, 1, "feat/a"),
            _slot_worktree(slots_root, 2, "feat/b"),
        ),
        detach_head_failures_by_path={second_path: failure},
    )
    plan = plan_free_slots(ctx, ("slot-01", "slot-02"))
    assert isinstance(plan, SlotFreePlan)

    outcome = execute_free_plan(ctx, plan)

    assert isinstance(outcome, SlotLifecycleFailure)
    assert outcome.error_type == "slot_allocation_error"
    assert "Already freed: slot-01" in outcome.message
    assert git.get_current_branch(_slot_path(slots_root, 1)) == DetachedHead()
    assert git.get_current_branch(second_path) == "feat/b"


@pytest.mark.parametrize("pr_state", ["CLOSED", "MERGED"])
def test_release_cleanup_completed_pr_continues_to_local_branch(
    tmp_path: Path,
    pr_state: PRState,
) -> None:
    slots_root = tmp_path / "slots"
    pr = FakePRGateway(prs_by_branch={"feat/x": _make_pr(42, pr_state, "feat/x")})
    ctx, git = _release_context(
        tmp_path,
        branches=("main", "feat/x"),
        worktrees=(_slot_worktree(slots_root, 1, "feat/x"),),
        pr=pr,
    )
    plan = plan_free_slots(ctx, ("slot-01",))
    assert isinstance(plan, SlotFreePlan)
    outcome = execute_free_plan(ctx, plan)
    assert isinstance(outcome, SlotFreeOutcome)

    cleanup = execute_cleanup_for_freed_slots(
        ctx,
        outcome.freed,
        ("pr", "local_branch"),
        trunk_branch=plan.trunk_branch,
    )

    assert [(entry.action, entry.status) for entry in cleanup] == [
        ("pr", "skipped"),
        ("local_branch", "success"),
    ]
    assert git.delete_local_branch_calls == (("feat/x", True),)
    assert pr.close_calls == ()


def test_release_cleanup_pr_failure_stops_before_local_branch(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    pr = FakePRGateway(lookup_failure=PRGatewayFailure(stderr="gh auth failed", returncode=4))
    ctx, git = _release_context(
        tmp_path,
        branches=("main", "feat/x"),
        worktrees=(_slot_worktree(slots_root, 1, "feat/x"),),
        pr=pr,
    )
    plan = plan_free_slots(ctx, ("slot-01",))
    assert isinstance(plan, SlotFreePlan)
    outcome = execute_free_plan(ctx, plan)
    assert isinstance(outcome, SlotFreeOutcome)

    cleanup = execute_cleanup_for_freed_slots(
        ctx,
        outcome.freed,
        ("pr", "local_branch"),
        trunk_branch=plan.trunk_branch,
    )

    assert [(entry.action, entry.status, entry.message) for entry in cleanup] == [
        ("pr", "error", "gh auth failed")
    ]
    assert git.delete_local_branch_calls == ()
    assert git.branch_exists("feat/x")


def test_release_cleanup_local_branch_edges(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    missing_race = GitCommandFailure(message="error: branch 'feat/race' not found.", returncode=1)
    unexpected = GitCommandFailure(message="cannot delete checked out branch", returncode=1)
    ctx, git = _release_context(
        tmp_path,
        branches=("main", "feat/race", "feat/error"),
        worktrees=(
            _slot_worktree(slots_root, 1, "main"),
            _slot_worktree(slots_root, 2, "feat/missing"),
            _slot_worktree(slots_root, 3, "feat/race"),
            _slot_worktree(slots_root, 4, "feat/error"),
        ),
        delete_local_branch_failure_by_branch={"feat/race": missing_race, "feat/error": unexpected},
    )
    plan = plan_free_slots(ctx, ("slot-01", "slot-02", "slot-03", "slot-04"))
    assert isinstance(plan, SlotFreePlan)
    outcome = execute_free_plan(ctx, plan)
    assert isinstance(outcome, SlotFreeOutcome)

    cleanup = execute_cleanup_for_freed_slots(
        ctx,
        outcome.freed,
        ("local_branch",),
        trunk_branch=plan.trunk_branch,
    )

    assert [(entry.branch_name, entry.status, entry.message) for entry in cleanup] == [
        ("main", "error", "refusing to delete trunk branch main"),
    ]
    assert git.delete_local_branch_calls == ()

    non_trunk_cleanup = execute_cleanup_for_freed_slots(
        ctx,
        outcome.freed[1:],
        ("local_branch",),
        trunk_branch=plan.trunk_branch,
    )
    assert [(entry.branch_name, entry.status, entry.message) for entry in non_trunk_cleanup] == [
        ("feat/missing", "skipped", "already absent"),
        ("feat/race", "skipped", "already absent"),
        ("feat/error", "error", "cannot delete checked out branch"),
    ]
    assert git.delete_local_branch_calls == (("feat/race", True), ("feat/error", True))


def test_release_gc_plan_classifies_without_mutating(tmp_path: Path) -> None:
    slots_root = tmp_path / "slots"
    dirty_path = _slot_path(slots_root, 4)
    pr = FakePRGateway(
        prs_by_branch={
            "feat/open": _make_pr(1, "OPEN", "feat/open"),
            "feat/done": _make_pr(2, "MERGED", "feat/done"),
            "feat/dirty": _make_pr(4, "CLOSED", "feat/dirty"),
        }
    )
    ctx, git = _release_context(
        tmp_path,
        branches=("main", "feat/open", "feat/no-pr", "feat/done", "feat/dirty"),
        worktrees=(
            _slot_worktree(slots_root, 1, "feat/open"),
            _slot_worktree(slots_root, 2, "feat/no-pr"),
            _slot_worktree(slots_root, 3, "feat/done"),
            _slot_worktree(slots_root, 4, "feat/dirty"),
            _slot_worktree(slots_root, 5, None),
        ),
        file_status_by_path={dirty_path: FileStatus(staged=False, modified=True, untracked=False)},
        pr=pr,
    )

    plan = plan_gc(ctx)

    assert not isinstance(plan, SlotLifecycleFailure)
    assert [(entry.slot_name, entry.action) for entry in plan.entries] == [
        ("slot-01", "kept_open_pr"),
        ("slot-02", "kept_no_pr"),
        ("slot-03", "would_free"),
        ("slot-04", "would_free"),
    ]
    outcome = outcome_from_gc_plan(plan, dry_run=True)
    assert isinstance(outcome, SlotGcOutcome)
    assert outcome.freed_count == 2
    assert git.get_current_branch(_slot_path(slots_root, 3)) == "feat/done"
    assert git.get_current_branch(dirty_path) == "feat/dirty"


def test_release_gc_execute_rechecks_dirty_operation_and_attaches_cleanup_errors(
    tmp_path: Path,
) -> None:
    slots_root = tmp_path / "slots"
    dirty_path = _slot_path(slots_root, 2)
    operation_path = _slot_path(slots_root, 3)
    cleanup_failure = GitCommandFailure(message="cannot delete local branch", returncode=1)
    pr = FakePRGateway(
        prs_by_branch={
            "feat/freed": _make_pr(1, "MERGED", "feat/freed"),
            "feat/dirty": _make_pr(2, "MERGED", "feat/dirty"),
            "feat/op": _make_pr(3, "MERGED", "feat/op"),
        }
    )
    ctx, git = _release_context(
        tmp_path,
        branches=("main", "feat/freed", "feat/dirty", "feat/op"),
        worktrees=(
            _slot_worktree(slots_root, 1, "feat/freed"),
            _slot_worktree(slots_root, 2, "feat/dirty"),
            _slot_worktree(slots_root, 3, "feat/op"),
        ),
        pr=pr,
        delete_local_branch_failure_by_branch={"feat/freed": cleanup_failure},
    )
    plan = plan_gc(ctx)
    assert not isinstance(plan, SlotLifecycleFailure)
    git._file_status_by_path[dirty_path] = FileStatus(staged=False, modified=True, untracked=False)
    git._operations_by_path[operation_path] = WorktreeOccupancy(
        path=operation_path,
        branch="feat/op",
        operation="rebase",
    )

    cleanup_preview = plan_gc_cleanup(ctx, plan, ("local_branch",))
    outcome = execute_gc_plan(ctx, plan, cleanup_actions=("local_branch",))

    assert [(entry.branch_name, entry.status) for entry in cleanup_preview] == [
        ("feat/freed", "planned"),
        ("feat/dirty", "planned"),
        ("feat/op", "planned"),
    ]
    assert [(entry.slot_name, entry.action) for entry in outcome.entries] == [
        ("slot-01", "freed"),
        ("slot-02", "skipped_dirty"),
        ("slot-03", "skipped_operation"),
    ]
    assert outcome.cleanup_error_count == 1
    assert outcome.entries[0].cleanup[0].status == "error"
    assert git.delete_local_branch_calls == (("feat/freed", True),)
    assert git.get_current_branch(_slot_path(slots_root, 1)) == DetachedHead()
    assert git.get_current_branch(dirty_path) == "feat/dirty"
