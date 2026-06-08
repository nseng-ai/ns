from __future__ import annotations

from typing import Annotated

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.project_config import AsdlProjectConfigError
from roaster.context import RoasterCliContext
from roaster.models import (
    FindingsReview,
    GitDiffFailedError,
    GitInvocationFailedError,
    LocalReviewResult,
    RepoRootUnavailableError,
    ResolvedReviewRunPlan,
    ReviewDefinitionReadError,
    ReviewExecutorInvocationError,
)
from roaster.workflow import run_review_by_key


def _stderr_run_plan(plan: ResolvedReviewRunPlan) -> None:
    click.echo(
        f"  · resolved model={plan.model} harness={plan.harness} "
        f"base_ref={plan.base_ref} changed_paths={plan.changed_path_count}",
        err=True,
    )


class ReviewRunRequest(ClinkrModel):
    key: str
    model: Annotated[
        str | None,
        click.Option(
            ["--model"],
            help="Model name to pass to Claude Code.",
        ),
    ] = None
    base_ref: Annotated[
        str | None,
        click.Option(
            ["--base-ref"],
            help="Base branch to diff against. Defaults to the repo trunk branch.",
        ),
    ] = None


def render_review_run(result: LocalReviewResult) -> None:
    """Render findings output for the human CLI."""
    click.echo(f"Reviewer: {result.review_name}")
    click.echo(f"Model: {result.model}")
    click.echo(f"Base ref: {result.base_ref}")
    if result.usage is not None:
        usage = result.usage
        click.echo(
            f"Tokens: {usage.total_input_tokens:,} in / {usage.output_tokens:,} out "
            f"(cache read: {usage.cache_read_input_tokens:,}, "
            f"cache create: {usage.cache_creation_input_tokens:,})"
        )
        click.echo(f"Cost: ${usage.total_cost_usd:.4f} USD")
        click.echo(f"Duration: {usage.duration_ms / 1000:.1f}s ({usage.num_turns} turns)")

    payload = result.payload
    if not isinstance(payload, FindingsReview):
        return
    if not payload.findings:
        click.echo("No findings.")
        return
    click.echo(f"Findings: {len(payload.findings)}")
    for finding in payload.findings:
        location = finding.path if finding.line is None else f"{finding.path}:{finding.line}"
        click.echo(f"- [{finding.severity}] {location} {finding.summary}")
        click.echo(f"  {finding.details}")


@clinkr_operation(
    name="run",
    help="Run a CI reviewer by key against the current PR diff (looks up reviews/<key>.md).",
    human_renderer=render_review_run,
)
def run_review_command(
    ctx: click.Context,
    request: ReviewRunRequest,
) -> ClinkrExit[LocalReviewResult]:
    roaster_context = load_typed_context(ctx, RoasterCliContext)
    click.echo(f"▶ Running review '{request.key}'", err=True)
    try:
        result = run_review_by_key(
            key=request.key,
            requested_model=request.model,
            requested_base_ref=request.base_ref,
            catalog=roaster_context.catalog,
            diff=roaster_context.diff,
            harness_runtime=roaster_context.harness_runtime,
            progress=_stderr_run_plan,
        )
    except ReviewDefinitionReadError as exc:
        raise ClinkrFailure(error_type="review_definition_read_failed", message=str(exc)) from exc
    except ReviewExecutorInvocationError as exc:
        raise ClinkrFailure(
            error_type="review_execution_invocation_failed", message=str(exc)
        ) from exc
    except RepoRootUnavailableError as exc:
        raise ClinkrFailure(error_type="repo_root_unavailable", message=str(exc)) from exc
    except AsdlProjectConfigError as exc:
        raise ClinkrFailure(error_type="asdl_config_invalid", message=str(exc)) from exc
    except GitInvocationFailedError as exc:
        raise ClinkrFailure(error_type="git_invocation_failed", message=str(exc)) from exc
    except GitDiffFailedError as exc:
        raise ClinkrFailure(error_type="git_diff_failed", message=str(exc)) from exc

    result = Ensure.ideal_state(result)
    return ClinkrExit.ok(result)
