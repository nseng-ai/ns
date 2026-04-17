from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Literal

import click

from twerk_core.clinkr.command import ClinkrCommandError
from twerk_core.clinkr.operation import clinkr_operation
from twerk_reviewer.cli.reviewer.context import load_reviewer_context
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
    format: Annotated[
        Literal["findings", "text"],
        click.Option(
            ["--format"],
            type=click.Choice(["findings", "text"]),
            default="findings",
            show_default=True,
            help=(
                "Output format. 'findings' returns structured JSON findings. "
                "'text' returns a human-readable markdown review."
            ),
        ),
    ] = "findings"


def render_review_run(result: LocalReviewResult) -> None:
    """Render review output for the human CLI."""
    click.echo(f"Reviewer: {result.review_name}")
    click.echo(f"Model: {result.model}")
    click.echo(f"Base ref: {result.base_ref}")

    payload = result.payload
    if isinstance(payload, ProseReview):
        click.echo("")
        click.echo(payload.prose)
        return

    assert isinstance(payload, FindingsReview)
    if not payload.findings:
        click.echo("No findings.")
        return

    click.echo(f"Findings: {len(payload.findings)}")
    for finding in payload.findings:
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
) -> LocalReviewResult | ClinkrCommandError:
    reviewer_context = load_reviewer_context(ctx)
    click.echo(f"▶ Running review '{request.key}'", err=True)
    try:
        result = run_review_by_key(
            key=request.key,
            requested_model=request.model,
            requested_base_ref=request.base_ref,
            requested_harness=request.harness,
            requested_format=request.format,
            cwd=reviewer_context.cwd,
            review_definition_gateway=reviewer_context.review_definition,
            local_diff_gateway=reviewer_context.local_diff,
            review_execution_gateway=reviewer_context.review_execution,
            harness_detection_gateway=reviewer_context.harness_detection,
        )
    except ReviewDefinitionReadError as exc:
        return ClinkrCommandError(error_type="review_definition_read_failed", message=str(exc))
    except ReviewExecutorInvocationError as exc:
        return ClinkrCommandError(error_type="review_execution_invocation_failed", message=str(exc))
    except RepoRootUnavailableError as exc:
        return ClinkrCommandError(error_type="repo_root_unavailable", message=str(exc))
    except GitInvocationFailedError as exc:
        return ClinkrCommandError(error_type="git_invocation_failed", message=str(exc))
    except GitDiffFailedError as exc:
        return ClinkrCommandError(error_type="git_diff_failed", message=str(exc))

    if isinstance(result, LocalReviewResult):
        return result
    return ClinkrCommandError(error_type=result.error_type, message=result.message)
