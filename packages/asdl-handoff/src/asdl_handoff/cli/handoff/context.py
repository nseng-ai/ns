"""Build and load the typed handoff CLI context."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import click

from asdl_core.clinkr.context import load_clinkr_context_object
from asdl_core.clinkr.ensure import Ensure
from asdl_core.git.construction import GitUnavailable, build_git_context
from asdl_core.git.git_gateway import GitGateway
from brmem.gateway import BranchMemoryGateway
from brmem.real import RealBranchMemoryGateway


@dataclass(frozen=True)
class HandoffCliContext:
    """Typed context for the ``handoff`` CLI."""

    brmem_gateway: BranchMemoryGateway
    git_gateway: GitGateway
    cwd: Path = field(default_factory=Path.cwd)


@dataclass(frozen=True)
class HandoffCliUnavailable:
    """User-facing reason the real handoff context cannot be built."""

    error_type: str
    message: str


def build_handoff_context() -> HandoffCliContext | HandoffCliUnavailable:
    """Assemble a :class:`HandoffCliContext` from real gateways and the cwd."""
    cwd = Path.cwd()
    git_context = build_git_context(cwd)
    if isinstance(git_context, GitUnavailable):
        return HandoffCliUnavailable(
            error_type=_handoff_error_type(git_context),
            message=(
                "handoff inventory, list, delete, and gc need git branch state. "
                f"{git_context.message}"
            ),
        )
    return HandoffCliContext(
        brmem_gateway=RealBranchMemoryGateway(cwd=cwd),
        git_gateway=git_context.git,
        cwd=cwd,
    )


def load_handoff_context(ctx: click.Context) -> HandoffCliContext:
    """Load the typed handoff context or fail with package-specific UX."""
    result = load_clinkr_context_object(ctx).context_factory()
    if isinstance(result, HandoffCliContext):
        return result
    if isinstance(result, HandoffCliUnavailable):
        Ensure.fail(error_type=result.error_type, message=result.message)
    raise RuntimeError(
        "context_factory returned "
        f"{type(result).__name__}, expected HandoffCliContext or HandoffCliUnavailable."
    )


def _handoff_error_type(git_context: GitUnavailable) -> str:
    if git_context.reason == "not_in_git_repo":
        return "not-a-git-repo"
    return "git-unavailable"
