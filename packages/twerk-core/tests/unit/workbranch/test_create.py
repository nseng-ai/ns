"""Unit tests for workbranch create."""

from __future__ import annotations

from pathlib import Path

import click

from twerk_core.clinkr.command import ClinkrCommandError
from twerk_core.workbranch.create import (
    WorkbranchCreateRequest,
    WorkbranchCreateResult,
    run_workbranch_create,
)
from twerk_core.workbranch.testing import FakeWorkbranchGitGateway
from twerk_core.working_memory.testing import FakeWorkingMemoryGateway


def _ctx(
    *,
    wm: FakeWorkingMemoryGateway | None = None,
    git: FakeWorkbranchGitGateway | None = None,
) -> click.Context:
    return click.Context(
        click.Command("workbranch"),
        obj={
            "working_memory_gateway": wm if wm is not None else FakeWorkingMemoryGateway(),
            "workbranch_git_gateway": git if git is not None else FakeWorkbranchGitGateway(),
        },
    )


def test_run_workbranch_create_writes_plan_and_creates_branch(tmp_path: Path) -> None:
    plan_file = tmp_path / "plan.md"
    plan_file.write_text("# Plan\n")
    wm = FakeWorkingMemoryGateway()
    git = FakeWorkbranchGitGateway()

    result = run_workbranch_create(
        _ctx(wm=wm, git=git),
        WorkbranchCreateRequest(branch="feat/x", plan_file=str(plan_file)),
    )

    assert result == WorkbranchCreateResult(branch="feat/x", files_written=("plan.md",))
    assert wm.read("feat/x", "plan.md") == "# Plan\n"
    assert git._created_branches == ["feat/x"]


def test_run_workbranch_create_errors_when_plan_file_missing(tmp_path: Path) -> None:
    result = run_workbranch_create(
        _ctx(),
        WorkbranchCreateRequest(branch="feat/x", plan_file=str(tmp_path / "missing.md")),
    )

    assert result == ClinkrCommandError(
        error_type="plan_file_missing",
        message=f"Plan file not found: {tmp_path / 'missing.md'}",
    )


def test_run_workbranch_create_errors_when_branch_already_exists(tmp_path: Path) -> None:
    plan_file = tmp_path / "plan.md"
    plan_file.write_text("# Plan\n")
    git = FakeWorkbranchGitGateway(existing_branches={"feat/x"})

    result = run_workbranch_create(
        _ctx(git=git),
        WorkbranchCreateRequest(branch="feat/x", plan_file=str(plan_file)),
    )

    assert result == ClinkrCommandError(
        error_type="branch_exists",
        message="Branch already exists: feat/x",
    )


def test_run_workbranch_create_errors_when_working_memory_already_exists(tmp_path: Path) -> None:
    plan_file = tmp_path / "plan.md"
    plan_file.write_text("# Plan\n")
    wm = FakeWorkingMemoryGateway(initial_files={"feat/x": {"plan.md": "old\n"}})
    git = FakeWorkbranchGitGateway()

    result = run_workbranch_create(
        _ctx(wm=wm, git=git),
        WorkbranchCreateRequest(branch="feat/x", plan_file=str(plan_file)),
    )

    assert result == ClinkrCommandError(
        error_type="working_memory_exists",
        message="Working memory already exists for branch: feat/x",
    )
    assert git._created_branches == []
