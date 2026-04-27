from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated

import click

from twerk_core.clinkr.dataclass_json import JsonSerializable
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.operation import clinkr_operation
from twerk_core.gh.types import PRCommandError, PRMergeResult
from twerk_slots.cli.slot.gt.context import SlotGtContext, load_slot_gt_context
from twerk_slots.cli.slot.gt.land_plan import LandPlan, build_land_plan
from twerk_slots.repo_context import NoRepoSentinel


@dataclass(frozen=True)
class SlotGtLandRequest:
    dry_run: Annotated[bool, click.Option(["--dry-run"], is_flag=True, default=False)] = False
    admin: Annotated[bool, click.Option(["--admin"], is_flag=True, default=False)] = False
    auto: Annotated[bool, click.Option(["--auto"], is_flag=True, default=False)] = False


@dataclass(frozen=True)
class SlotGtLandResult(JsonSerializable):
    dry_run: bool
    pr_number: int
    current_branch: str
    trunk_branch: str
    head_oid: str
    admin: bool
    auto: bool
    events: tuple[str, ...]
    github_stdout: str
    github_stderr: str


def render_slot_gt_land(result: SlotGtLandResult) -> None:
    for event in result.events:
        click.echo(event)


def _dry_run_events(plan: LandPlan, request: SlotGtLandRequest) -> tuple[str, ...]:
    events = [
        (f"[dry-run] would request squash merge for PR #{plan.pr_number} at {plan.pr_head_oid}"),
        f"[dry-run] branch {plan.current_branch} -> {plan.trunk_branch}",
    ]
    if request.admin:
        events.append("[dry-run] would pass --admin")
    if request.auto:
        events.append("[dry-run] would pass --auto")
    return tuple(events)


def _success_events(result: PRMergeResult) -> tuple[str, ...]:
    events: list[str] = []
    if result.stdout:
        events.append(result.stdout)
    if result.stderr:
        events.append(result.stderr)
    if result.auto:
        events.append(f"auto-merge request completed for PR #{result.number}")
    else:
        events.append(f"merge request completed for PR #{result.number}")
    return tuple(events)


def _result_from_plan(
    *,
    plan: LandPlan,
    request: SlotGtLandRequest,
    events: tuple[str, ...],
    github_stdout: str = "",
    github_stderr: str = "",
) -> SlotGtLandResult:
    return SlotGtLandResult(
        dry_run=request.dry_run,
        pr_number=plan.pr_number,
        current_branch=plan.current_branch,
        trunk_branch=plan.trunk_branch,
        head_oid=plan.pr_head_oid,
        admin=request.admin,
        auto=request.auto,
        events=events,
        github_stdout=github_stdout,
        github_stderr=github_stderr,
    )


@clinkr_operation(
    name="land",
    help="Request a guarded squash merge for the current bottom-of-stack Graphite PR.",
    human_renderer=render_slot_gt_land,
)
def run_gt_land(ctx: click.Context, request: SlotGtLandRequest) -> ClinkrExit[SlotGtLandResult]:
    match load_slot_gt_context(ctx):
        case NoRepoSentinel(message=message):
            return ClinkrExit.failure(error_type="not_in_repo", message=message)
        case SlotGtContext() as gt_ctx:
            pass

    match build_land_plan(gt_ctx):
        case ClinkrExit() as exit_result:
            return exit_result
        case LandPlan() as plan:
            pass

    if request.dry_run:
        return ClinkrExit.ok(
            _result_from_plan(
                plan=plan,
                request=request,
                events=_dry_run_events(plan, request),
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
        case PRMergeResult() as merge_result:
            pass

    return ClinkrExit.ok(
        _result_from_plan(
            plan=plan,
            request=request,
            events=_success_events(merge_result),
            github_stdout=merge_result.stdout,
            github_stderr=merge_result.stderr,
        )
    )
