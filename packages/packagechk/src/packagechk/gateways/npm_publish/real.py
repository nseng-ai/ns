from __future__ import annotations

import shlex
import shutil
import subprocess
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from packagechk.gateways.npm_publish.gateway import NpmPublishGateway

ToolFinder = Callable[[str], bool]
CommandRunner = Callable[[list[str], Path], "PublishCommandResult"]


@dataclass(frozen=True)
class PublishCommandResult:
    return_code: int
    stdout: str
    stderr: str


class RealNpmPublishGateway(NpmPublishGateway):
    """Real npm publisher backed by the `npm` CLI."""

    def __init__(
        self,
        *,
        tool_finder: ToolFinder | None = None,
        command_runner: CommandRunner | None = None,
    ) -> None:
        self._tool_finder = tool_finder or _tool_available
        self._command_runner = command_runner or _run_publish_command

    def ensure_publish_tools_available(self) -> str | None:
        if not self._tool_finder("npm"):
            return "Required tool 'npm' is not available. Install Node.js to publish packages."
        return None

    def publish_project(self, project_dir: Path) -> str | None:
        command = ["npm", "publish", "--access=public"]
        try:
            result = self._command_runner(command, project_dir)
        except OSError as error:
            return f"{_format_command(command)} failed to start: {error}"

        if result.return_code != 0:
            return _format_command_failure(command, result)
        return None


def _tool_available(tool_name: str) -> bool:
    return shutil.which(tool_name) is not None


def _run_publish_command(command: list[str], cwd: Path) -> PublishCommandResult:
    completed = subprocess.run(
        command,
        check=False,
        cwd=cwd,
        capture_output=True,
        text=True,
    )
    return PublishCommandResult(
        return_code=completed.returncode,
        stdout=completed.stdout,
        stderr=completed.stderr,
    )


def _format_command_failure(command: list[str], result: PublishCommandResult) -> str:
    output = result.stderr.strip()
    if output == "":
        output = result.stdout.strip()
    if output == "":
        output = "no output"
    return f"{_format_command(command)} failed with exit code {result.return_code}: {output}"


def _format_command(command: list[str]) -> str:
    return shlex.join(command)
