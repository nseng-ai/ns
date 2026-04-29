from __future__ import annotations

from dataclasses import dataclass

import click

from twerk_core.clinkr.context import load_clinkr_context_object
from twerk_core.gt.gateway import GtGateway
from twerk_core.gt.real_gateway import RealGtGateway
from twerk_slots.cli.slot.context import build_slots_context
from twerk_slots.context import SlotsCliContext
from twerk_slots.repo_context import NoGitRepo


@dataclass(frozen=True)
class SlotGtContext:
    slots: SlotsCliContext
    gt: GtGateway


def build_slot_gt_context() -> SlotGtContext | NoGitRepo:
    match build_slots_context():
        case NoGitRepo() as no_repo:
            return no_repo
        case SlotsCliContext() as slots_ctx:
            return SlotGtContext(slots=slots_ctx, gt=RealGtGateway())


def load_slot_gt_context(ctx: click.Context) -> SlotGtContext | NoGitRepo:
    result = load_clinkr_context_object(ctx).context_factory()
    match result:
        case NoGitRepo() as no_repo:
            return no_repo
        case SlotGtContext() as gt_ctx:
            return gt_ctx
        case SlotsCliContext() as slots_ctx:
            return SlotGtContext(slots=slots_ctx, gt=RealGtGateway())
        case _:
            raise RuntimeError(
                "context_factory returned "
                f"{type(result).__name__}, expected SlotGtContext, SlotsCliContext, or "
                "NoGitRepo."
            )
