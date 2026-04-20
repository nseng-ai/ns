"""Build and load the typed brmem CLI context."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import click

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


def load_brmem_context(ctx: click.Context) -> BrmemCliContext:
    """Unpack the typed brmem context from the given Click context.

    ``ctx.obj`` must be a zero-argument callable returning a
    :class:`BrmemCliContext`. The CLI entry point
    (:func:`twerk_core.brmem.main.main`) installs :func:`build_brmem_context`;
    tests install a ``lambda: ctx`` that returns a pre-built fake context.
    """
    ctx_fn = ctx.obj
    if not callable(ctx_fn):
        raise RuntimeError(
            "ctx.obj must be a Callable[[], BrmemCliContext]; "
            "the CLI entry point and tests are responsible for installing it."
        )
    result = ctx_fn()
    if not isinstance(result, BrmemCliContext):
        raise RuntimeError(f"ctx_fn returned {type(result).__name__}, expected BrmemCliContext.")
    return result
