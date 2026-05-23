from __future__ import annotations

import shlex
import shutil
import subprocess
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from packagechk.gateways.pypi_publish.gateway import PypiPublishError, PypiPublishGateway

ToolFinder = Callable[[str], bool]
CommandRunner = Callable[[list[str], Path], "PublishCommandResult"]


@dataclass(frozen=True)
class PublishCommandResult:
    return_code: int
    stdout: str
    stderr: str


class RealPypiPublishGateway(PypiPublishGateway):
    """Real PyPI publisher backed by uv."""

    def __init__(
        self,
        *,
        tool_finder: ToolFinder | None = None,
        command_runner: CommandRunner | None = None,
    ) -> None:
        self._tool_finder = tool_finder or _tool_available
        self._command_runner = command_runner or _run_publish_command

    def ensure_publish_tools_available(self) -> str | None:
        if not self._tool_finder("uv"):
            return "Required tool 'uv' is not available. Install uv to build and publish packages."
        if not self._tool_finder("uvx"):
            return "Required tool 'uvx' is not available. Install uv to build and publish packages."
        return None

    def build_package(self, project_dir: Path) -> list[Path]:
        dist_dir = project_dir / "dist"
        if dist_dir.exists():
            if not dist_dir.is_dir():
                message = f"Cannot prepare dist directory because it is not a directory: {dist_dir}"
                raise PypiPublishError(message)
            shutil.rmtree(dist_dir)

        command = ["uv", "build"]
        try:
            result = self._command_runner(command, project_dir)
        except OSError as error:
            message = f"{_format_command(command)} failed to start: {error}"
            raise PypiPublishError(message) from error

        if result.return_code != 0:
            raise PypiPublishError(_format_command_failure(command, result))
        if not dist_dir.exists():
            raise PypiPublishError("uv build did not create a dist/ directory")
        if not dist_dir.is_dir():
            raise PypiPublishError("uv build created dist, but it is not a directory")

        artifacts = sorted(
            (path for path in dist_dir.iterdir() if path.is_file()),
            key=lambda path: path.name,
        )
        if not artifacts:
            raise PypiPublishError("uv build did not produce any artifacts in dist/")
        return artifacts

    def publish_artifacts(self, project_dir: Path, artifacts: list[Path]) -> str | None:
        if not artifacts:
            return "No distribution artifacts to publish."

        command = ["uvx", "uv-publish", *(str(artifact) for artifact in artifacts)]
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
