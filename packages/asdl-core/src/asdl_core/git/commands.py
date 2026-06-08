"""Shared low-level subprocess helpers for production git commands."""

from __future__ import annotations

import subprocess
from pathlib import Path


def run_git_command(
    cmd: list[str],
    *,
    cwd: Path | None,
    check: bool,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, check=check)


def local_branch_exists(repo_root: Path, branch: str) -> bool:
    result = run_git_command(
        ["git", "show-ref", "--verify", "--quiet", f"refs/heads/{branch}"],
        cwd=repo_root,
        check=False,
    )
    return result.returncode == 0
