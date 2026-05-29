"""Dedicated Graphite-aware context for ``objective gt`` commands.

Keeps the base :class:`ObjectiveCliContext` Graphite-free: the
``GtGateway`` dependency lives ONLY in this composed context, satisfying the
runtime Graphite-boundary rule. Mirrors ``SlotGtContext``.
"""

from __future__ import annotations

from dataclasses import dataclass

import click

from asdl_core.clinkr.context import load_clinkr_context_object
from asdl_core.gt.gateway import GtGateway
from asdl_core.gt.real_gateway import RealGtGateway
from asdl_objectives.context import (
    ObjectiveCliContext,
    ObjectiveCliUnavailable,
    build_objective_context,
)


@dataclass(frozen=True)
class ObjectiveGtContext:
    base: ObjectiveCliContext
    gt: GtGateway


def build_objective_gt_context() -> ObjectiveGtContext | ObjectiveCliUnavailable:
    """Build the real Graphite-aware Objective context."""
    base = build_objective_context()
    if isinstance(base, ObjectiveCliUnavailable):
        return base
    return ObjectiveGtContext(base=base, gt=RealGtGateway())


def load_objective_gt_context(
    ctx: click.Context,
) -> ObjectiveGtContext | ObjectiveCliUnavailable:
    """Unpack the typed Graphite Objective context from the Click context.

    Accepts a prebuilt ``ObjectiveGtContext`` (scenario tests), the
    ``ObjectiveCliUnavailable`` sentinel, or a base ``ObjectiveCliContext`` that
    is lazily wrapped in a ``RealGtGateway`` so the standalone CLI keeps
    installing only the Graphite-free base factory.
    """
    result = load_clinkr_context_object(ctx).context_factory()
    match result:
        case ObjectiveCliUnavailable() as unavailable:
            return unavailable
        case ObjectiveGtContext() as gt_ctx:
            return gt_ctx
        case ObjectiveCliContext() as base:
            return ObjectiveGtContext(base=base, gt=RealGtGateway())
        case _:
            raise RuntimeError(
                "context_factory returned "
                f"{type(result).__name__}, expected ObjectiveGtContext, "
                "ObjectiveCliContext, or ObjectiveCliUnavailable."
            )
