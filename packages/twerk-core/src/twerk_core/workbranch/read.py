"""Read files from branch working memory."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import click

from twerk_core.clinkr.command import ClinkrCommandError
from twerk_core.clinkr.operation import clinkr_operation
from twerk_core.workbranch.gateway_access import (
    get_workbranch_git_gateway,
    get_working_memory_gateway,
)


@dataclass(frozen=True)
class WorkbranchReadRequest:
    path: str = "plan.md"
    branch: str | None = None


@dataclass(frozen=True)
class WorkbranchReadResult:
    branch: str
    path: str
    content: str

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "branch": self.branch,
            "path": self.path,
            "content": self.content,
        }


def render_workbranch_read(result: WorkbranchReadResult) -> None:
    click.echo(result.content, nl=not result.content.endswith("\n"))


@clinkr_operation(
    name="read",
    help="Read a file from branch working memory.",
    human_renderer=render_workbranch_read,
)
def run_workbranch_read(
    ctx: click.Context,
    request: WorkbranchReadRequest,
) -> WorkbranchReadResult | ClinkrCommandError:
    git_gateway = get_workbranch_git_gateway(ctx)
    wm_gateway = get_working_memory_gateway(ctx)

    branch = request.branch if request.branch is not None else git_gateway.get_current_branch()
    if branch is None:
        return ClinkrCommandError(
            error_type="branch_unresolved",
            message="Could not resolve a branch; pass --branch or run from a branch checkout.",
        )
    if not wm_gateway.exists(branch):
        return ClinkrCommandError(
            error_type="working_memory_missing",
            message=f"No working memory found for branch: {branch}",
        )

    content = wm_gateway.read(branch, request.path)
    if content is None:
        return ClinkrCommandError(
            error_type="path_missing",
            message=f"Path not found in working memory for branch {branch}: {request.path}",
        )
    return WorkbranchReadResult(branch=branch, path=request.path, content=content)
