from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated

import click

from asdl_core import get_console
from asdl_core.clinkr.dataclass_json import JsonSerializable
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.operation import clinkr_operation
from asdl_slots.cli.slot.context import load_slots_context
from asdl_slots.inventory import build_slot_inventory
from asdl_slots.lifecycle import MAX_POOL_SIZE, MIN_POOL_SIZE, build_init_plan
from asdl_slots.naming import generate_slot_name
from asdl_slots.repo_context import NoRepoSentinel, ensure_slots_metadata_dir


@dataclass(frozen=True)
class SlotInitRequest:
    size: Annotated[
        int,
        click.Option(
            ["--size"],
            required=True,
            help="Number of slots to create (1..99).",
        ),
    ]


@dataclass(frozen=True)
class SlotInitResult(JsonSerializable):
    pool_size: int
    created: tuple[str, ...]
    worktrees_dir: str


def render_slot_init(result: SlotInitResult) -> None:
    console = get_console()
    console.print(
        f"Initialized pool with [bold cyan]{result.pool_size}[/bold cyan] slot(s) at "
        f"[dim]{result.worktrees_dir}[/dim]"
    )
    for name in result.created:
        console.print(f"  + [bold cyan]{name}[/bold cyan]")


@clinkr_operation(
    name="init",
    help="Initialize the worktree pool with N detached slots at trunk.",
    human_renderer=render_slot_init,
)
def run_init_slots(ctx: click.Context, request: SlotInitRequest) -> ClinkrExit[SlotInitResult]:
    if request.size < MIN_POOL_SIZE or request.size > MAX_POOL_SIZE:
        return ClinkrExit.failure(
            error_type="invalid_size",
            message=f"--size must be between {MIN_POOL_SIZE} and {MAX_POOL_SIZE}.",
        )

    slots_ctx = load_slots_context(ctx)
    if isinstance(slots_ctx, NoRepoSentinel):
        return ClinkrExit.failure(error_type="not_in_repo", message=slots_ctx.message)

    inventory = build_slot_inventory(slots_ctx.git)
    if inventory.pool_size > 0:
        return ClinkrExit.failure(
            error_type="pool_already_initialized",
            message=(
                f"Pool already has {inventory.pool_size} slot(s). "
                f"Use `slot resize --size N` to change capacity."
            ),
        )

    ensure_slots_metadata_dir(slots_ctx.repo, slots_ctx.storage)
    plan = build_init_plan(request.size)
    trunk = slots_ctx.git.get_trunk_branch()
    created: list[str] = []
    for slot_number in plan.create:
        name = generate_slot_name(slot_number)
        path = slots_ctx.repo.worktrees_dir / name
        slots_ctx.git.add_detached_worktree(path, trunk)
        created.append(name)

    return ClinkrExit.ok(
        SlotInitResult(
            pool_size=len(created),
            created=tuple(created),
            worktrees_dir=str(slots_ctx.repo.worktrees_dir),
        )
    )
