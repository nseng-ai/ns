"""Lifecycle coordination for slot operations."""

from __future__ import annotations

import dataclasses
import subprocess
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from asdl_core.gh.types import PRLookupError, PRState, PRSummary
from asdl_slots.checkout_planning import (
    AssignToSlot,
    BranchInMainWorktree,
    CurrentCheckoutPlan,
    PoolFull,
    ReuseAssignment,
    plan_checkout,
    plan_current_checkout,
)
from asdl_slots.context import SlotsCliContext
from asdl_slots.errors import (
    DetachedHeadError,
    DirtyCurrentWorktreeError,
    SlotAllocationError,
)
from asdl_slots.inventory import SlotInventory, SlotRecord, build_slot_inventory
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


@dataclass(frozen=True)
class SlotCheckoutOutcome:
    slot_name: str
    branch_name: str
    worktree_path: Path
    already_assigned: bool
    created_branch: bool
    current_wt_note: str | None


@dataclass(frozen=True)
class SlotLifecycleFailure:
    error_type: str
    message: str


@dataclass(frozen=True)
class SlotInitOutcome:
    created: tuple[str, ...]
    pool_size: int
    worktrees_dir: Path


@dataclass(frozen=True)
class SlotResizeOutcome:
    previous_pool_size: int
    pool_size: int
    created: tuple[str, ...]
    removed: tuple[str, ...]
    worktrees_dir: Path


@dataclass(frozen=True)
class FreedSlot:
    slot_name: str
    branch_name: str
    worktree_path: Path


@dataclass(frozen=True)
class SlotFreeOutcome:
    freed: tuple[FreedSlot, ...]


SlotGcAction = Literal[
    "freed",
    "would_free",
    "kept_open_pr",
    "kept_no_pr",
    "skipped_dirty",
    "error",
]


@dataclass(frozen=True)
class SlotGcEntry:
    """Per-slot outcome of a slot GC sweep."""

    slot_name: str
    branch_name: str
    worktree_path: Path
    action: SlotGcAction
    pr_number: int | None
    pr_state: PRState | None
    pr_url: str | None
    message: str | None


@dataclass(frozen=True)
class SlotGcPlan:
    """Pre-execution classification for assigned slots."""

    entries: tuple[SlotGcEntry, ...]
    would_free_count: int


@dataclass(frozen=True)
class SlotGcOutcome:
    """Aggregate outcome of a slot GC sweep."""

    entries: tuple[SlotGcEntry, ...]
    freed_count: int
    kept_count: int
    skipped_count: int
    error_count: int
    dry_run: bool


@dataclass(frozen=True)
class _GcCounts:
    freed_count: int
    kept_count: int
    skipped_count: int
    error_count: int


ExecutableCheckoutPlan = ReuseAssignment | BranchInMainWorktree | AssignToSlot


def _invalid_size_failure() -> SlotLifecycleFailure:
    return SlotLifecycleFailure(
        error_type="invalid_size",
        message=f"--size must be between {MIN_POOL_SIZE} and {MAX_POOL_SIZE}.",
    )


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


def free_slots(
    slots_ctx: SlotsCliContext,
    slot_names: Sequence[str],
    *,
    preflight_errors: Sequence[str] = (),
    trunk_branch: str | None = None,
) -> SlotFreeOutcome | SlotLifecycleFailure:
    if not slot_names and not preflight_errors:
        return SlotFreeOutcome(freed=())

    inventory = build_slot_inventory(
        slots_ctx.git,
        main_repo_root=slots_ctx.repo.main_repo_root,
    )

    state_errors = _validate_assigned_and_clean(slots_ctx, inventory, slot_names)
    all_errors = (*preflight_errors, *state_errors)
    if all_errors:
        return SlotLifecycleFailure(
            error_type="invalid_slot_args",
            message="\n".join(all_errors),
        )

    trunk = trunk_branch if trunk_branch is not None else slots_ctx.git.get_trunk_branch()
    freed: list[FreedSlot] = []
    for slot_name in slot_names:
        record = inventory.find_by_slot(slot_name)
        if record is None or record.branch is None:
            return SlotLifecycleFailure(
                error_type="slot_not_assigned",
                message=_partial_failure_message(
                    f"{slot_name} is not currently assigned (state changed during free).",
                    freed,
                ),
            )
        if slots_ctx.git.has_uncommitted_changes(record.path):
            return SlotLifecycleFailure(
                error_type="dirty_worktree",
                message=_partial_failure_message(
                    f"{slot_name} has uncommitted changes at {record.path} "
                    f"(state changed during free).",
                    freed,
                ),
            )
        try:
            slots_ctx.git.detach_head(record.path, trunk)
        except subprocess.CalledProcessError as exc:
            stderr = exc.stderr.strip() if exc.stderr else str(exc)
            return SlotLifecycleFailure(
                error_type="slot_allocation_error",
                message=_partial_failure_message(
                    f"Failed to detach {slot_name} at {record.path} to {trunk}: {stderr}",
                    freed,
                ),
            )
        freed.append(
            FreedSlot(
                slot_name=record.slot_name,
                branch_name=record.branch,
                worktree_path=record.path,
            )
        )

    return SlotFreeOutcome(freed=tuple(freed))


def _gc_pool_empty_failure() -> SlotLifecycleFailure:
    return SlotLifecycleFailure(
        error_type="pool_empty",
        message="No managed slots configured. Run `slot init --size N` first.",
    )


def _entry_from_record(
    record: SlotRecord,
    action: SlotGcAction,
    *,
    pr_result: PRSummary | None = None,
    message: str | None = None,
) -> SlotGcEntry:
    assert record.branch is not None
    return SlotGcEntry(
        slot_name=record.slot_name,
        branch_name=record.branch,
        worktree_path=record.path,
        action=action,
        pr_number=pr_result.number if pr_result is not None else None,
        pr_state=pr_result.state if pr_result is not None else None,
        pr_url=pr_result.url if pr_result is not None else None,
        message=message,
    )


def _with_action(
    entry: SlotGcEntry,
    action: SlotGcAction,
    *,
    message: str | None = None,
) -> SlotGcEntry:
    return dataclasses.replace(entry, action=action, message=message)


def _count_gc_actions(entries: Sequence[SlotGcEntry]) -> _GcCounts:
    freed = 0
    kept = 0
    skipped = 0
    error = 0
    for entry in entries:
        if entry.action in ("freed", "would_free"):
            freed += 1
        elif entry.action in ("kept_open_pr", "kept_no_pr"):
            kept += 1
        elif entry.action == "skipped_dirty":
            skipped += 1
        elif entry.action == "error":
            error += 1
    return _GcCounts(
        freed_count=freed,
        kept_count=kept,
        skipped_count=skipped,
        error_count=error,
    )


def plan_gc(slots_ctx: SlotsCliContext) -> SlotGcPlan | SlotLifecycleFailure:
    """Classify assigned slots for garbage collection without mutating state."""
    inventory = build_slot_inventory(
        slots_ctx.git,
        main_repo_root=slots_ctx.repo.main_repo_root,
    )
    if inventory.pool_size == 0:
        return _gc_pool_empty_failure()

    entries: list[SlotGcEntry] = []
    would_free_count = 0

    for record in inventory.records:
        if record.branch is None:
            continue
        pr_result = slots_ctx.pr.get_pr_for_branch(record.branch)

        if isinstance(pr_result, PRLookupError):
            if pr_result.returncode == 1:
                entries.append(_entry_from_record(record, "kept_no_pr"))
                continue
            entries.append(
                _entry_from_record(
                    record,
                    "error",
                    message=pr_result.stderr or f"gh pr view exited {pr_result.returncode}",
                )
            )
            continue

        if pr_result.state == "OPEN":
            entries.append(_entry_from_record(record, "kept_open_pr", pr_result=pr_result))
            continue

        entries.append(_entry_from_record(record, "would_free", pr_result=pr_result))
        would_free_count += 1

    return SlotGcPlan(entries=tuple(entries), would_free_count=would_free_count)


def execute_gc_plan(slots_ctx: SlotsCliContext, plan: SlotGcPlan) -> SlotGcOutcome:
    """Free every ``would_free`` entry in ``plan``; pass through the rest."""
    inventory = build_slot_inventory(
        slots_ctx.git,
        main_repo_root=slots_ctx.repo.main_repo_root,
    )
    trunk = slots_ctx.git.get_trunk_branch()
    entries: list[SlotGcEntry] = []

    for entry in plan.entries:
        if entry.action != "would_free":
            entries.append(entry)
            continue

        record = inventory.find_by_slot(entry.slot_name)
        if record is None or record.branch is None:
            entries.append(
                _with_action(
                    entry,
                    "error",
                    message=(
                        f"slot {entry.slot_name} was not assigned during free "
                        f"(state changed between plan and execute)."
                    ),
                )
            )
            continue

        if slots_ctx.git.has_uncommitted_changes(record.path):
            entries.append(
                _with_action(
                    entry,
                    "skipped_dirty",
                    message=f"worktree has uncommitted changes at {record.path}",
                )
            )
            continue

        try:
            slots_ctx.git.detach_head(record.path, trunk)
        except subprocess.CalledProcessError as exc:
            stderr = exc.stderr.strip() if exc.stderr else str(exc)
            entries.append(
                _with_action(
                    entry,
                    "error",
                    message=(
                        f"Failed to detach {entry.slot_name} at {record.path} to {trunk}: {stderr}"
                    ),
                )
            )
            continue

        entries.append(_with_action(entry, "freed"))

    counts = _count_gc_actions(entries)
    return SlotGcOutcome(
        entries=tuple(entries),
        freed_count=counts.freed_count,
        kept_count=counts.kept_count,
        skipped_count=counts.skipped_count,
        error_count=counts.error_count,
        dry_run=False,
    )


def outcome_from_gc_plan(plan: SlotGcPlan, *, dry_run: bool) -> SlotGcOutcome:
    """Turn a GC plan into a non-mutating outcome."""
    counts = _count_gc_actions(plan.entries)
    return SlotGcOutcome(
        entries=plan.entries,
        freed_count=counts.freed_count,
        kept_count=counts.kept_count,
        skipped_count=counts.skipped_count,
        error_count=counts.error_count,
        dry_run=dry_run,
    )


def garbage_collect_slots(
    slots_ctx: SlotsCliContext,
    *,
    dry_run: bool,
) -> SlotGcOutcome | SlotLifecycleFailure:
    """Plan the GC sweep and execute it unless ``dry_run`` is true."""
    plan = plan_gc(slots_ctx)
    if isinstance(plan, SlotLifecycleFailure):
        return plan
    if dry_run:
        return outcome_from_gc_plan(plan, dry_run=True)
    return execute_gc_plan(slots_ctx, plan)


def _validate_assigned_and_clean(
    slots_ctx: SlotsCliContext,
    inventory: SlotInventory,
    slot_names: Sequence[str],
) -> tuple[str, ...]:
    errors: list[str] = []
    for slot_name in slot_names:
        record = inventory.find_by_slot(slot_name)
        if record is None or record.branch is None:
            errors.append(
                f"{slot_name} is not currently assigned. Run `slot list` to see the pool."
            )
            continue
        if slots_ctx.git.has_uncommitted_changes(record.path):
            errors.append(
                f"{slot_name} has uncommitted changes at {record.path}. "
                f"Commit or stash before freeing."
            )
    return tuple(errors)


def _partial_failure_message(base: str, freed: list[FreedSlot]) -> str:
    if not freed:
        return base
    already = ", ".join(f.slot_name for f in freed)
    return f"{base} Already freed: {already}."


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


def checkout_branch(
    slots_ctx: SlotsCliContext,
    branch_name: str,
    *,
    new_branch: bool,
    base: str | None,
) -> SlotCheckoutOutcome | SlotLifecycleFailure:
    ensure_slots_metadata_dir(slots_ctx.repo, slots_ctx.storage)

    branch_exists = slots_ctx.git.branch_exists(branch_name)
    created_branch = False
    if new_branch:
        if branch_exists:
            return SlotLifecycleFailure(
                error_type="branch_exists",
                message=(
                    f"Branch '{branch_name}' already exists. "
                    "Drop -b to check out the existing branch."
                ),
            )
        if base is not None and not slots_ctx.git.branch_exists(base):
            return SlotLifecycleFailure(
                error_type="base_missing",
                message=f"Base branch '{base}' does not exist.",
            )
        slots_ctx.git.create_branch(
            branch_name,
            base if base is not None else "HEAD",
            force=False,
        )
        created_branch = True
    elif not branch_exists:
        return SlotLifecycleFailure(
            error_type="branch_missing",
            message=(
                f"Branch '{branch_name}' does not exist. Pass -b/--new to create it from HEAD."
            ),
        )

    inventory = build_slot_inventory(
        slots_ctx.git,
        main_repo_root=slots_ctx.repo.main_repo_root,
    )
    plan = plan_checkout(inventory, slots_ctx.git, branch_name)
    if isinstance(plan, PoolFull):
        return _pool_full_failure(plan)
    return _execute_plan(
        plan,
        slots_ctx=slots_ctx,
        branch_name=branch_name,
        created_branch=created_branch,
        current_wt_note=None,
    )


def checkout_current(slots_ctx: SlotsCliContext) -> SlotCheckoutOutcome | SlotLifecycleFailure:
    ensure_slots_metadata_dir(slots_ctx.repo, slots_ctx.storage)

    try:
        current_plan = plan_current_checkout(
            slots_ctx.git,
            cwd=slots_ctx.repo.root,
            main_repo_root=slots_ctx.repo.main_repo_root,
        )
    except SlotAllocationError as exc:
        return SlotLifecycleFailure(
            error_type="slot_allocation_error",
            message=str(exc),
        )

    if isinstance(current_plan, DetachedHeadError):
        return SlotLifecycleFailure(
            error_type="detached_head",
            message=(
                f"HEAD at {current_plan.cwd} is detached. Check out a branch "
                "before running `slot checkout --current`."
            ),
        )
    if isinstance(current_plan, DirtyCurrentWorktreeError):
        return SlotLifecycleFailure(
            error_type="dirty_worktree",
            message=(
                f"Current worktree at {current_plan.cwd} has uncommitted changes. "
                "Commit or stash before running `slot checkout --current`."
            ),
        )

    assert isinstance(current_plan, CurrentCheckoutPlan)
    if isinstance(current_plan.plan, PoolFull):
        return _pool_full_failure(current_plan.plan)
    return _execute_plan(
        current_plan.plan,
        slots_ctx=slots_ctx,
        branch_name=current_plan.branch_name,
        created_branch=False,
        current_wt_note=current_plan.current_wt_note,
    )


def _pool_full_failure(outcome: PoolFull) -> SlotLifecycleFailure:
    if outcome.assigned:
        details = "\n".join(
            f"  {record.slot_name} -> {record.branch}" for record in outcome.assigned
        )
        message = (
            f"Pool is full. Currently assigned:\n{details}\n"
            "Free a slot before checking out a new branch."
        )
    else:
        message = (
            "Pool is full (no slots available). "
            "Run `slot init` or `slot resize` before checking out a new branch."
        )
    return SlotLifecycleFailure(error_type="pool_full", message=message)


def _execute_plan(
    plan: ExecutableCheckoutPlan,
    *,
    slots_ctx: SlotsCliContext,
    branch_name: str,
    created_branch: bool,
    current_wt_note: str | None,
) -> SlotCheckoutOutcome:
    if isinstance(plan, ReuseAssignment):
        return SlotCheckoutOutcome(
            slot_name=plan.record.slot_name,
            branch_name=branch_name,
            worktree_path=plan.record.path,
            already_assigned=True,
            created_branch=created_branch,
            current_wt_note=current_wt_note,
        )
    if isinstance(plan, BranchInMainWorktree):
        return SlotCheckoutOutcome(
            slot_name="",
            branch_name=branch_name,
            worktree_path=plan.main_path,
            already_assigned=True,
            created_branch=created_branch,
            current_wt_note=current_wt_note,
        )

    slots_ctx.git.checkout_branch(plan.record.path, branch_name)
    return SlotCheckoutOutcome(
        slot_name=plan.record.slot_name,
        branch_name=branch_name,
        worktree_path=plan.record.path,
        already_assigned=False,
        created_branch=created_branch,
        current_wt_note=current_wt_note,
    )
