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
    GitDiffFailedError,
    GitInvocationFailedError,
    MatchingReviewSelectionResult,
    RepoRootUnavailableError,
    ReviewDefinitionReadError,
)
from roaster.workflow import list_matching_reviews


class ReviewListMatchingRequest(ClinkrModel):
    base_ref: Annotated[
        str | None,
        click.Option(
            ["--base-ref"],
            help="Base branch to diff against. Defaults to the repo trunk branch.",
        ),
    ] = None


def render_review_list_matching(result: MatchingReviewSelectionResult) -> None:
    """Render changed-path review selection for the human CLI."""
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

    click.echo("No reviews were run. Run a selected reviewer with: roaster review run <key>")


@clinkr_operation(
    name="list-matching",
    help="List reviewers whose when_changed globs match the current branch diff.",
    human_renderer=render_review_list_matching,
)
def run_review_list_matching_command(
    ctx: click.Context,
    request: ReviewListMatchingRequest,
) -> ClinkrExit[MatchingReviewSelectionResult]:
    roaster_context = load_typed_context(ctx, RoasterCliContext)
    try:
        result = list_matching_reviews(
            requested_base_ref=request.base_ref,
            catalog=roaster_context.catalog,
            diff=roaster_context.diff,
        )
    except ReviewDefinitionReadError as exc:
        raise ClinkrFailure(error_type="review_definition_read_failed", message=str(exc)) from exc
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
