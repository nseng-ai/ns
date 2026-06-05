from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path
from typing import Literal

ToolName = Literal["gh", "npx"]


class AregEnvironmentError(Exception):
    """Base class for areg host environment failures."""


class ToolMissingError(AregEnvironmentError):
    """Raised when a required host tool is not on PATH."""


class GitRootDiscoveryError(AregEnvironmentError):
    """Raised when Git root discovery cannot produce a usable root."""


def tool_missing_message(tool: ToolName) -> str:
    if tool == "gh":
        return (
            "gh CLI is required but not found on PATH. Install GitHub CLI: https://cli.github.com/"
        )
    return "npx is required but not found on PATH. Install Node.js to continue."


def git_root_required_message(target_dir: Path) -> str:
    return f"Target {target_dir} must be a Git worktree root. Run git init first."


class AregEnvironment(ABC):
    @abstractmethod
    def require_tool(self, tool: ToolName) -> None:
        """Require a supported host tool to exist on PATH."""

    @abstractmethod
    def require_git_root(self, target_dir: Path) -> Path:
        """Return Git's top-level worktree root for target_dir, or raise a gateway error."""
