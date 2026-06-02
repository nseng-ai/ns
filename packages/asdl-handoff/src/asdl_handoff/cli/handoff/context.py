"""Build and load the typed handoff CLI context."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from asdl_core.git.git_gateway import GitGateway
from asdl_core.git.real_git_gateway import RealGitGateway, resolve_repo_root
from brmem.gateway import BranchMemoryGateway
from brmem.real import RealBranchMemoryGateway


@dataclass(frozen=True)
class HandoffCliContext:
    """Typed context for the ``handoff`` CLI."""

    brmem_gateway: BranchMemoryGateway
    git_gateway: GitGateway
    cwd: Path = field(default_factory=Path.cwd)


def build_handoff_context() -> HandoffCliContext:
    """Assemble a :class:`HandoffCliContext` from real gateways and the cwd."""
    cwd = Path.cwd()
    return HandoffCliContext(
        brmem_gateway=RealBranchMemoryGateway(cwd=cwd),
        git_gateway=RealGitGateway(repo_root=resolve_repo_root(cwd)),
        cwd=cwd,
    )
