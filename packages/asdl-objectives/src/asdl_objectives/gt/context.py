"""Graphite-specific Objective CLI context loading."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import click

from asdl_core.clinkr.context import load_clinkr_context_object
from asdl_core.git.git_gateway import GitGateway
from asdl_core.git.real_git_gateway import RealGitGateway, resolve_repo_root
from asdl_core.gt.gateway import GtGateway
from asdl_core.gt.real_gateway import RealGtGateway
from asdl_objectives.context import (
    ObjectiveCliContext,
    ObjectiveCliUnavailable,
    build_objective_context,
)


@dataclass(frozen=True)
class ObjectiveGtCliContext:
    repo_root: Path
    git: GitGateway
    gt: GtGateway


def build_objective_gt_context() -> ObjectiveGtCliContext | ObjectiveCliUnavailable:
    """Build the real Graphite-specific Objective context from the current repository."""
    repo_root = resolve_repo_root(Path.cwd())
    if repo_root is None:
        return ObjectiveCliUnavailable("Not inside a git repository.")
    return ObjectiveGtCliContext(
        repo_root=repo_root,
        git=RealGitGateway(repo_root=repo_root),
        gt=RealGtGateway(),
    )


def load_objective_gt_context(
    ctx: click.Context,
) -> ObjectiveGtCliContext | ObjectiveCliUnavailable:
    """Unpack or build the Graphite-specific Objective context."""
    runtime = load_clinkr_context_object(ctx)
    if runtime.context_factory is build_objective_context:
        return build_objective_gt_context()

    result = runtime.context_factory()
    if isinstance(result, ObjectiveGtCliContext):
        return result
    if isinstance(result, ObjectiveCliContext):
        return ObjectiveGtCliContext(repo_root=result.repo_root, git=result.git, gt=RealGtGateway())
    if isinstance(result, ObjectiveCliUnavailable):
        return result
    raise RuntimeError(
        "context_factory returned "
        f"{type(result).__name__}, expected ObjectiveGtCliContext, "
        "ObjectiveCliContext, or ObjectiveCliUnavailable."
    )
