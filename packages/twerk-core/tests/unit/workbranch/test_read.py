"""Unit tests for workbranch read."""

from __future__ import annotations

import click

from twerk_core.clinkr.command import ClinkrCommandError
from twerk_core.workbranch.read import (
    WorkbranchReadRequest,
    WorkbranchReadResult,
    run_workbranch_read,
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


def test_run_workbranch_read_returns_plan_content() -> None:
    result = run_workbranch_read(
        _ctx(
            wm=FakeWorkingMemoryGateway(initial_files={"feat/x": {"plan.md": "# Plan\n"}}),
            git=FakeWorkbranchGitGateway(current_branch="feat/x"),
        ),
        WorkbranchReadRequest(),
    )

    assert result == WorkbranchReadResult(branch="feat/x", path="plan.md", content="# Plan\n")


def test_run_workbranch_read_uses_explicit_branch_when_provided() -> None:
    result = run_workbranch_read(
        _ctx(
            wm=FakeWorkingMemoryGateway(initial_files={"feat/y": {"plan.md": "# Plan\n"}}),
            git=FakeWorkbranchGitGateway(current_branch=None),
        ),
        WorkbranchReadRequest(branch="feat/y"),
    )

    assert result == WorkbranchReadResult(branch="feat/y", path="plan.md", content="# Plan\n")


def test_run_workbranch_read_errors_when_no_working_memory_exists() -> None:
    result = run_workbranch_read(
        _ctx(git=FakeWorkbranchGitGateway(current_branch="feat/x")),
        WorkbranchReadRequest(),
    )

    assert result == ClinkrCommandError(
        error_type="working_memory_missing",
        message="No working memory found for branch: feat/x",
    )


def test_run_workbranch_read_errors_when_branch_cannot_be_resolved() -> None:
    result = run_workbranch_read(
        _ctx(git=FakeWorkbranchGitGateway(current_branch=None)),
        WorkbranchReadRequest(),
    )

    assert result == ClinkrCommandError(
        error_type="branch_unresolved",
        message="Could not resolve a branch; pass --branch or run from a branch checkout.",
    )


def test_run_workbranch_read_errors_when_path_is_missing() -> None:
    result = run_workbranch_read(
        _ctx(
            wm=FakeWorkingMemoryGateway(initial_files={"feat/x": {"plan.md": "# Plan\n"}}),
            git=FakeWorkbranchGitGateway(current_branch="feat/x"),
        ),
        WorkbranchReadRequest(path="notes.md"),
    )

    assert result == ClinkrCommandError(
        error_type="path_missing",
        message="Path not found in working memory for branch feat/x: notes.md",
    )


def test_run_workbranch_read_supports_custom_path() -> None:
    result = run_workbranch_read(
        _ctx(
            wm=FakeWorkingMemoryGateway(initial_files={"feat/x": {"notes.md": "notes\n"}}),
            git=FakeWorkbranchGitGateway(current_branch="feat/x"),
        ),
        WorkbranchReadRequest(path="notes.md"),
    )

    assert result == WorkbranchReadResult(branch="feat/x", path="notes.md", content="notes\n")
