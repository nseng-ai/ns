from __future__ import annotations

from pathlib import Path

from areg.gateways.environment.gateway import (
    AregEnvironment,
    GitRootDiscoveryError,
    ToolMissingError,
    ToolName,
    git_root_required_message,
    tool_missing_message,
)


class FakeAregEnvironment(AregEnvironment):
    """In-memory areg host environment for scenario tests."""

    def __init__(
        self,
        *,
        available_tools: set[ToolName] | None = None,
        git_roots: dict[Path, Path] | None = None,
        git_root_errors: dict[Path, GitRootDiscoveryError] | None = None,
    ) -> None:
        self._available_tools = {"gh", "npx"} if available_tools is None else set(available_tools)
        self._git_roots = dict(git_roots or {})
        self._git_root_errors = dict(git_root_errors or {})
        self._tool_checks: list[ToolName] = []
        self._git_root_checks: list[Path] = []

    def require_tool(self, tool: ToolName) -> None:
        self._tool_checks.append(tool)
        if tool not in self._available_tools:
            raise ToolMissingError(tool_missing_message(tool))

    def require_git_root(self, target_dir: Path) -> Path:
        self._git_root_checks.append(target_dir)
        if target_dir in self._git_root_errors:
            raise self._git_root_errors[target_dir]
        if target_dir in self._git_roots:
            return self._git_roots[target_dir]
        raise GitRootDiscoveryError(git_root_required_message(target_dir))

    @property
    def tool_checks(self) -> list[ToolName]:
        return self._tool_checks.copy()

    @property
    def git_root_checks(self) -> list[Path]:
        return self._git_root_checks.copy()
