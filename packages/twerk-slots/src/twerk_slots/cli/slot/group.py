"""Explicit builder for the `slot` CLI group."""

from __future__ import annotations

import click

from twerk_core.clinkr.group import ClinkrGroup
from twerk_slots.cli.slot.checkout import run_checkout_slot
from twerk_slots.cli.slot.context import build_slots_context
from twerk_slots.cli.slot.free import run_free_slot
from twerk_slots.cli.slot.gc import run_slot_gc
from twerk_slots.cli.slot.goto import run_goto_slot
from twerk_slots.cli.slot.list import run_list_slots


@click.pass_context
def _populate_ctx_obj(ctx: click.Context) -> None:
    if ctx.obj is None:
        ctx.obj = build_slots_context()


def build_slot_group() -> ClinkrGroup:
    group = ClinkrGroup(
        name="slot",
        help="Manage worktree pool slots.",
        operations=[
            run_checkout_slot,
            run_free_slot,
            run_slot_gc,
            run_goto_slot,
            run_list_slots,
        ],
    )
    group.callback = _populate_ctx_obj
    return group
