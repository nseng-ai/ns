"""Production construction helpers for shared git gateways."""

from __future__ import annotations

import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, TypeAlias

from asdl_core.git.git_gateway import GitGateway
from asdl_core.git.real_git_gateway import RealGitGateway

GitUnavailableReason: TypeAlias = Literal["git_unavailable", "not_in_git_repo"]


@dataclass(frozen=True)
class GitUnavailable:
    """Git context cannot be constructed for the current environment."""

    reason: GitUnavailableReason
    message: str


@dataclass(frozen=True)
class GitContext:
    """Resolved repository facts plus the constructed production git gateway."""

    repo_root: Path
    trunk_branch: str | None
    git: GitGateway


def _run(
    cmd: list[str],
    *,
    cwd: Path | None,
    check: bool,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, check=check)


def _branch_exists(repo_root: Path, branch: str) -> bool:
    result = _run(
        ["git", "show-ref", "--verify", "--quiet", f"refs/heads/{branch}"],
        cwd=repo_root,
        check=False,
    )
    return result.returncode == 0


def resolve_repo_root(cwd: Path) -> Path | None:
    """Return the git working-tree root for ``cwd``; ``None`` outside a repo."""

    result = _run(
        ["git", "rev-parse", "--show-toplevel"],
        cwd=cwd,
        check=False,
    )
    if result.returncode != 0:
        return None
    raw = result.stdout.strip()
    if not raw:
        return None
    return Path(raw)


def resolve_trunk_branch(repo_root: Path) -> str | None:
    """Resolve the trunk branch name for ``repo_root``; None if unresolvable."""

    result = _run(
        ["git", "symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
        cwd=repo_root,
        check=False,
    )
    if result.returncode == 0:
        full = result.stdout.strip()
        if full.startswith("origin/"):
            candidate = full[len("origin/") :]
            if candidate and _branch_exists(repo_root, candidate):
                return candidate

    for candidate in ("main", "master"):
        if _branch_exists(repo_root, candidate):
            return candidate
    return None


def build_git_context(cwd: Path) -> GitContext | GitUnavailable:
    """Construct a repo-bound git gateway while resolving repo root and trunk."""

    try:
        repo_root = resolve_repo_root(cwd)
        if repo_root is None:
            return GitUnavailable(
                reason="not_in_git_repo",
                message="Not inside a git repository.",
            )
        trunk_branch = resolve_trunk_branch(repo_root)
    except FileNotFoundError:
        return GitUnavailable(
            reason="git_unavailable",
            message="`git` binary not found on PATH.",
        )

    return GitContext(
        repo_root=repo_root,
        trunk_branch=trunk_branch,
        git=RealGitGateway(repo_root=repo_root, trunk_branch=trunk_branch),
    )
