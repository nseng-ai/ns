"""Shared git helpers used across reviewer gateways."""

from __future__ import annotations

import subprocess
from pathlib import Path

from twerk_reviewer.models import ReviewerFailure


def run_git(cmd: list[str], *, cwd: Path) -> subprocess.CompletedProcess[str] | ReviewerFailure:
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
        return ReviewerFailure(
            error_type="git_invocation_failed",
            message=f"Failed to run `{command_text}`: {exc}",
        )


def git_toplevel(*, cwd: Path) -> Path | ReviewerFailure:
    """Resolve the git repository root (worktree-aware) for ``cwd``."""
    result = run_git(["git", "rev-parse", "--show-toplevel"], cwd=cwd)
    if isinstance(result, ReviewerFailure):
        return result
    if result.returncode != 0:
        stderr = result.stderr.strip()
        return ReviewerFailure(
            error_type="repo_root_unavailable",
            message=stderr or "Unable to resolve the current git repository root.",
        )
    return Path(result.stdout.strip())
