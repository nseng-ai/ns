from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Annotated

import click

from twerk_core.clinkr.dataclass_json import JsonSerializable
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.operation import clinkr_operation
from twerk_core.gh.types import PRCommandError
from twerk_slots.cli.slot.gt.context import SlotGtContext, load_slot_gt_context
from twerk_slots.cli.slot.gt.land_plan import LandPlan, build_land_plan
from twerk_slots.cli.slot.gt.land_repair import (
    LandRepairReport,
    repair_after_merge,
    repair_failure_message,
)
from twerk_slots.cli.slot.gt.navigation import (
    GtNavigationTarget,
    WorktreeTarget,
    build_navigation_result,
    render_gt_navigation,
)
from twerk_slots.repo_context import NoRepoSentinel


@dataclass(frozen=True)
class SlotGtLandRequest:
    up: Annotated[bool, click.Option(["--up"], is_flag=True, default=False)] = False
    down: Annotated[bool, click.Option(["--down"], is_flag=True, default=False)] = False
    dry_run: Annotated[bool, click.Option(["--dry-run"], is_flag=True, default=False)] = False
    no_restack: Annotated[
        bool,
        click.Option(["--no-restack"], is_flag=True, default=False),
    ] = False
    no_free_slot: Annotated[
        bool,
        click.Option(["--no-free-slot"], is_flag=True, default=False),
    ] = False
    admin: Annotated[bool, click.Option(["--admin"], is_flag=True, default=False)] = False
    no_checks: Annotated[
        bool,
        click.Option(["--no-checks"], is_flag=True, default=False),
    ] = False
    auto: Annotated[bool, click.Option(["--auto"], is_flag=True, default=False)] = False


@dataclass(frozen=True)
class SlotGtLandResult(JsonSerializable):
    dry_run: bool
    plan: LandPlan
    events: tuple[str, ...]
    final_navigation: GtNavigationTarget | None


def render_slot_gt_land(result: SlotGtLandResult) -> None:
    for event in result.events:
        click.echo(event)
    if result.final_navigation is not None:
        render_gt_navigation(result.final_navigation)


def _dry_run_events(plan: LandPlan, request: SlotGtLandRequest) -> tuple[str, ...]:
    events = [
        (
            f"[dry-run] would merge PR #{plan.pr_number} from {plan.current_branch} "
            f"into {plan.trunk_branch}"
        ),
        f"[dry-run] verified head commit {plan.pr_head_oid}",
        f"[dry-run] would update local {plan.trunk_branch}",
    ]
    if request.no_restack:
        events.append("[dry-run] would skip explicit descendant restacks")
    elif plan.affected_descendants:
        events.append("[dry-run] would restack:")
        events.extend(
            f"  {desc.slot_name or '<worktree>'} {desc.branch_name}"
            for desc in plan.affected_descendants
        )
    else:
        events.append("[dry-run] no affected descendant worktrees")
    events.append("[dry-run] would sync Graphite metadata")
    if request.no_free_slot:
        events.append("[dry-run] would leave the current slot assigned")
    elif plan.current_slot_name is not None:
        events.append(f"[dry-run] would free {plan.current_slot_name}")
    else:
        events.append("[dry-run] current branch is not assigned to a slot")
    if plan.final_navigation is not None:
        events.append(f"[dry-run] final navigation: {plan.final_navigation.cd_command}")
    return tuple(events)


@clinkr_operation(
    name="land",
    help="Land the current bottom-of-stack Graphite PR and repair local slot state.",
    human_renderer=render_slot_gt_land,
)
def run_gt_land(ctx: click.Context, request: SlotGtLandRequest) -> ClinkrExit[SlotGtLandResult]:
    if request.up and request.down:
        return ClinkrExit.failure(
            error_type="conflicting_navigation",
            message="--up and --down are mutually exclusive.",
        )
    if request.no_checks and request.auto:
        return ClinkrExit.failure(
            error_type="conflicting_options",
            message="--no-checks skips the check guardrail; --auto is meaningless without it.",
        )

    match load_slot_gt_context(ctx):
        case NoRepoSentinel(message=message):
            return ClinkrExit.failure(error_type="not_in_repo", message=message)
        case SlotGtContext() as gt_ctx:
            pass

    match build_land_plan(
        gt_ctx,
        up=request.up,
        down=request.down,
        no_free_slot=request.no_free_slot,
        no_checks=request.no_checks,
        auto=request.auto,
    ):
        case ClinkrExit() as exit_result:
            return exit_result
        case LandPlan() as plan:
            pass

    if request.dry_run:
        return ClinkrExit.ok(
            SlotGtLandResult(
                dry_run=True,
                plan=plan,
                events=_dry_run_events(plan, request),
                final_navigation=None,
            )
        )

    match gt_ctx.slots.pr.merge_pr(
        plan.pr_number,
        match_head_commit=plan.pr_head_oid,
        admin=request.admin,
        auto=request.auto,
    ):
        case PRCommandError(stderr=stderr, returncode=returncode):
            return ClinkrExit.failure(
                error_type="merge_failed",
                message=stderr or f"gh pr merge exited {returncode}",
            )
        case _:
            pass

    events, failures = repair_after_merge(
        gt_ctx,
        plan,
        no_restack=request.no_restack,
        no_free_slot=request.no_free_slot,
    )
    if failures:
        return ClinkrExit.failure(
            error_type="repair_incomplete",
            message=repair_failure_message(failures),
            data=LandRepairReport(events=events, failures=failures),
        )

    final_navigation: GtNavigationTarget | None = None
    if plan.final_navigation is not None:
        target = WorktreeTarget(
            slot_name=plan.final_navigation.slot_name,
            branch_name=plan.final_navigation.branch_name,
            worktree_path=Path(plan.final_navigation.worktree_path),
        )
        final_navigation = build_navigation_result(gt_ctx.slots, target, no_clipboard=False)

    return ClinkrExit.ok(
        SlotGtLandResult(
            dry_run=False,
            plan=plan,
            events=events,
            final_navigation=final_navigation,
        )
    )
