"""Build and load the typed brmem CLI context."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import click

from asdl_core.clinkr.context import load_typed_context_or_fail
from asdl_core.git.construction import GitUnavailable, build_git_context
from asdl_core.git.git_gateway import GitGateway
from brmem.gateway import BranchMemoryGateway
from brmem.real import RealBranchMemoryGateway


@dataclass(frozen=True)
class BrmemCliContext:
    """Typed context for the ``brmem`` CLI."""

    brmem_gateway: BranchMemoryGateway
    git_gateway: GitGateway
    home_root: Path = field(default_factory=Path.home)


@dataclass(frozen=True)
class BrmemCliUnavailable:
    """User-facing reason the real ``brmem`` context cannot be built."""

    error_type: str
    message: str


def build_brmem_context() -> BrmemCliContext | BrmemCliUnavailable:
    """Assemble a :class:`BrmemCliContext` from real gateways and the cwd."""
    cwd = Path.cwd()
    git_context = build_git_context(cwd)
    if isinstance(git_context, GitUnavailable):
        return BrmemCliUnavailable(
            error_type=git_context.cli_error_type,
            message=(
                "brmem requires a git repository because entries are stored in git refs. "
                f"{git_context.message}"
            ),
        )
    return BrmemCliContext(
        brmem_gateway=RealBranchMemoryGateway(cwd=cwd),
        git_gateway=git_context.git,
        home_root=Path.home(),
    )


def load_brmem_context(ctx: click.Context) -> BrmemCliContext:
    """Load the typed ``brmem`` context or fail with package-specific UX."""
    return load_typed_context_or_fail(ctx, BrmemCliContext, BrmemCliUnavailable)
