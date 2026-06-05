from __future__ import annotations

from typing import Annotated

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from roaster.context import RoasterCliContext
from roaster.stack_models import StackWorkflowRequest
from roaster.stack_profile import (
    StackProfile,
    StackProfileInvalidSlug,
    StackProfileMissing,
    StackProfileNotAFile,
    StackProfileReadFailed,
    StackProfileResolutionFailed,
    resolve_stack_profile,
)
from roaster.stack_workflow import (
    StackDryRunResult,
    StackWorkflowFailure,
    run_stack_workflow_dry_run,
)


class StackRunRequest(ClinkrModel):
    profile_slug: str
    target_branch: Annotated[
        str | None,
        click.Option(
            ["--target-branch"],
            help="Target branch for the future Graphite stack run.",
        ),
    ] = None
    target_pr: Annotated[
        str | None,
        click.Option(
            ["--target-pr"],
            help="Target pull request number or URL for the future Graphite stack run.",
        ),
    ] = None
    reviewer: Annotated[
        tuple[str, ...],
        click.Option(
            ["--reviewer"],
            multiple=True,
            help="Reviewer key to include. May be passed more than once.",
        ),
    ] = ()
    model: Annotated[
        str | None,
        click.Option(
            ["--model"],
            help="Default review model for future stack orchestration.",
        ),
    ] = None
    agent_model: Annotated[
        str | None,
        click.Option(
            ["--agent-model"],
            help="Agent model for future triage/resolution orchestration.",
        ),
    ] = None
    harness: Annotated[
        str | None,
        click.Option(
            ["--harness"],
            help="Harness name to use for future agent/reviewer invocations.",
        ),
    ] = None
    base_ref: Annotated[
        str | None,
        click.Option(
            ["--base-ref"],
            help="Base ref for future Graphite stack review planning.",
        ),
    ] = None
    dry_run: Annotated[
        bool,
        click.Option(
            ["--dry-run"],
            is_flag=True,
            default=False,
            help="Preview the shaped stack run without mutation.",
        ),
    ] = False
    new_run: Annotated[
        bool,
        click.Option(
            ["--new-run"],
            is_flag=True,
            default=False,
            help="Request a fresh future run instead of resuming run state.",
        ),
    ] = False
    run_slug: Annotated[
        str | None,
        click.Option(
            ["--run-slug"],
            help="Optional stable run slug for future persisted run state.",
        ),
    ] = None
    triage_prompt: Annotated[
        str | None,
        click.Option(
            ["--triage-prompt"],
            help="Optional future triage prompt override or prompt slug.",
        ),
    ] = None
    resolver_prompt: Annotated[
        str | None,
        click.Option(
            ["--resolver-prompt"],
            help="Optional future resolver prompt override or prompt slug.",
        ),
    ] = None


def render_stack_run(result: StackDryRunResult) -> None:
    """Render deterministic stack dry-run planning for the human CLI."""
    click.echo("Roaster Graphite stack run (dry run)")
    click.echo(f"Profile: {result.profile_slug} ({result.profile_path})")
    click.echo(f"Profile guidance: {result.guidance_char_count} raw markdown characters")
    click.echo(
        "Profile markdown is loose guidance only; roaster did not parse it deterministically."
    )
    click.echo(
        "Graphite/gt orchestration is not implemented in this slice; no gt commands were run."
    )
    click.echo(f"Dry run: {_yes_no(result.dry_run)}")
    click.echo(f"New run: {_yes_no(result.new_run)}")
    click.echo(f"Target branch: {result.target_branch}")
    click.echo(f"Target implementation branch slug: {result.impl_branch_slug}")
    click.echo(f"Target PR: {_value_or_dash(result.target_pr)}")
    click.echo(f"Base ref: {_value_or_dash(result.base_ref)}")
    click.echo(f"Run slug: {result.run_slug}")
    click.echo(f"Resumes existing run: {_yes_no(result.resumes_existing_run)}")
    click.echo(f"Reviewers requested: {_tuple_or_dash(result.reviewers)}")
    click.echo(f"Reviewers run: {result.reviewer_run_count}")
    click.echo(f"Reviewer failures: {result.reviewer_failure_count}")
    click.echo(f"Findings collected: {result.finding_count}")
    click.echo(
        "Triage counts: "
        f"accepted {result.accepted_count}, rejected {result.rejected_count}, "
        f"superseded {result.superseded_count}"
    )
    click.echo(f"Model: {_value_or_dash(result.model)}")
    click.echo(f"Agent model: {_value_or_dash(result.agent_model)}")
    click.echo(f"Harness: {_value_or_dash(result.harness)}")
    click.echo(f"Triage prompt: {_value_or_dash(result.triage_prompt)}")
    click.echo(f"Resolver prompt: {_value_or_dash(result.resolver_prompt)}")
    click.echo(f"Triage summary: {_value_or_dash(result.triage_summary)}")

    click.echo("Planned batches:")
    if not result.batches:
        click.echo("- none")
    for batch in result.batches:
        click.echo(
            f"- {batch.slug}: {batch.title} "
            f"({len(batch.finding_ids)} findings, {batch.confidence}/{batch.risk})"
        )

    click.echo("Planned actions:")
    for action in result.actions:
        suffix = f" [{action.batch_slug}]" if action.batch_slug is not None else ""
        click.echo(f"- {action.action_type}{suffix}: {action.description}")

    click.echo("Locators:")
    for locator in result.locators:
        if locator.kind == "dashboard":
            click.echo(
                f"- dashboard: target PR {_value_or_dash(locator.target_pr)}, "
                f"marker {_value_or_dash(locator.marker)}"
            )
        else:
            click.echo(
                f"- {locator.kind}: Branch Memory `{locator.namespace}` / "
                f"`{locator.key}` on `{locator.branch}`"
            )

    click.echo("Mutations: Branch Memory puts 0, dashboard writes 0, Graphite commands 0")


@clinkr_operation(
    name="run",
    help="Shape a Graphite (`gt`) stack run from a loose roaster profile.",
    human_renderer=render_stack_run,
)
def run_stack_command(
    ctx: click.Context,
    request: StackRunRequest,
) -> ClinkrExit[StackDryRunResult]:
    roaster_context = load_typed_context(ctx, RoasterCliContext)
    profile = resolve_stack_profile(cwd=roaster_context.cwd, slug=request.profile_slug)
    if not isinstance(profile, StackProfile):
        raise ClinkrFailure(
            error_type=_profile_error_type(profile),
            message=profile.message,
        )

    workflow_request = StackWorkflowRequest(
        profile_slug=profile.slug,
        target_branch=request.target_branch,
        target_pr=request.target_pr,
        reviewers=request.reviewer,
        model=request.model,
        agent_model=request.agent_model,
        harness=request.harness,
        base_ref=request.base_ref,
        dry_run=request.dry_run,
        new_run=request.new_run,
        run_slug=request.run_slug,
        triage_prompt=request.triage_prompt,
        resolver_prompt=request.resolver_prompt,
    )
    result = run_stack_workflow_dry_run(
        profile=profile,
        request=workflow_request,
        cwd=roaster_context.cwd,
        catalog=roaster_context.catalog,
        diff=roaster_context.diff,
        harness_runtime=roaster_context.harness_runtime,
        agent_runner=roaster_context.agent_runner,
        branch_memory=roaster_context.branch_memory,
        pr_gateway=roaster_context.pr_gateway,
    )
    if isinstance(result, StackWorkflowFailure):
        raise ClinkrFailure(error_type=result.error_type, message=result.message)
    return ClinkrExit.ok(result)


def _profile_error_type(
    profile: StackProfileInvalidSlug
    | StackProfileMissing
    | StackProfileNotAFile
    | StackProfileResolutionFailed
    | StackProfileReadFailed,
) -> str:
    if isinstance(profile, StackProfileInvalidSlug):
        return "stack_profile_invalid_slug"
    if isinstance(profile, StackProfileMissing):
        return "stack_profile_missing"
    if isinstance(profile, StackProfileNotAFile):
        return "stack_profile_not_a_file"
    if isinstance(profile, StackProfileResolutionFailed):
        return "stack_profile_resolution_failed"
    return "stack_profile_read_failed"


def _value_or_dash(value: str | None) -> str:
    if value is None or not value:
        return "-"
    return value


def _tuple_or_dash(values: tuple[str, ...]) -> str:
    if not values:
        return "-"
    return ", ".join(values)


def _yes_no(value: bool) -> str:
    if value:
        return "yes"
    return "no"
