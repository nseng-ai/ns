from __future__ import annotations

from typing import Annotated, Literal

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
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
    target: Annotated[
        Literal["ci", "local"] | None,
        click.Option(
            ["--target"],
            type=click.Choice(["ci", "local"]),
            help="Filter reviews eligible for the requested target before changed-path matching.",
        ),
    ] = None


def render_review_list_matching(result: MatchingReviewSelectionResult) -> None:
    click.echo(f"Base ref: {result.base_ref}")
    if result.target is not None:
        click.echo(f"Target: {result.target}")
    click.echo(f"Changed paths: {len(result.changed_paths)}")
    for path in result.changed_paths:
        click.echo(f"- {path}")

    click.echo(f"Selected reviews: {len(result.selected_reviews)}")
    for review in result.selected_reviews:
        matched = ", ".join(review.matched_paths) if review.matched_paths else "all changed paths"
        click.echo(f"- {review.key} [{review.scope}] — {matched}")

    if not result.skipped_reviews:
        return
    click.echo(f"Skipped reviews: {len(result.skipped_reviews)}")
    for review in result.skipped_reviews:
        patterns = ", ".join(review.when_changed)
        click.echo(f"- {review.key} [{review.scope}] — {review.skip_reason} ({patterns})")


@clinkr_operation(
    name="list-matching",
    help="List markdown reviewers whose changed-path rules match the current diff.",
    human_renderer=render_review_list_matching,
)
def run_review_list_matching_command(
    ctx: click.Context,
    request: ReviewListMatchingRequest,
) -> ClinkrExit[MatchingReviewSelectionResult]:
    roaster_context = load_typed_context(ctx, RoasterCliContext)

    try:
        result = Ensure.ideal_state(
            list_matching_reviews(
                requested_base_ref=request.base_ref,
                requested_target=request.target,
                catalog=roaster_context.catalog,
                diff=roaster_context.diff,
            )
        )
    except ReviewDefinitionReadError as exc:
        raise ClinkrFailure(error_type="review_definition_read_failed", message=str(exc)) from exc
    except RepoRootUnavailableError as exc:
        raise ClinkrFailure(error_type="repo_root_unavailable", message=str(exc)) from exc
    except GitInvocationFailedError as exc:
        raise ClinkrFailure(error_type="git_invocation_failed", message=str(exc)) from exc
    except GitDiffFailedError as exc:
        raise ClinkrFailure(error_type="git_diff_failed", message=str(exc)) from exc

    return ClinkrExit.ok(result)
