"""Context factory for the objective CLI.

The objective CLI needs both the brmem and git gateways (for snapshot reads
and branch liveness) plus a PR gateway (for enriching snapshot-carrying
branches with PR metadata). The brmem subsystem stays domain-agnostic — no
PRGateway leakage there — so objective composes its own typed context on top
of :func:`brmem.context.build_brmem_context`.
"""

from __future__ import annotations

from dataclasses import dataclass

from brmem.context import build_brmem_context
from brmem.gateway import BranchMemoryGateway
from twerk_core.gh.pr_gateway import PRGateway, RealPRGateway
from twerk_core.git.git_gateway import GitGateway


@dataclass(frozen=True)
class ObjectiveCliContext:
    """Typed context for the ``objective`` CLI."""

    brmem_gateway: BranchMemoryGateway
    git_gateway: GitGateway
    pr_gateway: PRGateway


def build_objective_context() -> ObjectiveCliContext:
    """Assemble a :class:`ObjectiveCliContext` from real gateways."""
    brmem_ctx = build_brmem_context()
    return ObjectiveCliContext(
        brmem_gateway=brmem_ctx.brmem_gateway,
        git_gateway=brmem_ctx.git_gateway,
        pr_gateway=RealPRGateway(),
    )
