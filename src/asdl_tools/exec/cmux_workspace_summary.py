"""Hidden exec operation for applying a cmux workspace summary."""

from __future__ import annotations

import os
from typing import Annotated

import click

from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_tools.cmux.gateway import CmuxCommandFailure
from asdl_tools.cmux.workspace_summary import (
    DEFAULT_STATUS_COLOR,
    DEFAULT_STATUS_ICON,
    DEFAULT_STATUS_KEY,
    DEFAULT_STATUS_PRIORITY,
    AppliedCmuxWorkspaceSummary,
    CmuxWorkspaceSummary,
    CmuxWorkspaceSummaryFailure,
    apply_cmux_workspace_summary,
    build_workspace_description,
)
from asdl_tools.exec.context import load_asdl_exec_context


class CmuxWorkspaceSummaryRequest(ClinkrModel):
    workspace: Annotated[
        str | None,
        click.Option(
            ["--workspace"],
            type=click.STRING,
            default=None,
            help="Caller cmux workspace id/ref. Defaults to CMUX_WORKSPACE_ID, then CMUX_TAB_ID.",
        ),
    ] = None
    title: Annotated[
        str,
        click.Option(["--title"], type=click.STRING, required=True, help="Workspace title."),
    ]
    description: Annotated[
        str | None,
        click.Option(
            ["--description"],
            type=click.STRING,
            default=None,
            help=(
                "Workspace description. If omitted, built from --goal, "
                "--current-state, and --next-action."
            ),
        ),
    ] = None
    goal: Annotated[
        str | None,
        click.Option(["--goal"], type=click.STRING, default=None, help="Legacy goal line."),
    ] = None
    current_state: Annotated[
        str | None,
        click.Option(
            ["--current-state"],
            type=click.STRING,
            default=None,
            help="Legacy current state line.",
        ),
    ] = None
    next_action: Annotated[
        str | None,
        click.Option(
            ["--next-action"],
            type=click.STRING,
            default=None,
            help="Legacy next action line.",
        ),
    ] = None
    status: Annotated[
        str,
        click.Option(["--status"], type=click.STRING, required=True, help="Sidebar status text."),
    ]
    status_key: Annotated[
        str,
        click.Option(
            ["--status-key"],
            type=click.STRING,
            default=DEFAULT_STATUS_KEY,
            help="cmux status key.",
        ),
    ] = DEFAULT_STATUS_KEY
    status_icon: Annotated[
        str,
        click.Option(
            ["--status-icon"],
            type=click.STRING,
            default=DEFAULT_STATUS_ICON,
            help="cmux status icon.",
        ),
    ] = DEFAULT_STATUS_ICON
    status_color: Annotated[
        str,
        click.Option(
            ["--status-color"],
            type=click.STRING,
            default=DEFAULT_STATUS_COLOR,
            help="cmux status color.",
        ),
    ] = DEFAULT_STATUS_COLOR
    status_priority: Annotated[
        int,
        click.Option(
            ["--status-priority"],
            type=click.INT,
            default=DEFAULT_STATUS_PRIORITY,
            help="cmux status priority.",
        ),
    ] = DEFAULT_STATUS_PRIORITY


class CmuxCommandFailureDto(ClinkrModel):
    command: tuple[str, ...]
    exit_code: int
    stdout: str
    stderr: str


class CmuxWorkspaceSummaryErrorDto(ClinkrModel):
    code: str
    message: str
    command_failure: CmuxCommandFailureDto | None


class CmuxWorkspaceSummaryResult(ClinkrModel):
    success: bool
    workspace: str | None
    title: str
    status: str
    description: str | None
    status_key: str
    error: CmuxWorkspaceSummaryErrorDto | None


def render_cmux_workspace_summary(result: CmuxWorkspaceSummaryResult) -> None:
    if result.success:
        click.echo(f"Applied cmux workspace summary: {result.title} ({result.status})")
        return
    message = result.error.message if result.error is not None else "Unknown cmux summary failure."
    click.echo(message, err=True)


@clinkr_operation(
    name="cmux-workspace-summary",
    help="Apply generated cmux workspace title, description, and status fields.",
    human_renderer=render_cmux_workspace_summary,
)
def run_cmux_workspace_summary(
    ctx: click.Context,
    request: CmuxWorkspaceSummaryRequest,
) -> ClinkrExit[CmuxWorkspaceSummaryResult]:
    workspace = _resolve_workspace(request.workspace)
    if workspace is None:
        result = _failed_result(
            request=request,
            workspace=None,
            failure=CmuxWorkspaceSummaryFailure(
                code="missing_workspace",
                message=(
                    "Not running inside a cmux caller workspace "
                    "(CMUX_WORKSPACE_ID/CMUX_TAB_ID missing)."
                ),
            ),
        )
        assert result.error is not None
        return ClinkrExit.negative(result, message=result.error.message)

    description = _resolve_description(request)
    if isinstance(description, CmuxWorkspaceSummaryFailure):
        result = _failed_result(request=request, workspace=workspace, failure=description)
        assert result.error is not None
        return ClinkrExit.negative(result, message=result.error.message)

    summary = CmuxWorkspaceSummary(
        workspace=workspace,
        title=request.title,
        description=description,
        status=request.status,
        status_key=request.status_key,
        status_icon=request.status_icon,
        status_color=request.status_color,
        status_priority=request.status_priority,
    )
    applied = apply_cmux_workspace_summary(load_asdl_exec_context(ctx).cmux, summary)
    if isinstance(applied, CmuxWorkspaceSummaryFailure):
        result = _failed_result(request=request, workspace=workspace, failure=applied)
        assert result.error is not None
        return ClinkrExit.negative(result, message=result.error.message)

    return ClinkrExit.ok(_successful_result(applied))


def _resolve_workspace(explicit_workspace: str | None) -> str | None:
    return (
        _non_blank(explicit_workspace)
        or _non_blank(os.environ.get("CMUX_WORKSPACE_ID"))
        or _non_blank(os.environ.get("CMUX_TAB_ID"))
    )


def _resolve_description(request: CmuxWorkspaceSummaryRequest) -> str | CmuxWorkspaceSummaryFailure:
    description = _non_blank(request.description)
    if description is not None:
        return description

    goal = _non_blank(request.goal)
    current_state = _non_blank(request.current_state)
    next_action = _non_blank(request.next_action)
    if goal is not None and current_state is not None and next_action is not None:
        return build_workspace_description(
            goal=goal,
            current_state=current_state,
            next_action=next_action,
        )

    return CmuxWorkspaceSummaryFailure(
        code="missing_description",
        message="Provide --description or all of --goal, --current-state, and --next-action.",
    )


def _non_blank(value: str | None) -> str | None:
    stripped = value.strip() if value is not None else None
    if stripped is None or stripped == "":
        return None
    return stripped


def _successful_result(applied: AppliedCmuxWorkspaceSummary) -> CmuxWorkspaceSummaryResult:
    return CmuxWorkspaceSummaryResult(
        success=True,
        workspace=applied.workspace,
        title=applied.title,
        status=applied.status,
        description=applied.description,
        status_key=applied.status_key,
        error=None,
    )


def _failed_result(
    *,
    request: CmuxWorkspaceSummaryRequest,
    workspace: str | None,
    failure: CmuxWorkspaceSummaryFailure,
) -> CmuxWorkspaceSummaryResult:
    return CmuxWorkspaceSummaryResult(
        success=False,
        workspace=workspace,
        title=request.title,
        status=request.status,
        description=None,
        status_key=request.status_key,
        error=CmuxWorkspaceSummaryErrorDto(
            code=failure.code,
            message=failure.message,
            command_failure=_command_failure_dto(failure.command_failure),
        ),
    )


def _command_failure_dto(failure: CmuxCommandFailure | None) -> CmuxCommandFailureDto | None:
    if failure is None:
        return None
    return CmuxCommandFailureDto(
        command=failure.command,
        exit_code=failure.exit_code,
        stdout=failure.stdout,
        stderr=failure.stderr,
    )
