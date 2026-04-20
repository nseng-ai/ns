"""Build and load the typed brmem CLI context."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from twerk_core.brmem.gateway import BranchMemoryGateway
from twerk_core.brmem.real import RealBranchMemoryGateway
from twerk_core.git.git_gateway import GitGateway
from twerk_core.git.real_git_gateway import RealGitGateway


@dataclass(frozen=True)
class BrmemCliContext:
    """Typed context for the ``brmem`` CLI."""

    brmem_gateway: BranchMemoryGateway
    git_gateway: GitGateway


def build_brmem_context() -> BrmemCliContext:
    """Assemble a :class:`BrmemCliContext` from real gateways and the cwd."""
    return BrmemCliContext(
        brmem_gateway=RealBranchMemoryGateway(cwd=Path.cwd()),
        git_gateway=RealGitGateway(),
    )
