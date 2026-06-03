"""Apply compact cmux workspace summaries."""

from __future__ import annotations

from dataclasses import dataclass

from asdl_tools.cmux.gateway import CmuxCommandFailure, CmuxGateway

DEFAULT_STATUS_KEY = "pi-summary"


@dataclass(frozen=True)
class CmuxWorkspaceSummary:
    workspace: str
    title: str
    description: str
    status_key: str = DEFAULT_STATUS_KEY


@dataclass(frozen=True)
class AppliedCmuxWorkspaceSummary:
    workspace: str
    title: str
    description: str
    status_key: str


@dataclass(frozen=True)
class CmuxWorkspaceSummaryFailure:
    code: str
    message: str
    command_failure: CmuxCommandFailure | None = None


def apply_cmux_workspace_summary(
    gateway: CmuxGateway,
    summary: CmuxWorkspaceSummary,
) -> AppliedCmuxWorkspaceSummary | CmuxWorkspaceSummaryFailure:
    failure = gateway.rename_workspace(workspace=summary.workspace, title=summary.title)
    if failure is not None:
        return _command_failure(
            "rename_workspace_failed",
            "Failed to rename cmux workspace.",
            failure,
        )

    failure = gateway.set_workspace_description(
        workspace=summary.workspace,
        description=summary.description,
    )
    if failure is not None:
        return _command_failure(
            "set_description_failed",
            "Failed to set cmux workspace description.",
            failure,
        )

    failure = gateway.clear_status(workspace=summary.workspace, key=summary.status_key)
    if failure is not None:
        return _command_failure(
            "clear_status_failed",
            "Failed to clear cmux workspace status.",
            failure,
        )

    return AppliedCmuxWorkspaceSummary(
        workspace=summary.workspace,
        title=summary.title,
        description=summary.description,
        status_key=summary.status_key,
    )


def _command_failure(
    code: str,
    message: str,
    failure: CmuxCommandFailure,
) -> CmuxWorkspaceSummaryFailure:
    details = failure.stderr.strip() or failure.stdout.strip()
    if details:
        message = f"{message} exit {failure.exit_code}: {details}"
    else:
        message = f"{message} exit {failure.exit_code}."
    return CmuxWorkspaceSummaryFailure(code=code, message=message, command_failure=failure)
