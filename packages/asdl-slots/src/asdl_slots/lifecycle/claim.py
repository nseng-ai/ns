"""Claim a local branch into the current managed slot."""

from __future__ import annotations

import subprocess
from dataclasses import dataclass
from pathlib import Path

from asdl_core.git.types import DetachedHead, GitCommandFailure, WorktreeOccupancy
from asdl_slots.checkout_planning import CurrentWorktreeRedirect, plan_current_wt_redirect
from asdl_slots.context import SlotsCliContext
from asdl_slots.inventory import (
    MainWorktreeMatch,
    SlotInventory,
    SlotMatch,
    SlotRecord,
    build_slot_inventory,
)
from asdl_slots.lifecycle.current_worktree_redirect import execute_current_worktree_redirect
from asdl_slots.lifecycle.operation_state import operation_recovery_instruction
from asdl_slots.lifecycle.outcomes import SlotClaimOutcome, SlotLifecycleFailure
from asdl_slots.lifecycle.pool_full import assigned_slot_records, pool_full_failure
from asdl_slots.repo_context import ensure_slots_metadata_dir


@dataclass(frozen=True)
class ClaimPlan:
    current: SlotRecord
    branch_name: str
    source: SlotRecord | None
    already_current: bool
    caller_redirect: CurrentWorktreeRedirect | None = None


def claim_branch(
    slots_ctx: SlotsCliContext,
    branch_name: str,
) -> SlotClaimOutcome | SlotLifecycleFailure:
    """Move ``branch_name`` into the current managed slot worktree."""
    ensure_slots_metadata_dir(slots_ctx.repo, slots_ctx.storage)

    if not slots_ctx.git.branch_exists(branch_name):
        return SlotLifecycleFailure(
            error_type="branch_missing",
            message=f"Branch '{branch_name}' does not exist locally.",
        )

    plan = plan_claim(slots_ctx, branch_name)
    if isinstance(plan, SlotLifecycleFailure):
        return plan
    if plan.already_current:
        return _outcome_from_plan(plan)

    trunk_branch = slots_ctx.git.get_trunk_branch()
    if plan.source is not None:
        source_failure = _detach_source_slot(slots_ctx, plan.source, branch_name, trunk_branch)
        if source_failure is not None:
            return source_failure
    if plan.caller_redirect is not None:
        redirect_failure = execute_current_worktree_redirect(
            plan.caller_redirect,
            slots_ctx=slots_ctx,
        )
        if redirect_failure is not None:
            return redirect_failure

    checkout_failure = slots_ctx.git.checkout_branch(plan.current.path, branch_name)
    if checkout_failure is not None:
        return SlotLifecycleFailure(
            error_type="checkout_failed",
            message=(
                f"Failed to check out '{branch_name}' into {plan.current.slot_name}: "
                f"{checkout_failure.message}"
            ),
        )

    return _outcome_from_plan(plan)


def plan_claim(
    slots_ctx: SlotsCliContext,
    branch_name: str,
) -> ClaimPlan | SlotLifecycleFailure:
    """Validate a branch claim without mutating worktrees."""
    inventory = build_slot_inventory(
        slots_ctx.git,
        main_repo_root=slots_ctx.repo.main_repo_root,
    )
    if inventory.pool_size == 0:
        return SlotLifecycleFailure(
            error_type="pool_empty",
            message="No managed slots configured. Run `slot init --size N` first.",
        )

    current = _current_slot_record(inventory.records, slots_ctx.repo.root)
    if current is None:
        return _plan_claim_from_main_worktree(slots_ctx, inventory, branch_name)

    if current.operation is not None:
        return SlotLifecycleFailure(
            error_type="operation_in_progress",
            message=slot_operation_message(current, action="claiming into"),
        )

    match = inventory.find_by_branch(branch_name)
    if isinstance(match, SlotMatch):
        if match.record.path == current.path:
            return ClaimPlan(
                current=current,
                branch_name=branch_name,
                source=None,
                already_current=True,
            )
        source_failure = _source_slot_failure(slots_ctx, match.record)
        if source_failure is not None:
            return source_failure
        current_failure = _current_slot_dirty_failure(slots_ctx, current)
        if current_failure is not None:
            return current_failure
        return ClaimPlan(
            current=current,
            branch_name=branch_name,
            source=match.record,
            already_current=False,
        )

    if isinstance(match, MainWorktreeMatch):
        return SlotLifecycleFailure(
            error_type="branch_in_main_worktree",
            message=(
                f"Branch '{branch_name}' is checked out in the main worktree at "
                f"{match.worktree.path}; `slot claim` only moves branches from other slots."
            ),
        )

    occupancy = inventory.find_occupancy_by_branch(branch_name)
    if occupancy is not None:
        return SlotLifecycleFailure(
            error_type="branch_in_use",
            message=_branch_occupancy_message(occupancy),
        )

    current_failure = _current_slot_dirty_failure(slots_ctx, current)
    if current_failure is not None:
        return current_failure
    return ClaimPlan(
        current=current,
        branch_name=branch_name,
        source=None,
        already_current=False,
    )


def _current_slot_record(records: tuple[SlotRecord, ...], root: Path) -> SlotRecord | None:
    for record in records:
        if record.path == root:
            return record
    return None


def _plan_claim_from_main_worktree(
    slots_ctx: SlotsCliContext,
    inventory: SlotInventory,
    branch_name: str,
) -> ClaimPlan | SlotLifecycleFailure:
    if slots_ctx.repo.root != slots_ctx.repo.main_repo_root:
        return _not_current_slot_failure(slots_ctx)

    match = inventory.find_by_branch(branch_name)
    if isinstance(match, SlotMatch):
        if match.record.operation is not None:
            return SlotLifecycleFailure(
                error_type="branch_in_use",
                message=slot_operation_message(match.record, action="claiming"),
            )
        return ClaimPlan(
            current=match.record,
            branch_name=branch_name,
            source=None,
            already_current=True,
        )

    if isinstance(match, MainWorktreeMatch):
        if match.worktree.path != slots_ctx.repo.root:
            return SlotLifecycleFailure(
                error_type="branch_in_main_worktree",
                message=(
                    f"Branch '{branch_name}' is checked out in the main worktree at "
                    f"{match.worktree.path}. Run `slot claim` from that worktree to move it "
                    "into a slot."
                ),
            )

        current_branch = slots_ctx.git.get_current_branch(slots_ctx.repo.root)
        if isinstance(current_branch, GitCommandFailure):
            return SlotLifecycleFailure(
                error_type="current_branch_failed",
                message=(
                    f"Failed to determine current branch at {slots_ctx.repo.root}: "
                    f"{current_branch.message}"
                ),
            )
        if isinstance(current_branch, DetachedHead) or current_branch != branch_name:
            return _not_current_slot_failure(slots_ctx)
        if branch_name == slots_ctx.git.get_trunk_branch():
            return SlotLifecycleFailure(
                error_type="trunk_in_main_worktree",
                message=(
                    f"Branch '{branch_name}' is the trunk branch and is checked out in the "
                    f"main worktree at {slots_ctx.repo.root}. Refusing to move trunk out of "
                    "the main worktree; check out a different branch first or claim a branch "
                    "that is not currently checked out there."
                ),
            )

        target = inventory.lowest_available(slots_ctx.git)
        if target is None:
            return pool_full_failure(assigned_slot_records(inventory), action="claiming a branch")
        if slots_ctx.git.has_uncommitted_changes(slots_ctx.repo.root):
            return SlotLifecycleFailure(
                error_type="dirty_current_worktree",
                message=(
                    f"Current worktree at {slots_ctx.repo.root} has uncommitted changes. "
                    "Commit or stash before claiming its branch into a slot."
                ),
            )

        return ClaimPlan(
            current=target,
            branch_name=branch_name,
            source=None,
            already_current=False,
            caller_redirect=plan_current_wt_redirect(
                slots_ctx.git,
                cwd=slots_ctx.repo.root,
                moving_branch=branch_name,
            ),
        )

    occupancy = inventory.find_occupancy_by_branch(branch_name)
    if occupancy is not None:
        return SlotLifecycleFailure(
            error_type="branch_in_use",
            message=_branch_occupancy_message(occupancy),
        )

    target = inventory.lowest_available(slots_ctx.git)
    if target is None:
        return pool_full_failure(assigned_slot_records(inventory), action="claiming a branch")
    return ClaimPlan(
        current=target,
        branch_name=branch_name,
        source=None,
        already_current=False,
    )


def _not_current_slot_failure(slots_ctx: SlotsCliContext) -> SlotLifecycleFailure:
    return SlotLifecycleFailure(
        error_type="not_current_slot",
        message=(
            "`slot claim` must be run from a managed slot worktree, or from the main "
            "worktree to move or claim a branch into the lowest available slot "
            f"(current worktree: {slots_ctx.repo.root})."
        ),
    )


def _current_slot_dirty_failure(
    slots_ctx: SlotsCliContext,
    current: SlotRecord,
) -> SlotLifecycleFailure | None:
    if not slots_ctx.git.has_uncommitted_changes(current.path):
        return None
    return SlotLifecycleFailure(
        error_type="dirty_current_slot",
        message=(
            f"Current slot {current.slot_name} has uncommitted changes at {current.path}. "
            "Commit or stash before claiming a branch."
        ),
    )


def _source_slot_failure(
    slots_ctx: SlotsCliContext,
    source: SlotRecord,
) -> SlotLifecycleFailure | None:
    if source.operation is not None:
        return SlotLifecycleFailure(
            error_type="branch_in_use",
            message=slot_operation_message(source, action="claiming"),
        )
    if slots_ctx.git.has_uncommitted_changes(source.path):
        return SlotLifecycleFailure(
            error_type="dirty_source_slot",
            message=(
                f"Source slot {source.slot_name} has uncommitted changes at {source.path}. "
                "Commit or stash there before claiming its branch."
            ),
        )
    return None


def _detach_source_slot(
    slots_ctx: SlotsCliContext,
    source: SlotRecord,
    branch_name: str,
    trunk_branch: str,
) -> SlotLifecycleFailure | None:
    try:
        slots_ctx.git.detach_head(source.path, trunk_branch)
    except subprocess.CalledProcessError as exc:
        stderr = exc.stderr.strip() if exc.stderr else str(exc)
        return SlotLifecycleFailure(
            error_type="source_detach_failed",
            message=(
                f"Failed to detach source slot {source.slot_name} at {source.path} "
                f"from '{branch_name}' to {trunk_branch}: {stderr}"
            ),
        )
    return None


def _outcome_from_plan(plan: ClaimPlan) -> SlotClaimOutcome:
    replaced_branch_name = plan.current.branch
    if replaced_branch_name == plan.branch_name:
        replaced_branch_name = None
    return SlotClaimOutcome(
        slot_name=plan.current.slot_name,
        branch_name=plan.branch_name,
        worktree_path=plan.current.path,
        replaced_branch_name=replaced_branch_name,
        source_slot_name=plan.source.slot_name if plan.source is not None else None,
        source_worktree_path=plan.source.path if plan.source is not None else None,
        already_current=plan.already_current,
    )


def slot_operation_message(record: SlotRecord, *, action: str) -> str:
    assert record.branch is not None
    assert record.operation is not None
    return (
        f"{record.slot_name} holds '{record.branch}' with a {record.operation} in progress at "
        f"{record.path}; cannot continue {action}. "
        f"{_recovery_sentence(record.operation)}"
    )


def _branch_occupancy_message(occupancy: WorktreeOccupancy) -> str:
    if occupancy.operation is None or occupancy.operation == "checked-out":
        return f"Branch '{occupancy.branch}' is already checked out at {occupancy.path}."
    return (
        f"Branch '{occupancy.branch}' has a {occupancy.operation} in progress at "
        f"{occupancy.path}. {_recovery_sentence(occupancy.operation)}"
    )


def _recovery_sentence(operation: str) -> str:
    recovery_instruction = operation_recovery_instruction(operation)
    return f"{recovery_instruction[0].upper()}{recovery_instruction[1:]}, then retry."
