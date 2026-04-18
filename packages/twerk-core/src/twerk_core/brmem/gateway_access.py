"""Gateway retrieval helpers for branch memory commands."""

from __future__ import annotations

from pathlib import Path

import click

from twerk_core.brmem.gateway import BranchMemoryGateway
from twerk_core.brmem.real import RealBranchMemoryGateway


def get_branch_memory_gateway(ctx: click.Context) -> BranchMemoryGateway:
    """Return the branch-memory gateway for the current CLI invocation."""
    gateway = ctx.obj.get("brmem_gateway") if ctx.obj else None
    if gateway is None:
        return RealBranchMemoryGateway(cwd=Path.cwd())
    return gateway
