"""Gateway for applying cmux workspace metadata."""

from __future__ import annotations

import subprocess
from abc import ABC, abstractmethod
from dataclasses import dataclass

CMUX_COMMAND_TIMEOUT_SECONDS = 30
TIMEOUT_EXIT_CODE = 124
STARTUP_ERROR_EXIT_CODE = 127


@dataclass(frozen=True)
class CmuxCommandFailure:
    command: tuple[str, ...]
    exit_code: int
    stdout: str
    stderr: str


class CmuxGateway(ABC):
    """Capability-shaped interface for cmux workspace metadata updates."""

    @abstractmethod
    def rename_workspace(self, *, workspace: str, title: str) -> CmuxCommandFailure | None:
        """Rename the target workspace."""

    @abstractmethod
    def set_workspace_description(
        self,
        *,
        workspace: str,
        description: str,
    ) -> CmuxCommandFailure | None:
        """Set the target workspace description."""

    @abstractmethod
    def clear_status(self, *, workspace: str, key: str) -> CmuxCommandFailure | None:
        """Clear a cmux sidebar status pill for the target workspace."""


class RealCmuxGateway(CmuxGateway):
    """cmux gateway backed by the installed cmux CLI."""

    def rename_workspace(self, *, workspace: str, title: str) -> CmuxCommandFailure | None:
        return self._run_cmux(("workspace", "rename", workspace, "--title", title))

    def set_workspace_description(
        self,
        *,
        workspace: str,
        description: str,
    ) -> CmuxCommandFailure | None:
        return self._run_cmux(
            (
                "workspace-action",
                "--workspace",
                workspace,
                "--action",
                "set-description",
                "--description",
                description,
            )
        )

    def clear_status(self, *, workspace: str, key: str) -> CmuxCommandFailure | None:
        return self._run_cmux(("clear-status", key, "--workspace", workspace))

    def _run_cmux(self, args: tuple[str, ...]) -> CmuxCommandFailure | None:
        command = ("cmux", *args)
        try:
            result = subprocess.run(
                command,
                check=False,
                capture_output=True,
                text=True,
                timeout=CMUX_COMMAND_TIMEOUT_SECONDS,
            )
        except subprocess.TimeoutExpired as error:
            return CmuxCommandFailure(
                command=command,
                exit_code=TIMEOUT_EXIT_CODE,
                stdout=_timeout_output_to_text(error.stdout),
                stderr=_timeout_output_to_text(error.stderr) or "cmux command timed out.",
            )
        except OSError as error:
            return CmuxCommandFailure(
                command=command,
                exit_code=STARTUP_ERROR_EXIT_CODE,
                stdout="",
                stderr=str(error),
            )

        if result.returncode == 0:
            return None
        return CmuxCommandFailure(
            command=command,
            exit_code=result.returncode,
            stdout=result.stdout,
            stderr=result.stderr,
        )


def _timeout_output_to_text(value: str | bytes | None) -> str:
    if value is None:
        return ""
    if isinstance(value, bytes):
        return value.decode(errors="replace")
    return value
