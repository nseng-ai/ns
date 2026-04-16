"""Real git gateway for workbranch operations."""

from __future__ import annotations

import subprocess
from pathlib import Path

from twerk_core.workbranch.git_gateway import WorkbranchGitGateway


def _run(
    cmd: list[str],
    *,
    cwd: Path,
    check: bool = True,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        cwd=cwd,
        capture_output=True,
        text=True,
        check=check,
    )


class RealWorkbranchGitGateway(WorkbranchGitGateway):
    """Git gateway backed by local ``git`` subprocess calls."""

    def __init__(self, cwd: Path) -> None:
        self._cwd = cwd

    def create_branch_at_head(self, name: str) -> None:
        _run(["git", "branch", name, "HEAD"], cwd=self._cwd)

    def get_current_branch(self) -> str | None:
        result = _run(["git", "symbolic-ref", "--short", "HEAD"], cwd=self._cwd, check=False)
        if result.returncode != 0:
            return None
        branch = result.stdout.strip()
        return branch or None

    def branch_exists(self, name: str) -> bool:
        result = _run(
            ["git", "show-ref", "--verify", "--quiet", f"refs/heads/{name}"],
            cwd=self._cwd,
            check=False,
        )
        return result.returncode == 0
