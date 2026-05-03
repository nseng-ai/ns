from __future__ import annotations

from dataclasses import dataclass

import click

from asdl_core.clinkr.context import load_clinkr_context_object
from asdl_core.gt.gateway import GtGateway
from asdl_core.gt.real_gateway import RealGtGateway
from asdl_slots.cli.slot.context import build_slots_context
from asdl_slots.context import SlotsCliContext
from asdl_slots.repo_context import NoRepoSentinel


@dataclass(frozen=True)
class SlotGtContext:
    slots: SlotsCliContext
    gt: GtGateway


def build_slot_gt_context() -> SlotGtContext | NoRepoSentinel:
    match build_slots_context():
        case NoRepoSentinel() as sentinel:
            return sentinel
        case SlotsCliContext() as slots_ctx:
            return SlotGtContext(slots=slots_ctx, gt=RealGtGateway())


def load_slot_gt_context(ctx: click.Context) -> SlotGtContext | NoRepoSentinel:
    result = load_clinkr_context_object(ctx).context_factory()
    match result:
        case NoRepoSentinel() as sentinel:
            return sentinel
        case SlotGtContext() as gt_ctx:
            return gt_ctx
        case SlotsCliContext() as slots_ctx:
            return SlotGtContext(slots=slots_ctx, gt=RealGtGateway())
        case _:
            raise RuntimeError(
                "context_factory returned "
                f"{type(result).__name__}, expected SlotGtContext, SlotsCliContext, or "
                "NoRepoSentinel."
            )
