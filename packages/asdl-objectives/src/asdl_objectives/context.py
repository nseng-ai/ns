"""Runtime context for the ``objective`` CLI."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import click

from asdl_core.clinkr.context import load_clinkr_context_object
from asdl_core.git.construction import GitUnavailable, build_git_context
from asdl_core.git.git_gateway import GitGateway


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
    git_context = build_git_context(Path.cwd())
    if isinstance(git_context, GitUnavailable):
        return ObjectiveCliUnavailable(git_context.message)
    if git_context.trunk_branch is None:
        return ObjectiveCliUnavailable(
            "Cannot resolve trunk branch (origin/HEAD, main, or master)."
        )

    return ObjectiveCliContext(
        repo_root=git_context.repo_root,
        trunk_branch=git_context.trunk_branch,
        git=git_context.git,
    )


def load_objective_context(ctx: click.Context) -> ObjectiveCliContext | ObjectiveCliUnavailable:
    """Unpack the typed Objective context from the given Click context."""
    result = load_clinkr_context_object(ctx).context_factory()
    if not isinstance(result, (ObjectiveCliContext, ObjectiveCliUnavailable)):
        raise RuntimeError(
            "context_factory returned "
            f"{type(result).__name__}, expected ObjectiveCliContext or ObjectiveCliUnavailable."
        )
    return result
