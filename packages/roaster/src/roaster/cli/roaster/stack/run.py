from __future__ import annotations

from typing import Annotated

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from roaster.context import RoasterCliContext
from roaster.stack_profile import (
    StackProfile,
    StackProfileInvalidSlug,
    StackProfileMissing,
    StackProfileNotAFile,
    StackProfileReadFailed,
    StackProfileResolutionFailed,
    resolve_stack_profile,
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


class StackRunResult(ClinkrModel):
    profile_slug: str
    profile_path: str
    guidance_char_count: int
    target_branch: str | None
    target_pr: str | None
    reviewers: tuple[str, ...]
    model: str | None
    agent_model: str | None
    harness: str | None
    base_ref: str | None
    dry_run: bool
    new_run: bool
    run_slug: str | None
    triage_prompt: str | None
    resolver_prompt: str | None
    graphite_commands_run: int = 0


def render_stack_run(result: StackRunResult) -> None:
    """Render the stack run skeleton for the human CLI."""
    click.echo("Roaster Graphite stack run")
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
    click.echo(f"Target branch: {_value_or_dash(result.target_branch)}")
    click.echo(f"Target PR: {_value_or_dash(result.target_pr)}")
    click.echo(f"Base ref: {_value_or_dash(result.base_ref)}")
    click.echo(f"Reviewers: {_tuple_or_dash(result.reviewers)}")
    click.echo(f"Model: {_value_or_dash(result.model)}")
    click.echo(f"Agent model: {_value_or_dash(result.agent_model)}")
    click.echo(f"Harness: {_value_or_dash(result.harness)}")
    click.echo(f"Run slug: {_value_or_dash(result.run_slug)}")
    click.echo(f"Triage prompt: {_value_or_dash(result.triage_prompt)}")
    click.echo(f"Resolver prompt: {_value_or_dash(result.resolver_prompt)}")


@clinkr_operation(
    name="run",
    help="Shape a Graphite (`gt`) stack run from a loose roaster profile.",
    human_renderer=render_stack_run,
)
def run_stack_command(
    ctx: click.Context,
    request: StackRunRequest,
) -> ClinkrExit[StackRunResult]:
    roaster_context = load_typed_context(ctx, RoasterCliContext)
    profile = resolve_stack_profile(cwd=roaster_context.cwd, slug=request.profile_slug)
    if not isinstance(profile, StackProfile):
        raise ClinkrFailure(
            error_type=_profile_error_type(profile),
            message=profile.message,
        )

    result = StackRunResult(
        profile_slug=profile.slug,
        profile_path=str(profile.path),
        guidance_char_count=len(profile.guidance),
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
