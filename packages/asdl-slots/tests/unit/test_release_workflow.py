from __future__ import annotations

import subprocess
from pathlib import Path

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
from asdl_slots.lifecycle.outcomes import SlotLifecycleFailure
from asdl_slots.lifecycle.release import (
    SLOT_RELEASE_ALL_CLEANUP_ACTIONS,
    SlotFreeReleaseResult,
    SlotReleaseWorkflow,
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
    pr_gateway: FakePRGateway | None = None,
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
    current_branch_by_path: dict[Path, str | DetachedHead] = {
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
            pr=pr_gateway or FakePRGateway(),
            slots_root=slots_root,
        ),
        git,
    )


def _make_pr(number: int, state: PRState, branch: str) -> PRSummary:
    return PRSummary(
        number=number,
        title=f"PR {number}",
        url=f"https://github.com/dagster-io/asdl/pull/{number}",
        head_ref_name=branch,
        base_ref_name="master",
        state=state,
    )


def test_release_workflow_free_planning_validates_every_target_without_mutation(
    tmp_path: Path,
) -> None:
    slots_root = tmp_path / "slots"
    dirty_path = _slot_path(slots_root, 2)
    ctx, git = _release_context(
        tmp_path,
        branches=("main", "feat/a", "feat/b"),
        worktrees=(
            _slot_worktree(slots_root, 1, "feat/a"),
            _slot_worktree(slots_root, 2, "feat/b"),
        ),
        file_status_by_path={dirty_path: FileStatus(staged=False, modified=True, untracked=False)},
    )

    plan = SlotReleaseWorkflow(ctx).plan_free_slots(("slot-01", "slot-02"))

    assert isinstance(plan, SlotLifecycleFailure)
    assert plan.error_type == "invalid_slot_args"
    assert "slot-02 has uncommitted changes" in plan.message
    assert git.get_current_branch(_slot_path(slots_root, 1)) == "feat/a"
    assert git.get_current_branch(dirty_path) == "feat/b"


def test_release_workflow_explicit_free_release_detaches_then_cleans_up(
    tmp_path: Path,
) -> None:
    slots_root = tmp_path / "slots"
    branch = "feat/done"
    pr = FakePRGateway(prs_by_branch={branch: _make_pr(7, "OPEN", branch)})
    ctx, git = _release_context(
        tmp_path,
        branches=("main", branch),
        worktrees=(_slot_worktree(slots_root, 1, branch),),
        pr_gateway=pr,
    )
    workflow = SlotReleaseWorkflow(ctx)
    plan = workflow.plan_free_slots(("slot-01",))
    assert not isinstance(plan, SlotLifecycleFailure)

    result = workflow.execute_free_release(plan, SLOT_RELEASE_ALL_CLEANUP_ACTIONS)

    assert isinstance(result, SlotFreeReleaseResult)
    assert result.outcome.freed[0].slot_name == "slot-01"
    assert isinstance(git.get_current_branch(_slot_path(slots_root, 1)), DetachedHead)
    assert pr.close_calls == (7,)
    assert not git.branch_exists(branch)
    assert [(entry.action, entry.status) for entry in result.cleanup] == [
        ("pr", "success"),
        ("local_branch", "success"),
    ]


def test_release_workflow_explicit_free_partial_failure_reports_already_freed(
    tmp_path: Path,
) -> None:
    slots_root = tmp_path / "slots"
    failing_path = _slot_path(slots_root, 2)
    ctx, git = _release_context(
        tmp_path,
        branches=("main", "feat/a", "feat/b"),
        worktrees=(
            _slot_worktree(slots_root, 1, "feat/a"),
            _slot_worktree(slots_root, 2, "feat/b"),
        ),
        detach_head_failures_by_path={
            failing_path: subprocess.CalledProcessError(
                returncode=128,
                cmd=["git", "checkout"],
                stderr="fatal: cannot detach",
            )
        },
    )
    workflow = SlotReleaseWorkflow(ctx)
    plan = workflow.plan_free_slots(("slot-01", "slot-02"))
    assert not isinstance(plan, SlotLifecycleFailure)

    outcome = workflow.execute_free_plan(plan)

    assert isinstance(outcome, SlotLifecycleFailure)
    assert outcome.error_type == "slot_allocation_error"
    assert "Already freed: slot-01." in outcome.message
    assert isinstance(git.get_current_branch(_slot_path(slots_root, 1)), DetachedHead)
    assert git.get_current_branch(failing_path) == "feat/b"


def test_release_workflow_cleanup_pr_lookup_failure_stops_before_branch_delete(
    tmp_path: Path,
) -> None:
    slots_root = tmp_path / "slots"
    branch = "feat/x"
    pr = FakePRGateway(lookup_failure=PRGatewayFailure(stderr="gh auth failed", returncode=4))
    ctx, git = _release_context(
        tmp_path,
        branches=("main", branch),
        worktrees=(_slot_worktree(slots_root, 1, branch),),
        pr_gateway=pr,
    )
    workflow = SlotReleaseWorkflow(ctx)
    plan = workflow.plan_free_slots(("slot-01",))
    assert not isinstance(plan, SlotLifecycleFailure)

    cleanup = workflow.plan_cleanup(
        plan.targets,
        SLOT_RELEASE_ALL_CLEANUP_ACTIONS,
        trunk_branch=plan.trunk_branch,
    )

    assert [(entry.action, entry.status, entry.message) for entry in cleanup] == [
        ("pr", "error", "gh auth failed")
    ]
    assert git.branch_exists(branch)


def test_release_workflow_gc_classifies_mixed_pool_without_dirty_recheck(
    tmp_path: Path,
) -> None:
    slots_root = tmp_path / "slots"
    dirty_path = _slot_path(slots_root, 4)
    pr = FakePRGateway(
        prs_by_branch={
            "feat/open": _make_pr(1, "OPEN", "feat/open"),
            "feat/done": _make_pr(2, "MERGED", "feat/done"),
            "feat/dirty": _make_pr(3, "CLOSED", "feat/dirty"),
        }
    )
    ctx, _git = _release_context(
        tmp_path,
        branches=("main", "feat/open", "feat/no-pr", "feat/done", "feat/dirty"),
        worktrees=(
            _slot_worktree(slots_root, 1, "feat/open"),
            _slot_worktree(slots_root, 2, "feat/no-pr"),
            _slot_worktree(slots_root, 3, "feat/done"),
            _slot_worktree(slots_root, 4, "feat/dirty"),
        ),
        file_status_by_path={dirty_path: FileStatus(staged=False, modified=True, untracked=False)},
        pr_gateway=pr,
    )

    plan = SlotReleaseWorkflow(ctx).plan_gc()

    assert not isinstance(plan, SlotLifecycleFailure)
    assert plan.would_free_count == 2
    assert {entry.branch_name: entry.action for entry in plan.entries} == {
        "feat/open": "kept_open_pr",
        "feat/no-pr": "kept_no_pr",
        "feat/done": "would_free",
        "feat/dirty": "would_free",
    }


def test_release_workflow_gc_execution_rechecks_state_and_attaches_cleanup_only_to_freed(
    tmp_path: Path,
) -> None:
    slots_root = tmp_path / "slots"
    dirty_path = _slot_path(slots_root, 2)
    pr = FakePRGateway(
        prs_by_branch={
            "feat/done": _make_pr(1, "MERGED", "feat/done"),
            "feat/dirty": _make_pr(2, "MERGED", "feat/dirty"),
        }
    )
    ctx, git = _release_context(
        tmp_path,
        branches=("main", "feat/done", "feat/dirty"),
        worktrees=(
            _slot_worktree(slots_root, 1, "feat/done"),
            _slot_worktree(slots_root, 2, "feat/dirty"),
        ),
        file_status_by_path={dirty_path: FileStatus(staged=False, modified=True, untracked=False)},
        pr_gateway=pr,
    )
    workflow = SlotReleaseWorkflow(ctx)
    plan = workflow.plan_gc()
    assert not isinstance(plan, SlotLifecycleFailure)

    outcome = workflow.execute_gc_plan(plan, cleanup_actions=("local_branch",))

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
