from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Literal

import click

from twerk_core.clinkr.context import load_typed_context
from twerk_core.clinkr.ensure import Ensure
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.failure import ClinkrFailure
from twerk_core.clinkr.operation import clinkr_operation
from twerk_reviewer.context import ReviewerCliContext
from twerk_reviewer.models import (
    FindingsReview,
    GitDiffFailedError,
    GitInvocationFailedError,
    LocalReviewResult,
    ProseReview,
    RepoRootUnavailableError,
    ReviewDefinitionReadError,
    ReviewExecutorInvocationError,
)
from twerk_reviewer.workflow import run_review_by_key


@dataclass(frozen=True)
class ReviewRunRequest:
    key: str
    harness: Annotated[
        str | None,
        click.Option(
            ["--harness"],
            help="Harness name to dispatch the review through. Falls back to config.",
        ),
    ] = None
    model: Annotated[
        str | None,
        click.Option(
            ["--model"],
            help="Model name to pass to the harness.",
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
                "Review content format. 'text' returns a human-readable markdown review. "
                "'findings' returns structured JSON findings."
            ),
        ),
    ] = "text"


def render_review_run(result: LocalReviewResult) -> None:
    """Render review output for the human CLI."""
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

    match result.payload:
        case ProseReview(prose=prose):
            click.echo("")
            click.echo(prose)
        case FindingsReview(findings=findings):
            if not findings:
                click.echo("No findings.")
                return
            click.echo(f"Findings: {len(findings)}")
            for finding in findings:
                location = finding.path
                if finding.line is not None:
                    location = f"{location}:{finding.line}"
                click.echo(f"- [{finding.severity}] {location} {finding.summary}")
                click.echo(f"  {finding.details}")


@clinkr_operation(
    name="run",
    help="Run a reviewer by key (looks up reviews/<key>.md).",
    human_renderer=render_review_run,
)
def run_review_command(
    ctx: click.Context,
    request: ReviewRunRequest,
) -> ClinkrExit[LocalReviewResult]:
    reviewer_context = load_typed_context(ctx, ReviewerCliContext)
    click.echo(f"▶ Running review '{request.key}'", err=True)
    try:
        result = run_review_by_key(
            key=request.key,
            requested_model=request.model,
            requested_base_ref=request.base_ref,
            requested_harness=request.harness,
            requested_format=request.review_format,
            cwd=reviewer_context.cwd,
            review_definition_gateway=reviewer_context.review_definition,
            local_diff_gateway=reviewer_context.local_diff,
            review_execution_gateway=reviewer_context.review_execution,
            harness_detection_gateway=reviewer_context.harness_detection,
        )
    except ReviewDefinitionReadError as exc:
        raise ClinkrFailure(error_type="review_definition_read_failed", message=str(exc)) from exc
    except ReviewExecutorInvocationError as exc:
        raise ClinkrFailure(
            error_type="review_execution_invocation_failed", message=str(exc)
        ) from exc
    except RepoRootUnavailableError as exc:
        raise ClinkrFailure(error_type="repo_root_unavailable", message=str(exc)) from exc
    except GitInvocationFailedError as exc:
        raise ClinkrFailure(error_type="git_invocation_failed", message=str(exc)) from exc
    except GitDiffFailedError as exc:
        raise ClinkrFailure(error_type="git_diff_failed", message=str(exc)) from exc

    result = Ensure.ideal_state(result)
    return ClinkrExit.ok(result)
