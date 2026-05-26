"""Graphite-specific Objective CLI context loading."""

from __future__ import annotations

from dataclasses import dataclass

import click

from asdl_core.clinkr.context import load_clinkr_context_object
from asdl_core.gt.gateway import GtGateway
from asdl_core.gt.real_gateway import RealGtGateway
from asdl_objectives.context import ObjectiveCliContext, ObjectiveCliUnavailable


@dataclass(frozen=True)
class ObjectiveGtCliContext:
    objective: ObjectiveCliContext
    gt: GtGateway


def load_objective_gt_context(
    ctx: click.Context,
) -> ObjectiveGtCliContext | ObjectiveCliUnavailable:
    """Unpack an Objective context and attach an opt-in Graphite gateway."""
    result = load_clinkr_context_object(ctx).context_factory()
    if isinstance(result, ObjectiveGtCliContext):
        return result
    if isinstance(result, ObjectiveCliContext):
        return ObjectiveGtCliContext(objective=result, gt=RealGtGateway())
    if isinstance(result, ObjectiveCliUnavailable):
        return result
    raise RuntimeError(
        "context_factory returned "
        f"{type(result).__name__}, expected ObjectiveGtCliContext, "
        "ObjectiveCliContext, or ObjectiveCliUnavailable."
    )
