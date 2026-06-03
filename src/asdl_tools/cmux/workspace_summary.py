"""Apply compact cmux workspace summaries."""

from __future__ import annotations

from dataclasses import dataclass

from asdl_tools.cmux.gateway import CmuxCommandFailure, CmuxGateway

DEFAULT_STATUS_KEY = "pi-summary"
DEFAULT_STATUS_ICON = "sparkle"
DEFAULT_STATUS_COLOR = "#7c3aed"
DEFAULT_STATUS_PRIORITY = 80


@dataclass(frozen=True)
class CmuxWorkspaceSummary:
    workspace: str
    title: str
    goal: str
    current_state: str
    next_action: str
    status: str
    status_key: str = DEFAULT_STATUS_KEY
    status_icon: str = DEFAULT_STATUS_ICON
    status_color: str = DEFAULT_STATUS_COLOR
    status_priority: int = DEFAULT_STATUS_PRIORITY


@dataclass(frozen=True)
class AppliedCmuxWorkspaceSummary:
    workspace: str
    title: str
    status: str
    description: str
    status_key: str


@dataclass(frozen=True)
class CmuxWorkspaceSummaryFailure:
    code: str
    message: str
    command_failure: CmuxCommandFailure | None = None


def build_workspace_description(summary: CmuxWorkspaceSummary) -> str:
    return f"Goal: {summary.goal}\nState: {summary.current_state}\nNext: {summary.next_action}"


def apply_cmux_workspace_summary(
    gateway: CmuxGateway,
    summary: CmuxWorkspaceSummary,
) -> AppliedCmuxWorkspaceSummary | CmuxWorkspaceSummaryFailure:
    description = build_workspace_description(summary)

    failure = gateway.rename_workspace(workspace=summary.workspace, title=summary.title)
    if failure is not None:
        return _command_failure(
            "rename_workspace_failed",
            "Failed to rename cmux workspace.",
            failure,
        )

    failure = gateway.set_workspace_description(
        workspace=summary.workspace,
        description=description,
    )
    if failure is not None:
        return _command_failure(
            "set_description_failed",
            "Failed to set cmux workspace description.",
            failure,
        )

    failure = gateway.set_status(
        workspace=summary.workspace,
        key=summary.status_key,
        value=summary.status,
        icon=summary.status_icon,
        color=summary.status_color,
        priority=summary.status_priority,
    )
    if failure is not None:
        return _command_failure(
            "set_status_failed",
            "Failed to set cmux workspace status.",
            failure,
        )

    return AppliedCmuxWorkspaceSummary(
        workspace=summary.workspace,
        title=summary.title,
        status=summary.status,
        description=description,
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
