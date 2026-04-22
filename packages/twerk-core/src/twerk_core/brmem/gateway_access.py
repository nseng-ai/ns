"""Gateway retrieval helpers for branch memory commands."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import click

from twerk_core.brmem.context import BrmemCliContext
from twerk_core.brmem.gateway import BranchMemoryGateway
from twerk_core.clinkr.context import load_typed_context
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.git.git_gateway import GitGateway
from twerk_core.git.types import DetachedHead, GitCommandFailure


def get_branch_memory_gateway(ctx: click.Context) -> BranchMemoryGateway:
    """Return the branch-memory gateway for the current CLI invocation."""
    return load_typed_context(ctx, BrmemCliContext).brmem_gateway


def get_git_gateway(ctx: click.Context) -> GitGateway:
    """Return the shared git gateway for the current CLI invocation."""
    return load_typed_context(ctx, BrmemCliContext).git_gateway


def resolve_current_brmem_branch(
    ctx: click.Context,
    requested_branch: str | None,
) -> str | ClinkrExit[Any]:
    """Return ``requested_branch`` when set, else the current HEAD branch.

    Translates ``DetachedHead`` and ``GitCommandFailure`` from the git gateway
    into the standard brmem ``ClinkrExit.failure`` payloads so callers can
    propagate the exit directly.
    """
    if requested_branch is not None:
        return requested_branch

    match get_git_gateway(ctx).get_current_branch(Path.cwd()):
        case GitCommandFailure() as failure:
            return ClinkrExit.failure(error_type="git_failed", message=failure.message)
        case DetachedHead():
            return ClinkrExit.failure(
                error_type="detached_head",
                message="Detached HEAD: brmem requires a checked-out branch.",
            )
        case str() as current_branch:
            return current_branch
