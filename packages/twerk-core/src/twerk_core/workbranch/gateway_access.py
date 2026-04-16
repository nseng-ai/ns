"""Gateway retrieval from Click context."""

from __future__ import annotations

from pathlib import Path

import click

from twerk_core.workbranch.git_gateway import WorkbranchGitGateway
from twerk_core.workbranch.real_git_gateway import RealWorkbranchGitGateway
from twerk_core.working_memory.gateway import WorkingMemoryGateway
from twerk_core.working_memory.real import RealWorkingMemoryGateway


def get_working_memory_gateway(ctx: click.Context) -> WorkingMemoryGateway:
    """Return the working-memory gateway for this invocation."""
    gateway = ctx.obj.get("working_memory_gateway") if ctx.obj else None
    if gateway is None:
        return RealWorkingMemoryGateway(cwd=Path.cwd())
    return gateway


def get_workbranch_git_gateway(ctx: click.Context) -> WorkbranchGitGateway:
    """Return the git gateway for this invocation."""
    gateway = ctx.obj.get("workbranch_git_gateway") if ctx.obj else None
    if gateway is None:
        return RealWorkbranchGitGateway(cwd=Path.cwd())
    return gateway
