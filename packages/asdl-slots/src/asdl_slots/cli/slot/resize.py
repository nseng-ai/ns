from __future__ import annotations

from typing import Annotated

import click

from asdl_core import get_console
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_slots.cli.slot.context import load_slots_context
from asdl_slots.context import SlotsCliContext
from asdl_slots.inventory import SlotRecord, build_slot_inventory
from asdl_slots.lifecycle import MAX_POOL_SIZE, MIN_POOL_SIZE, build_resize_plan
from asdl_slots.naming import generate_slot_name
from asdl_slots.repo_context import NoRepoSentinel, ensure_slots_metadata_dir


class SlotResizeRequest(ClinkrModel):
    size: Annotated[
        int,
        click.Option(
            ["--size"],
            required=True,
            help="Target pool size (1..99).",
        ),
    ]


class SlotResizeResult(ClinkrModel):
    previous_pool_size: int
    pool_size: int
    created: tuple[str, ...]
    removed: tuple[str, ...]
    worktrees_dir: str


def render_slot_resize(result: SlotResizeResult) -> None:
    console = get_console()
    if not result.created and not result.removed:
        console.print(
            f"Pool already at size [bold cyan]{result.pool_size}[/bold cyan]; no changes."
        )
        return
    console.print(
        f"Resized pool [dim]{result.previous_pool_size}[/dim] -> "
        f"[bold cyan]{result.pool_size}[/bold cyan] at [dim]{result.worktrees_dir}[/dim]"
    )
    for name in result.created:
        console.print(f"  + [bold cyan]{name}[/bold cyan]")
    for name in result.removed:
        console.print(f"  - [bold cyan]{name}[/bold cyan]")


def _validate_removals(
    slots_ctx: SlotsCliContext, to_remove: tuple[SlotRecord, ...]
) -> tuple[str, ...]:
    errors: list[str] = []
    for record in to_remove:
        if record.branch is not None:
            errors.append(
                f"{record.slot_name} is assigned to '{record.branch}'; "
                f"free it before shrinking the pool."
            )
            continue
        if slots_ctx.git.has_uncommitted_changes(record.path):
            errors.append(
                f"{record.slot_name} at {record.path} has uncommitted changes; "
                f"commit or discard before shrinking the pool."
            )
    return tuple(errors)


@clinkr_operation(
    name="resize",
    help=(
        "Grow or shrink the worktree pool to --size slots (shrink refuses assigned or dirty slots)."
    ),
    human_renderer=render_slot_resize,
)
def run_resize_slots(
    ctx: click.Context, request: SlotResizeRequest
) -> ClinkrExit[SlotResizeResult]:
    if request.size < MIN_POOL_SIZE or request.size > MAX_POOL_SIZE:
        return ClinkrExit.failure(
            error_type="invalid_size",
            message=f"--size must be between {MIN_POOL_SIZE} and {MAX_POOL_SIZE}.",
        )

    slots_ctx = load_slots_context(ctx)
    if isinstance(slots_ctx, NoRepoSentinel):
        return ClinkrExit.failure(error_type="not_in_repo", message=slots_ctx.message)

    inventory = build_slot_inventory(slots_ctx.git)
    plan = build_resize_plan(inventory, request.size)
    previous_pool_size = inventory.pool_size

    if not plan.create and not plan.remove:
        return ClinkrExit.ok(
            SlotResizeResult(
                previous_pool_size=previous_pool_size,
                pool_size=previous_pool_size,
                created=(),
                removed=(),
                worktrees_dir=str(slots_ctx.repo.worktrees_dir),
            )
        )

    if plan.remove:
        errors = _validate_removals(slots_ctx, plan.remove)
        if errors:
            return ClinkrExit.failure(error_type="resize_unsafe", message="\n".join(errors))

    ensure_slots_metadata_dir(slots_ctx.repo, slots_ctx.storage)
    trunk = slots_ctx.git.get_trunk_branch()

    created: list[str] = []
    for slot_number in plan.create:
        name = generate_slot_name(slot_number)
        path = slots_ctx.repo.worktrees_dir / name
        slots_ctx.git.add_detached_worktree(path, trunk)
        created.append(name)

    removed: list[str] = []
    for record in plan.remove:
        slots_ctx.git.remove_worktree(record.path)
        removed.append(record.slot_name)

    return ClinkrExit.ok(
        SlotResizeResult(
            previous_pool_size=previous_pool_size,
            pool_size=previous_pool_size + len(created) - len(removed),
            created=tuple(created),
            removed=tuple(removed),
            worktrees_dir=str(slots_ctx.repo.worktrees_dir),
        )
    )
