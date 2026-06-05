from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from areg.gateways.environment.gateway import (
    AregEnvironment,
    GitRootDiscoveryError,
    ToolMissingError,
    ToolName,
    git_root_required_message,
    tool_missing_message,
)


class RealAregEnvironment(AregEnvironment):
    """Real areg host environment checks via PATH and Git CLI."""

    def require_tool(self, tool: ToolName) -> None:
        if shutil.which(tool) is None:
            raise ToolMissingError(tool_missing_message(tool))

    def require_git_root(self, target_dir: Path) -> Path:
        try:
            proc = subprocess.run(
                ["git", "-C", str(target_dir), "rev-parse", "--show-toplevel"],
                check=True,
                capture_output=True,
                text=True,
            )
        except FileNotFoundError as e:
            raise GitRootDiscoveryError("git is required but was not found on PATH.") from e
        except subprocess.CalledProcessError as e:
            raise GitRootDiscoveryError(git_root_required_message(target_dir)) from e

        root_raw = proc.stdout.strip()
        if not root_raw:
            raise GitRootDiscoveryError(git_root_required_message(target_dir))
        return Path(root_raw).resolve()
