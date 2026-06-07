"""Shared builders for lifecycle tests over in-memory gateways."""

from __future__ import annotations

import subprocess
from pathlib import Path

from asdl_core.gh.pr_testing import FakePRGateway
from asdl_core.gh.types import PRState, PRSummary
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
from asdl_slots.repo_context import RepoContext


def slot_path(slots_root: Path, n: int) -> Path:
    return slots_root / "repos" / "repo" / "worktrees" / f"slot-{n:02d}"


def slot_worktree(slots_root: Path, n: int, branch: str | None) -> WorktreeInfo:
    return WorktreeInfo(path=slot_path(slots_root, n), branch=branch, is_bare=False)


def make_pr(number: int, state: PRState, branch: str) -> PRSummary:
    return PRSummary(
        number=number,
        title=f"PR {number}",
        url=f"https://github.com/dagster-io/asdl/pull/{number}",
        head_ref_name=branch,
        base_ref_name="master",
        state=state,
    )


def make_slots_lifecycle_context(
    tmp_path: Path,
    *,
    branches: tuple[str, ...] = (),
    worktrees: tuple[WorktreeInfo, ...] = (),
    previous_branch_by_path: dict[Path, str | None] | None = None,
    trunk_branch: str = "main",
    file_status_by_path: dict[Path, FileStatus] | None = None,
    operations_by_path: dict[Path, WorktreeOccupancy] | None = None,
    checkout_failures_by_path: dict[Path, GitCommandFailure] | None = None,
    detach_head_failures_by_path: dict[Path, subprocess.CalledProcessError] | None = None,
    delete_local_branch_failure_by_branch: dict[str, GitCommandFailure] | None = None,
    prs_by_branch: dict[str, PRSummary] | None = None,
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
    current_branch_by_path: dict[Path, str | DetachedHead | GitCommandFailure] = {
        wt.path: wt.branch if wt.branch is not None else DetachedHead() for wt in worktrees
    }
    existing_paths = {repo_root, *(wt.path for wt in worktrees)}
    storage = FakeSlotsStorageGateway(existing_paths=existing_paths)
    git = FakeGitGateway(
        repo_root=repo_root,
        branches=branches,
        worktrees=worktrees,
        current_branch_by_path=current_branch_by_path,
        previous_branch_by_path=previous_branch_by_path,
        trunk_branch=trunk_branch,
        file_status_by_path=file_status_by_path,
        operations_by_path=operations_by_path,
        checkout_failures_by_path=checkout_failures_by_path,
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
            pr=pr_gateway or FakePRGateway(prs_by_branch=prs_by_branch or {}),
            slots_root=slots_root,
        ),
        git,
    )
