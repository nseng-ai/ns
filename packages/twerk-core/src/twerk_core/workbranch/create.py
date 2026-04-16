"""Create a branch and stamp plan.md into working memory."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Annotated, Any

import click

from twerk_core.clinkr.command import ClinkrCommandError
from twerk_core.clinkr.operation import clinkr_operation
from twerk_core.workbranch.gateway_access import (
    get_workbranch_git_gateway,
    get_working_memory_gateway,
)


@dataclass(frozen=True)
class WorkbranchCreateRequest:
    branch: str
    plan_file: Annotated[str, click.Option(["--plan-file"], required=True)]


@dataclass(frozen=True)
class WorkbranchCreateResult:
    branch: str
    files_written: tuple[str, ...]

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "branch": self.branch,
            "files_written": list(self.files_written),
        }


def render_workbranch_create(result: WorkbranchCreateResult) -> None:
    files_csv = ", ".join(result.files_written)
    click.echo(f"Created branch {result.branch} and wrote {files_csv} to working memory.")


@clinkr_operation(
    name="create",
    help="Create a branch and stamp plan.md into working memory.",
    human_renderer=render_workbranch_create,
)
def run_workbranch_create(
    ctx: click.Context,
    request: WorkbranchCreateRequest,
) -> WorkbranchCreateResult | ClinkrCommandError:
    plan_path = Path(request.plan_file)
    try:
        plan_content = plan_path.read_text()
    except FileNotFoundError:
        return ClinkrCommandError(
            error_type="plan_file_missing",
            message=f"Plan file not found: {plan_path}",
        )
    except OSError as exc:
        return ClinkrCommandError(
            error_type="plan_file_unreadable",
            message=f"Failed to read plan file {plan_path}: {exc}",
        )

    git_gateway = get_workbranch_git_gateway(ctx)
    wm_gateway = get_working_memory_gateway(ctx)

    if git_gateway.branch_exists(request.branch):
        return ClinkrCommandError(
            error_type="branch_exists",
            message=f"Branch already exists: {request.branch}",
        )
    if wm_gateway.exists(request.branch):
        return ClinkrCommandError(
            error_type="working_memory_exists",
            message=f"Working memory already exists for branch: {request.branch}",
        )

    git_gateway.create_branch_at_head(request.branch)
    wm_gateway.write(request.branch, {"plan.md": plan_content})
    return WorkbranchCreateResult(branch=request.branch, files_written=("plan.md",))
