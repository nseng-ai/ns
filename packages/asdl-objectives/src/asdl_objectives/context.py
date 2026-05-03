"""Context factory for the objective CLI.

The objective CLI needs brmem, git, and gh gateways together: brmem + git
for snapshot reads and branch liveness, and the PR gateway for enriching
snapshot-carrying branches with PR metadata. The brmem subsystem stays
domain-agnostic — no PR leakage there — so objective composes its own
typed context on top of :func:`brmem.context.build_brmem_context`.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from asdl_core.gh.pr_gateway import PRGateway, RealPRGateway
from asdl_core.git.git_gateway import GitGateway
from asdl_core.git.real_git_gateway import RealGitGateway, resolve_repo_root, resolve_trunk_branch
from asdl_objectives.discovery import FALLBACK_TRUNK_BRANCH
from brmem.context import build_brmem_context
from brmem.gateway import BranchMemoryGateway


@dataclass(frozen=True)
class ObjectiveCliContext:
    """Typed context for the ``objective`` CLI."""

    brmem_gateway: BranchMemoryGateway
    git_gateway: GitGateway
    pr_gateway: PRGateway


def build_objective_context() -> ObjectiveCliContext:
    """Assemble a :class:`ObjectiveCliContext` from real gateways."""
    brmem_ctx = build_brmem_context()
    cwd = Path.cwd()
    repo_root = resolve_repo_root(cwd)
    trunk = resolve_trunk_branch(repo_root) if repo_root is not None else None
    return ObjectiveCliContext(
        brmem_gateway=brmem_ctx.brmem_gateway,
        git_gateway=RealGitGateway(
            repo_root=repo_root,
            trunk_branch=trunk or FALLBACK_TRUNK_BRANCH,
        ),
        pr_gateway=RealPRGateway(),
    )
