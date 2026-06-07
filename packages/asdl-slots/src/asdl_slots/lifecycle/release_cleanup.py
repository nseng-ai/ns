"""Cleanup planning and execution for released slot targets."""

from __future__ import annotations

from collections.abc import Sequence

from asdl_core.gh.types import PRGatewayFailure, PRLookupMiss
from asdl_slots.context import SlotsCliContext
from asdl_slots.lifecycle.outcomes import (
    FreedSlot,
    SlotFreeCleanupAction,
    SlotFreeCleanupResult,
    SlotFreeCleanupStatus,
)

SLOT_RELEASE_ALL_CLEANUP_ACTIONS: tuple[SlotFreeCleanupAction, ...] = (
    "pr",
    "local_branch",
)


def plan_release_cleanup(
    slots_ctx: SlotsCliContext,
    targets: Sequence[FreedSlot],
    cleanup_actions: Sequence[SlotFreeCleanupAction],
    *,
    trunk_branch: str | None = None,
) -> tuple[SlotFreeCleanupResult, ...]:
    """Plan cleanup entries for release targets without mutating PRs or branches."""
    return _cleanup_for_targets(
        slots_ctx,
        targets,
        cleanup_actions,
        trunk_branch=trunk_branch,
        execute=False,
    )


def execute_release_cleanup(
    slots_ctx: SlotsCliContext,
    targets: Sequence[FreedSlot],
    cleanup_actions: Sequence[SlotFreeCleanupAction],
    *,
    trunk_branch: str | None = None,
) -> tuple[SlotFreeCleanupResult, ...]:
    """Run requested cleanup actions for released slots."""
    return _cleanup_for_targets(
        slots_ctx,
        targets,
        cleanup_actions,
        trunk_branch=trunk_branch,
        execute=True,
    )


def _cleanup_for_targets(
    slots_ctx: SlotsCliContext,
    targets: Sequence[FreedSlot],
    cleanup_actions: Sequence[SlotFreeCleanupAction],
    *,
    trunk_branch: str | None,
    execute: bool,
) -> tuple[SlotFreeCleanupResult, ...]:
    if not targets or not cleanup_actions:
        return ()

    needs_trunk = any(action == "local_branch" for action in cleanup_actions)
    resolved_trunk = trunk_branch
    if needs_trunk and resolved_trunk is None:
        resolved_trunk = slots_ctx.git.get_trunk_branch()

    results: list[SlotFreeCleanupResult] = []
    for target in targets:
        for action in cleanup_actions:
            if action == "pr":
                result = _cleanup_pr(slots_ctx, target, execute=execute)
            elif action == "local_branch":
                assert resolved_trunk is not None
                result = _cleanup_local_branch(
                    slots_ctx,
                    target,
                    trunk_branch=resolved_trunk,
                    execute=execute,
                )
            else:
                raise ValueError(f"unknown cleanup action: {action}")
            results.append(result)
            if result.status == "error":
                return tuple(results)
    return tuple(results)


def _cleanup_pr(
    slots_ctx: SlotsCliContext,
    target: FreedSlot,
    *,
    execute: bool,
) -> SlotFreeCleanupResult:
    pr_result = slots_ctx.pr.get_pr_for_branch(target.branch_name)
    if isinstance(pr_result, PRLookupMiss):
        return _cleanup_result(
            target,
            "pr",
            "skipped",
            message="no matching PR",
        )
    if isinstance(pr_result, PRGatewayFailure):
        return _cleanup_result(
            target,
            "pr",
            "error",
            message=_pr_failure_message(pr_result),
        )

    if pr_result.state in ("CLOSED", "MERGED"):
        return _cleanup_result(
            target,
            "pr",
            "skipped",
            pr_number=pr_result.number,
            message=f"PR is already {pr_result.state.lower()}",
        )

    if not execute:
        return _cleanup_result(target, "pr", "planned", pr_number=pr_result.number)

    close_result = slots_ctx.pr.close_pr(pr_result.number)
    if isinstance(close_result, PRGatewayFailure):
        return _cleanup_result(
            target,
            "pr",
            "error",
            pr_number=pr_result.number,
            message=_pr_failure_message(close_result),
        )
    return _cleanup_result(target, "pr", "success", pr_number=pr_result.number)


def _cleanup_local_branch(
    slots_ctx: SlotsCliContext,
    target: FreedSlot,
    *,
    trunk_branch: str,
    execute: bool,
) -> SlotFreeCleanupResult:
    if target.branch_name == trunk_branch:
        return _cleanup_result(
            target,
            "local_branch",
            "error",
            message=f"refusing to delete trunk branch {trunk_branch}",
        )
    if not execute:
        return _cleanup_result(target, "local_branch", "planned")

    if not slots_ctx.git.branch_exists(target.branch_name):
        return _cleanup_result(target, "local_branch", "skipped", message="already absent")

    failure = slots_ctx.git.delete_local_branch(target.branch_name, force=True)
    if failure is not None:
        if _is_missing_local_branch_failure(failure.message, target.branch_name):
            return _cleanup_result(target, "local_branch", "skipped", message="already absent")
        return _cleanup_result(target, "local_branch", "error", message=failure.message)
    return _cleanup_result(target, "local_branch", "success")


def _is_missing_local_branch_failure(message: str, branch: str) -> bool:
    lowered = message.lower()
    quoted = f"branch '{branch.lower()}' not found"
    return quoted in lowered


def _cleanup_result(
    target: FreedSlot,
    action: SlotFreeCleanupAction,
    status: SlotFreeCleanupStatus,
    *,
    pr_number: int | None = None,
    message: str | None = None,
) -> SlotFreeCleanupResult:
    return SlotFreeCleanupResult(
        slot_name=target.slot_name,
        branch_name=target.branch_name,
        action=action,
        status=status,
        pr_number=pr_number,
        message=message,
    )


def _pr_failure_message(failure: PRGatewayFailure) -> str:
    return failure.stderr or failure.stdout or f"gh exited {failure.returncode}"
