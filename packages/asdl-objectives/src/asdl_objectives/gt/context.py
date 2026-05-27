"""Runtime context for explicit ``objective gt`` commands."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import click

from asdl_core.clinkr.context import load_clinkr_context_object
from asdl_core.git.git_gateway import GitGateway
from asdl_core.git.real_git_gateway import RealGitGateway, resolve_repo_root
from asdl_core.gt.gateway import GtGateway
from asdl_core.gt.real_gateway import RealGtGateway
from asdl_objectives.context import build_objective_context


@dataclass(frozen=True)
class ObjectiveGtCliContext:
    repo_root: Path
    git: GitGateway
    gt: GtGateway


@dataclass(frozen=True)
class ObjectiveGtCliUnavailable:
    message: str


ObjectiveGtContextResult = ObjectiveGtCliContext | ObjectiveGtCliUnavailable


def build_objective_gt_context() -> ObjectiveGtContextResult:
    """Build the real Graphite Objective context from the current working directory."""
    cwd = Path.cwd()
    repo_root = resolve_repo_root(cwd)
    if repo_root is None:
        return ObjectiveGtCliUnavailable("Not inside a git repository.")

    return ObjectiveGtCliContext(
        repo_root=repo_root,
        git=RealGitGateway(repo_root=repo_root),
        gt=RealGtGateway(),
    )


def load_objective_gt_context(ctx: click.Context) -> ObjectiveGtContextResult:
    """Load an injected test context, or build the production ``objective gt`` context.

    The standalone/plugin Objective CLI installs the generic Objective context factory at the
    root. This Graphite-specific command intentionally does not invoke that factory in production,
    because generic Objective commands resolve a checkout-local trunk before dispatch. Tests may
    install an explicit ``ObjectiveGtCliContext`` via Clinkr's context object; those injected
    contexts are preferred.
    """
    injected = _load_injected_objective_gt_context(ctx)
    if injected is not None:
        return injected
    return build_objective_gt_context()


def _load_injected_objective_gt_context(ctx: click.Context) -> ObjectiveGtContextResult | None:
    try:
        runtime = load_clinkr_context_object(ctx)
    except RuntimeError:
        return None

    if runtime.context_factory is build_objective_context:
        return None

    result = runtime.context_factory()
    if isinstance(result, (ObjectiveGtCliContext, ObjectiveGtCliUnavailable)):
        return result
    return None
