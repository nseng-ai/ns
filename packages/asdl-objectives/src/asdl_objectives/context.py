"""Runtime context for the ``objective`` CLI."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import click

from asdl_core.clinkr.context import load_clinkr_context_object
from asdl_core.git.git_gateway import GitGateway
from asdl_core.git.real_git_gateway import RealGitGateway, resolve_repo_root, resolve_trunk_branch


@dataclass(frozen=True)
class ObjectiveCliContext:
    repo_root: Path
    trunk_branch: str
    git: GitGateway


@dataclass(frozen=True)
class ObjectiveCliUnavailable:
    message: str


def build_objective_context() -> ObjectiveCliContext | ObjectiveCliUnavailable:
    """Build the real Objective CLI context from the current working directory."""
    cwd = Path.cwd()
    repo_root = resolve_repo_root(cwd)
    if repo_root is None:
        return ObjectiveCliUnavailable("Not inside a git repository.")

    trunk = resolve_trunk_branch(repo_root)
    if trunk is None:
        return ObjectiveCliUnavailable(
            "Cannot resolve trunk branch (origin/HEAD, main, or master)."
        )

    return ObjectiveCliContext(
        repo_root=repo_root,
        trunk_branch=trunk,
        git=RealGitGateway(repo_root=repo_root, trunk_branch=trunk),
    )


def load_objective_context(ctx: click.Context) -> ObjectiveCliContext | ObjectiveCliUnavailable:
    """Unpack the typed Objective context from the given Click context."""
    result = load_clinkr_context_object(ctx).context_factory()
    if not isinstance(result, ObjectiveCliContext | ObjectiveCliUnavailable):
        raise RuntimeError(
            "context_factory returned "
            f"{type(result).__name__}, expected ObjectiveCliContext or ObjectiveCliUnavailable."
        )
    return result
