from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import click

from twerk_core import get_console, make_table
from twerk_core.clinkr.dataclass_json import JsonSerializable
from twerk_core.clinkr.ensure import Ensure
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.operation import clinkr_operation
from twerk_slots.cli.slot.context import load_slots_context
from twerk_slots.inventory import SlotInventory, build_slot_inventory

SlotStatus = Literal["assigned", "available"]


@dataclass(frozen=True)
class SlotListRequest:
    """No inputs — `slot list` always renders the whole pool for the repo."""


@dataclass(frozen=True)
class SlotRow:
    slot_name: str
    branch: str | None
    worktree_path: str
    status: SlotStatus


@dataclass(frozen=True)
class SlotListResult(JsonSerializable):
    pool_size: int
    rows: tuple[SlotRow, ...]
    repo_name: str


def render_slot_list(result: SlotListResult) -> None:
    table = make_table()
    table.add_column("Slot", style="bold cyan", no_wrap=True)
    table.add_column("Status", no_wrap=True)
    table.add_column("Branch", no_wrap=True, overflow="ellipsis", ratio=1)
    table.add_column("Worktree", no_wrap=True, style="dim", overflow="ellipsis", ratio=1)

    for row in result.rows:
        table.add_row(
            row.slot_name,
            row.status,
            row.branch or "",
            row.worktree_path,
        )

    get_console().print(table)


def _compose_rows(inventory: SlotInventory) -> tuple[SlotRow, ...]:
    return tuple(
        SlotRow(
            slot_name=record.slot_name,
            branch=record.branch,
            worktree_path=str(record.path),
            status=record.status,
        )
        for record in inventory.records
    )


@clinkr_operation(
    name="list",
    help="List worktree pool slots.",
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
