"""Pool initialization and resizing for slot lifecycle."""

from __future__ import annotations

from dataclasses import dataclass

from asdl_slots.context import SlotsCliContext
from asdl_slots.inventory import SlotInventory, SlotRecord, build_slot_inventory
from asdl_slots.lifecycle.operation_state import slot_operation_in_progress_message
from asdl_slots.lifecycle.outcomes import (
    SlotInitOutcome,
    SlotLifecycleFailure,
    SlotResizeOutcome,
)
from asdl_slots.naming import generate_slot_name
from asdl_slots.repo_context import ensure_slots_metadata_dir

MIN_POOL_SIZE = 1
MAX_POOL_SIZE = 99


@dataclass(frozen=True)
class InitPlan:
    create: tuple[int, ...]


@dataclass(frozen=True)
class ResizePlan:
    create: tuple[int, ...]
    remove: tuple[SlotRecord, ...]


def _invalid_size_failure() -> SlotLifecycleFailure:
    return SlotLifecycleFailure(
        error_type="invalid_size",
        message=f"--size must be between {MIN_POOL_SIZE} and {MAX_POOL_SIZE}.",
    )


def build_init_plan(target_size: int) -> InitPlan:
    return InitPlan(create=tuple(range(1, target_size + 1)))


def build_resize_plan(inventory: SlotInventory, target_size: int) -> ResizePlan:
    if target_size == inventory.pool_size:
        return ResizePlan(create=(), remove=())
    if target_size > inventory.pool_size:
        existing = {record.slot_number for record in inventory.records}
        needed = target_size - inventory.pool_size
        create: list[int] = []
        candidate = 1
        while len(create) < needed:
            if candidate not in existing:
                create.append(candidate)
            candidate += 1
        return ResizePlan(create=tuple(create), remove=())
    sorted_records = sorted(inventory.records, key=lambda r: r.slot_number)
    return ResizePlan(create=(), remove=tuple(sorted_records[target_size:]))


def initialize_pool(
    slots_ctx: SlotsCliContext, target_size: int
) -> SlotInitOutcome | SlotLifecycleFailure:
    if target_size < MIN_POOL_SIZE or target_size > MAX_POOL_SIZE:
        return _invalid_size_failure()

    inventory = build_slot_inventory(
        slots_ctx.git,
        main_repo_root=slots_ctx.repo.main_repo_root,
    )
    if inventory.pool_size > 0:
        return SlotLifecycleFailure(
            error_type="pool_already_initialized",
            message=(
                f"Pool already has {inventory.pool_size} slot(s). "
                f"Use `slot resize --size N` to change capacity."
            ),
        )

    ensure_slots_metadata_dir(slots_ctx.repo, slots_ctx.storage)
    plan = build_init_plan(target_size)
    trunk = slots_ctx.git.get_trunk_branch()
    created: list[str] = []
    for slot_number in plan.create:
        name = generate_slot_name(slot_number)
        path = slots_ctx.repo.worktrees_dir / name
        slots_ctx.git.add_detached_worktree(path, trunk)
        created.append(name)

    return SlotInitOutcome(
        created=tuple(created),
        pool_size=len(created),
        worktrees_dir=slots_ctx.repo.worktrees_dir,
    )


def resize_pool(
    slots_ctx: SlotsCliContext, target_size: int
) -> SlotResizeOutcome | SlotLifecycleFailure:
    if target_size < MIN_POOL_SIZE or target_size > MAX_POOL_SIZE:
        return _invalid_size_failure()

    inventory = build_slot_inventory(
        slots_ctx.git,
        main_repo_root=slots_ctx.repo.main_repo_root,
    )
    previous_pool_size = inventory.pool_size
    plan = build_resize_plan(inventory, target_size)

    if not plan.create and not plan.remove:
        return SlotResizeOutcome(
            previous_pool_size=previous_pool_size,
            pool_size=previous_pool_size,
            created=(),
            removed=(),
            worktrees_dir=slots_ctx.repo.worktrees_dir,
        )

    if plan.remove:
        errors = _validate_removals(slots_ctx, plan.remove)
        if errors:
            return SlotLifecycleFailure(
                error_type="resize_unsafe",
                message="\n".join(errors),
            )

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

    return SlotResizeOutcome(
        previous_pool_size=previous_pool_size,
        pool_size=previous_pool_size + len(created) - len(removed),
        created=tuple(created),
        removed=tuple(removed),
        worktrees_dir=slots_ctx.repo.worktrees_dir,
    )


def _validate_removals(
    slots_ctx: SlotsCliContext, to_remove: tuple[SlotRecord, ...]
) -> tuple[str, ...]:
    errors: list[str] = []
    for record in to_remove:
        if record.operation is not None:
            errors.append(
                slot_operation_in_progress_message(
                    slot_name=record.slot_name,
                    branch_name=record.branch,
                    worktree_path=record.path,
                    operation=record.operation,
                    action="shrinking the pool",
                )
            )
            continue
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
