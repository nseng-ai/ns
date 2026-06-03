from __future__ import annotations

from typing import Annotated, Literal

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.project_config import AsdlProjectConfigError
from roaster.cli.roaster.review.run import render_review_run
from roaster.context import RoasterCliContext
from roaster.models import (
    GitDiffFailedError,
    GitInvocationFailedError,
    MatchingReviewBatchResult,
    RepoRootUnavailableError,
    ReviewDefinitionReadError,
    ReviewExecutorInvocationError,
)
from roaster.workflow import run_matching_reviews


class ReviewRunMatchingRequest(ClinkrModel):
    harness: Annotated[
        str | None,
        click.Option(
            ["--harness"],
            help="Harness name to dispatch selected reviews through. Falls back to config.",
        ),
    ] = None
    model: Annotated[
        str | None,
        click.Option(
            ["--model"],
            help="Model name to pass to each selected review. Defaults to each review definition.",
        ),
    ] = None
    base_ref: Annotated[
        str | None,
        click.Option(
            ["--base-ref"],
            help="Base branch to diff against. Defaults to the repo trunk branch.",
        ),
    ] = None
    review_format: Annotated[
        Literal["findings", "text"],
        click.Option(
            ["--review-format"],
            type=click.Choice(["findings", "text"]),
            default="text",
            show_default=True,
            help=(
                "Review content format. 'text' returns human-readable markdown. "
                "'findings' returns structured JSON findings."
            ),
        ),
    ] = "text"


def render_review_run_matching(result: MatchingReviewBatchResult) -> None:
    """Render a changed-path-selected batch review run for the human CLI."""
    click.echo(f"Base ref: {result.base_ref}")
    click.echo(f"Changed paths: {len(result.changed_paths)}")
    for path in result.changed_paths:
        click.echo(f"- {path}")

    click.echo(f"Selected reviews: {len(result.selected_reviews)}")
    for review in result.selected_reviews:
        match_details = _format_match_details(review.matched_paths)
        click.echo(f"- {review.key}{match_details}")

    if result.skipped_reviews:
        click.echo(f"Skipped reviews: {len(result.skipped_reviews)}")
        for review in result.skipped_reviews:
            click.echo(f"- {review.key} ({review.reason})")

    if not result.selected_reviews:
        click.echo("No matching reviews.")
        return

    for review_result in result.results:
        click.echo("")
        render_review_run(review_result)


@clinkr_operation(
    name="run-matching",
    help="Run reviewers whose when_changed globs match the current branch diff.",
    human_renderer=render_review_run_matching,
)
def run_review_matching_command(
    ctx: click.Context,
    request: ReviewRunMatchingRequest,
) -> ClinkrExit[MatchingReviewBatchResult]:
    roaster_context = load_typed_context(ctx, RoasterCliContext)
    click.echo("▶ Running matching reviews", err=True)
    try:
        result = run_matching_reviews(
            requested_model=request.model,
            requested_base_ref=request.base_ref,
            requested_harness=request.harness,
            requested_format=request.review_format,
            catalog=roaster_context.catalog,
            diff=roaster_context.diff,
            harness_runtime=roaster_context.harness_runtime,
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


def _format_match_details(matched_paths: tuple[str, ...]) -> str:
    if not matched_paths:
        return " (always)"
    if len(matched_paths) <= 3:
        return f" (matched: {', '.join(matched_paths)})"
    omitted_count = len(matched_paths) - 3
    return f" (matched: {', '.join(matched_paths[:3])}, +{omitted_count} more)"
