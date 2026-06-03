"""Fakes for cmux integration tests."""

from __future__ import annotations

from dataclasses import dataclass

from asdl_tools.cmux.gateway import CmuxCommandFailure, CmuxGateway


@dataclass(frozen=True)
class RecordedCmuxStatus:
    workspace: str
    key: str
    value: str
    icon: str
    color: str
    priority: int


class FakeCmuxGateway(CmuxGateway):
    """In-memory cmux gateway for CLI scenario tests."""

    def __init__(self, *, fail_next: CmuxCommandFailure | None = None) -> None:
        self.fail_next = fail_next
        self.renamed_workspaces: list[tuple[str, str]] = []
        self.workspace_descriptions: list[tuple[str, str]] = []
        self.statuses: list[RecordedCmuxStatus] = []

    def rename_workspace(self, *, workspace: str, title: str) -> CmuxCommandFailure | None:
        failure = self._pop_failure()
        if failure is not None:
            return failure
        self.renamed_workspaces.append((workspace, title))
        return None

    def set_workspace_description(
        self,
        *,
        workspace: str,
        description: str,
    ) -> CmuxCommandFailure | None:
        failure = self._pop_failure()
        if failure is not None:
            return failure
        self.workspace_descriptions.append((workspace, description))
        return None

    def set_status(
        self,
        *,
        workspace: str,
        key: str,
        value: str,
        icon: str,
        color: str,
        priority: int,
    ) -> CmuxCommandFailure | None:
        failure = self._pop_failure()
        if failure is not None:
            return failure
        self.statuses.append(
            RecordedCmuxStatus(
                workspace=workspace,
                key=key,
                value=value,
                icon=icon,
                color=color,
                priority=priority,
            )
        )
        return None

    def _pop_failure(self) -> CmuxCommandFailure | None:
        failure = self.fail_next
        self.fail_next = None
        return failure
