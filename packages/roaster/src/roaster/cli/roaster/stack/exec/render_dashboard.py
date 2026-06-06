"""Render a skill-first roaster stack dashboard from persisted manifest state."""

from __future__ import annotations

from typing import Annotated

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from roaster.cli.roaster.stack.exec.common import branch_memory_or_fail, load_skill_manifest
from roaster.context import RoasterCliContext
from roaster.stack.common.run_models import StackRunBatchState
from roaster.stack.core.dashboard_pr import stack_dashboard_pr_number, stack_dashboard_pr_url
from roaster.stack.skill.dashboard import (
    StackSkillDashboardBatch,
    StackSkillDashboardCounts,
    StackSkillDashboardState,
    render_stack_skill_dashboard,
)
from roaster.stack.skill.storage import stack_run_artifact_plan


class RenderDashboardRequest(ClinkrModel):
    """CLI options locating a skill-first run manifest."""

    impl_branch: Annotated[
        str,
        click.Option(["--impl-branch"], required=True, help="Implementation branch name."),
    ]
    impl_branch_slug: Annotated[
        str,
        click.Option(["--impl-branch-slug"], required=True, help="Implementation branch slug."),
    ]
    profile_slug: Annotated[
        str,
        click.Option(["--profile-slug"], required=True, help="Roaster stack profile slug."),
    ]
    run_slug: Annotated[
        str,
        click.Option(["--run-slug"], required=True, help="Run slug to render."),
    ]


class RenderDashboardResult(ClinkrModel):
    """Rendered dashboard markdown."""

    markdown: str


def render_dashboard_result(result: RenderDashboardResult) -> None:
    """Print dashboard Markdown for direct posting."""
    click.echo(result.markdown, nl=not result.markdown.endswith("\n"))


@clinkr_operation(
    name="render-dashboard",
    help="Render the skill-first stack dashboard Markdown from the persisted manifest.",
    human_renderer=render_dashboard_result,
)
def render_dashboard_command(
    ctx: click.Context,
    request: RenderDashboardRequest,
) -> ClinkrExit[RenderDashboardResult]:
    context = load_typed_context(ctx, RoasterCliContext)
    branch_memory = branch_memory_or_fail(context)
    manifest = load_skill_manifest(
        branch_memory,
        impl_branch=request.impl_branch,
        impl_branch_slug=request.impl_branch_slug,
        profile_slug=request.profile_slug,
        run_slug=request.run_slug,
    )
    artifact_plan = stack_run_artifact_plan(
        impl_branch=request.impl_branch,
        impl_branch_slug=request.impl_branch_slug,
        profile_slug=request.profile_slug,
        run_slug=request.run_slug,
    )
    state = StackSkillDashboardState(
        profile_slug=request.profile_slug,
        run_slug=request.run_slug,
        implementation_branch=manifest.target_branch or request.impl_branch,
        manifest_locator=artifact_plan.manifest,
        implementation_pr_number=stack_dashboard_pr_number(manifest.target_pr),
        implementation_pr_url=stack_dashboard_pr_url(manifest.target_pr),
        counts=_counts(manifest.batch_states),
        batches=tuple(_dashboard_batch(state) for state in manifest.batch_states),
    )
    return ClinkrExit.ok(RenderDashboardResult(markdown=render_stack_skill_dashboard(state)))


def _dashboard_batch(state: StackRunBatchState) -> StackSkillDashboardBatch:
    return StackSkillDashboardBatch(
        slug=state.batch_slug,
        title=state.title,
        finding_ids=state.finding_ids,
        confidence=state.confidence,
        risk=state.risk,
        summary=state.summary,
        generated_branch=(
            state.generated_branch.branch_name if state.generated_branch is not None else None
        ),
        resolver_status=state.resolver_status,
        validation_status=_validation_status(state),
        validation_summary=state.validation_summary,
    )


def _validation_status(state: StackRunBatchState) -> str | None:
    if state.validation_summary is None:
        return None
    if state.status == "completed":
        return "passed"
    return "failed"


def _counts(states: tuple[StackRunBatchState, ...]) -> StackSkillDashboardCounts:
    failed = sum(1 for state in states if state.status == "failed")
    blocked = sum(1 for state in states if state.status == "blocked")
    submitted = sum(1 for state in states if state.status == "completed")
    return StackSkillDashboardCounts(
        accepted=len(states),
        submitted=submitted,
        failed=failed,
        blocked=blocked,
    )
