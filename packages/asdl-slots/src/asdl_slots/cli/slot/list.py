from __future__ import annotations

from typing import Literal

import click

from asdl_core import get_console, make_table
from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_slots.cli.slot.context import load_slots_context
from asdl_slots.inventory import SlotInventory, build_slot_inventory

SlotStatus = Literal["assigned", "available"]


class SlotListRequest(ClinkrModel):
    """No inputs — `slot list` always renders the whole pool for the repo."""


class SlotRow(ClinkrModel):
    slot_name: str
    branch: str | None
    operation: str | None
    worktree_path: str
    status: SlotStatus


class SlotListResult(ClinkrModel):
    pool_size: int
    rows: tuple[SlotRow, ...]
    repo_name: str


def render_slot_list(result: SlotListResult) -> None:
    table = make_table()
    table.add_column("Slot", style="bold cyan", no_wrap=True)
    table.add_column("Status", no_wrap=True)
    table.add_column("Branch", no_wrap=True, overflow="ellipsis", ratio=1)
    table.add_column("Operation", no_wrap=True)
    table.add_column("Worktree", no_wrap=True, style="dim", overflow="ellipsis", ratio=1)

    for row in result.rows:
        operation = "" if row.operation is None else f"{row.operation} in progress"
        table.add_row(
            row.slot_name,
            row.status,
            row.branch or "",
            operation,
            row.worktree_path,
        )

    get_console().print(table)


def _compose_rows(inventory: SlotInventory) -> tuple[SlotRow, ...]:
    return tuple(
        SlotRow(
            slot_name=record.slot_name,
            branch=record.branch,
            operation=record.operation,
            worktree_path=str(record.path),
            status=record.status,
        )
        for record in inventory.records
    )


@clinkr_operation(
    name="list",
    help="List worktree pool slots derived from Git worktree state.",
    aliases=("ls",),
    human_renderer=render_slot_list,
)
def run_list_slots(ctx: click.Context, request: SlotListRequest) -> ClinkrExit[SlotListResult]:
    slots_ctx = Ensure.ideal_state(load_slots_context(ctx))

    inventory = build_slot_inventory(slots_ctx.git)
    return ClinkrExit.ok(
        SlotListResult(
            pool_size=inventory.pool_size,
            rows=_compose_rows(inventory),
            repo_name=slots_ctx.repo.repo_name,
        )
    )
