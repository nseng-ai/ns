from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from twerk_core.clinkr.dataclass_json import JsonSerializable
from twerk_slots.allocation import (
    DirtyWorktreeError,
    SlotAllocationError,
    SlotFreeOutcome,
    SlotNotAssignedError,
    free_slot_assignment,
)
from twerk_slots.cli.slot.gt.context import SlotGtContext
from twerk_slots.cli.slot.gt.land_plan import LandPlan


@dataclass(frozen=True)
class LandRepairFailure(JsonSerializable):
    target: str
    message: str
    resume_command: str | None


@dataclass(frozen=True)
class LandRepairReport(JsonSerializable):
    events: tuple[str, ...]
    failures: tuple[LandRepairFailure, ...]


def repair_after_merge(
    gt_ctx: SlotGtContext,
    plan: LandPlan,
    *,
    no_restack: bool,
    no_free_slot: bool,
) -> tuple[tuple[str, ...], tuple[LandRepairFailure, ...]]:
    slots_ctx = gt_ctx.slots
    git = slots_ctx.git
    events: list[str] = [f"merged PR #{plan.pr_number} with squash"]
    failures: list[LandRepairFailure] = []

    current_path = Path(plan.current_worktree)
    fetch_failure = git.fetch_remote_branch(current_path, "origin", plan.trunk_branch)
    if fetch_failure is not None:
        failures.append(
            LandRepairFailure(
                target=str(current_path),
                message=fetch_failure.message,
                resume_command=(f"cd {current_path} && git fetch origin {plan.trunk_branch}"),
            )
        )
    elif plan.trunk_worktree is not None:
        trunk_path = Path(plan.trunk_worktree)
        pull_failure = git.pull_fast_forward(trunk_path)
        if pull_failure is None:
            events.append(f"updated local {plan.trunk_branch}")
        else:
            failures.append(
                LandRepairFailure(
                    target=str(trunk_path),
                    message=pull_failure.message,
                    resume_command=f"cd {trunk_path} && git pull --ff-only",
                )
            )
    else:
        update_failure = git.update_local_ref(
            current_path,
            f"refs/heads/{plan.trunk_branch}",
            f"origin/{plan.trunk_branch}",
        )
        if update_failure is None:
            events.append(f"updated local {plan.trunk_branch}")
        else:
            failures.append(
                LandRepairFailure(
                    target=str(current_path),
                    message=update_failure.message,
                    resume_command=(
                        f"cd {current_path} && git update-ref "
                        f"refs/heads/{plan.trunk_branch} origin/{plan.trunk_branch}"
                    ),
                )
            )

    restack_failed = False
    if no_restack:
        events.append("skipped explicit descendant restacks")
    else:
        for descendant in plan.affected_descendants:
            failure = gt_ctx.gt.restack_upstack(
                Path(descendant.worktree_path),
                descendant.branch_name,
            )
            if failure is None:
                events.append(
                    f"restacked {descendant.slot_name or descendant.worktree_path} "
                    f"{descendant.branch_name}"
                )
                continue
            restack_failed = True
            failures.append(
                LandRepairFailure(
                    target=f"{descendant.slot_name or descendant.worktree_path} "
                    f"{descendant.branch_name}",
                    message=failure.message,
                    resume_command=(
                        f"cd {descendant.worktree_path} && "
                        f"gt restack --branch {descendant.branch_name} --upstack"
                    ),
                )
            )

    sync_failure = gt_ctx.gt.sync(
        Path(plan.current_worktree),
        restack=(not no_restack and restack_failed),
    )
    if sync_failure is None:
        events.append("synced Graphite metadata")
    else:
        failures.append(
            LandRepairFailure(
                target="Graphite metadata",
                message=sync_failure.message,
                resume_command=f"cd {plan.current_worktree} && gt sync --no-interactive --force",
            )
        )

    if no_free_slot:
        events.append("left current slot assigned")
    elif plan.current_slot_name is not None:
        try:
            outcome = free_slot_assignment(slots_ctx, slot_name=plan.current_slot_name)
        except SlotAllocationError as exc:
            failures.append(
                LandRepairFailure(
                    target=plan.current_slot_name,
                    message=str(exc),
                    resume_command=(
                        f"cd {plan.current_worktree} && slot free --wt {plan.current_slot_name}"
                    ),
                )
            )
        else:
            match outcome:
                case SlotNotAssignedError():
                    failures.append(
                        LandRepairFailure(
                            target=plan.current_slot_name,
                            message=f"{plan.current_slot_name} is not currently assigned",
                            resume_command=None,
                        )
                    )
                case DirtyWorktreeError(worktree_path=worktree_path):
                    failures.append(
                        LandRepairFailure(
                            target=plan.current_slot_name,
                            message=f"{plan.current_slot_name} is dirty at {worktree_path}",
                            resume_command=f"cd {worktree_path}",
                        )
                    )
                case SlotFreeOutcome(slot_name=slot_name):
                    events.append(f"freed {slot_name}")

    return tuple(events), tuple(failures)


def repair_failure_message(failures: tuple[LandRepairFailure, ...]) -> str:
    lines = ["merge succeeded; repair incomplete", "", "Failed:"]
    lines.extend(f"- {failure.target}: {failure.message}" for failure in failures)
    resume = tuple(failure.resume_command for failure in failures if failure.resume_command)
    if resume:
        lines.extend(["", "Resume:"])
        lines.extend(f"  {command}" for command in resume)
    return "\n".join(lines)
