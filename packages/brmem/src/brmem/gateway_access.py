"""Gateway retrieval helpers for branch memory commands."""

from __future__ import annotations

from pathlib import Path

import click

from brmem.context import BrmemCliContext
from brmem.gateway import BranchMemoryGateway
from twerk_core.clinkr.context import load_typed_context
from twerk_core.clinkr.failure import ClinkrFailure
from twerk_core.git.git_gateway import GitGateway
from twerk_core.git.types import DetachedHead, GitCommandFailure


def get_branch_memory_gateway(ctx: click.Context) -> BranchMemoryGateway:
    """Return the branch-memory gateway for the current CLI invocation."""
    return load_typed_context(ctx, BrmemCliContext).brmem_gateway


def get_git_gateway(ctx: click.Context) -> GitGateway:
    """Return the shared git gateway for the current CLI invocation."""
    return load_typed_context(ctx, BrmemCliContext).git_gateway


def get_home_root(ctx: click.Context) -> Path:
    """Return the home directory used to resolve ``~/.brmem/...`` paths."""
    return load_typed_context(ctx, BrmemCliContext).home_root


def resolve_current_brmem_branch(
    ctx: click.Context,
    requested_branch: str | None,
) -> str:
    """Return ``requested_branch`` when set, else the current HEAD branch.

    Translates ``DetachedHead`` and ``GitCommandFailure`` from the git gateway
    into ClinkrFailure exceptions, raising on error.

    Raises:
        ClinkrFailure: On git command failure or detached HEAD.
    """
    if requested_branch is not None:
        return requested_branch

    match get_git_gateway(ctx).get_current_branch(Path.cwd()):
        case GitCommandFailure() as failure:
            raise ClinkrFailure(error_type="git_failed", message=failure.message)
        case DetachedHead():
            raise ClinkrFailure(
                error_type="detached_head",
                message="Detached HEAD: brmem requires a checked-out branch.",
            )
        case str() as current_branch:
            return current_branch
