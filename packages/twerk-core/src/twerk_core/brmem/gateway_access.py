"""Gateway retrieval helpers for branch memory commands."""

from __future__ import annotations

from pathlib import Path

import click

from twerk_core.brmem.context import load_brmem_context
from twerk_core.brmem.gateway import BranchMemoryGateway
from twerk_core.clinkr.command import ClinkrCommandError
from twerk_core.git.git_gateway import GitGateway
from twerk_core.git.types import DetachedHead, GitCommandFailure


def get_branch_memory_gateway(ctx: click.Context) -> BranchMemoryGateway:
    """Return the branch-memory gateway for the current CLI invocation."""
    return load_brmem_context(ctx).brmem_gateway


def get_git_gateway(ctx: click.Context) -> GitGateway:
    """Return the shared git gateway for the current CLI invocation."""
    return load_brmem_context(ctx).git_gateway


def resolve_branch_name(
    ctx: click.Context,
    explicit_branch: str | None,
) -> str | ClinkrCommandError:
    """Return ``explicit_branch`` or resolve the current checked-out branch."""
    if explicit_branch is not None:
        return explicit_branch

    match get_git_gateway(ctx).get_current_branch(Path.cwd()):
        case GitCommandFailure() as failure:
            return ClinkrCommandError(
                error_type="git_failed",
                message=failure.message,
            )
        case DetachedHead():
            return ClinkrCommandError(
                error_type="detached_head",
                message="Detached HEAD: brmem requires a checked-out branch.",
            )
        case str() as current_branch:
            return current_branch
