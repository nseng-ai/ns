"""Execute planned redirects for the caller worktree."""

from __future__ import annotations

from asdl_slots.checkout_planning import (
    CheckoutCurrentWorktreeBranch,
    CurrentWorktreeRedirect,
    DetachCurrentWorktree,
)
from asdl_slots.context import SlotsCliContext
from asdl_slots.lifecycle.outcomes import SlotLifecycleFailure


def execute_current_worktree_redirect(
    redirect: CurrentWorktreeRedirect,
    *,
    slots_ctx: SlotsCliContext,
) -> SlotLifecycleFailure | None:
    action = redirect.action
    if isinstance(action, CheckoutCurrentWorktreeBranch):
        failure = slots_ctx.git.checkout_branch(slots_ctx.repo.root, action.branch)
        if failure is not None:
            return SlotLifecycleFailure(
                error_type="slot_allocation_error",
                message=(
                    f"Failed to check out {_redirect_failure_subject(action)} in "
                    f"{slots_ctx.repo.root}: {failure.message}"
                ),
            )
        return None
    if isinstance(action, DetachCurrentWorktree):
        slots_ctx.git.detach_head(slots_ctx.repo.root, action.ref)
        return None
    raise AssertionError(f"unknown current worktree redirect action: {action!r}")


def _redirect_failure_subject(action: CheckoutCurrentWorktreeBranch) -> str:
    if action.role == "trunk":
        return f"trunk branch '{action.branch}'"
    return f"'{action.branch}'"
