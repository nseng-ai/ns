"""Shared git helpers used across reviewer gateways."""

from __future__ import annotations

import subprocess
from pathlib import Path

from twerk_reviewer.models import GitInvocationFailedError, RepoRootUnavailableError


def run_git(cmd: list[str], *, cwd: Path) -> subprocess.CompletedProcess[str]:
    """Run a ``git`` command in ``cwd`` and return its completed process."""
    try:
        return subprocess.run(
            cmd,
            cwd=cwd,
            capture_output=True,
            text=True,
            check=False,
        )
    except OSError as exc:
        command_text = " ".join(cmd)
        raise GitInvocationFailedError(f"Failed to run `{command_text}`: {exc}") from exc


def git_toplevel(*, cwd: Path) -> Path:
    """Resolve the git repository root (worktree-aware) for ``cwd``."""
    result = run_git(["git", "rev-parse", "--show-toplevel"], cwd=cwd)
    if result.returncode != 0:
        stderr = result.stderr.strip()
        raise RepoRootUnavailableError(
            stderr or "Unable to resolve the current git repository root.",
        )
    return Path(result.stdout.strip())
