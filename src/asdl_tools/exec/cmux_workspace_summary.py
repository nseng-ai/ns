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
    DEFAULT_STATUS_KEY,
    AppliedCmuxWorkspaceSummary,
    CmuxWorkspaceSummary,
    CmuxWorkspaceSummaryFailure,
    apply_cmux_workspace_summary,
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
            help="Workspace description.",
        ),
    ] = None
    status_key: Annotated[
        str,
        click.Option(
            ["--status-key"],
            type=click.STRING,
            default=DEFAULT_STATUS_KEY,
            help="cmux status key to clear.",
        ),
    ] = DEFAULT_STATUS_KEY


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
    description: str | None
    status_key: str
    error: CmuxWorkspaceSummaryErrorDto | None


def render_cmux_workspace_summary(result: CmuxWorkspaceSummaryResult) -> None:
    if result.success:
        click.echo(f"Applied cmux workspace summary: {result.title}")
        return
    message = result.error.message if result.error is not None else "Unknown cmux summary failure."
    click.echo(message, err=True)


@clinkr_operation(
    name="cmux-workspace-summary",
    help="Apply generated cmux workspace title and description fields.",
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
        status_key=request.status_key,
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

    return CmuxWorkspaceSummaryFailure(
        code="missing_description",
        message="Provide --description.",
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
