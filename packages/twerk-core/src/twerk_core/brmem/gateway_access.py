"""Gateway retrieval helpers for branch memory commands."""

from __future__ import annotations

import click

from twerk_core.brmem.context import BrmemCliContext
from twerk_core.brmem.gateway import BranchMemoryGateway
from twerk_core.clinkr.context import load_typed_context
from twerk_core.git.git_gateway import GitGateway


def get_branch_memory_gateway(ctx: click.Context) -> BranchMemoryGateway:
    """Return the branch-memory gateway for the current CLI invocation."""
    return load_typed_context(ctx, BrmemCliContext).brmem_gateway


def get_git_gateway(ctx: click.Context) -> GitGateway:
    """Return the shared git gateway for the current CLI invocation."""
    return load_typed_context(ctx, BrmemCliContext).git_gateway
