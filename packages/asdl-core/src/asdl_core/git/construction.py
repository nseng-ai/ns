"""Production construction helpers for shared git gateways."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal, TypeAlias

from asdl_core.git import commands
from asdl_core.git.commands import local_branch_exists, run_git_command
from asdl_core.git.git_gateway import GitGateway
from asdl_core.git.real_git_gateway import RealGitGateway

subprocess = commands.subprocess

GitUnavailableReason: TypeAlias = Literal["git_unavailable", "not_in_git_repo"]


@dataclass(frozen=True)
class GitUnavailable:
    """Git context cannot be constructed for the current environment."""

    reason: GitUnavailableReason
    message: str

    @property
    def cli_error_type(self) -> str:
        if self.reason == "not_in_git_repo":
            return "not-a-git-repo"
        return "git-unavailable"


@dataclass(frozen=True)
class GitContext:
    """Resolved repository facts plus the constructed production git gateway."""

    repo_root: Path
    trunk_branch: str | None
    git: GitGateway


def build_git_gateway(
    *,
    repo_root: Path | None = None,
    trunk_branch: str | None = None,
) -> GitGateway:
    """Construct the production git gateway for git-backed workflows."""
    return RealGitGateway(repo_root=repo_root, trunk_branch=trunk_branch)


def resolve_repo_root(cwd: Path) -> Path | None:
    """Return the git working-tree root for ``cwd``; ``None`` outside a repo."""

    result = run_git_command(
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

    result = run_git_command(
        ["git", "symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
        cwd=repo_root,
        check=False,
    )
    if result.returncode == 0:
        full = result.stdout.strip()
        if full.startswith("origin/"):
            candidate = full[len("origin/") :]
            if candidate and local_branch_exists(repo_root, candidate):
                return candidate

    for candidate in ("main", "master"):
        if local_branch_exists(repo_root, candidate):
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
        git=build_git_gateway(repo_root=repo_root, trunk_branch=trunk_branch),
    )
