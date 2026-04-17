from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated

import click

from twerk_core.clinkr.command import ClinkrCommandError
from twerk_core.clinkr.operation import clinkr_operation
from twerk_reviewer.cli.reviewer.context import load_reviewer_context
from twerk_reviewer.models import (
    GitDiffFailedError,
    LocalReviewResult,
    RepoRootUnavailableError,
    ReviewDefinitionReadError,
    ReviewExecutorInvocationError,
)
from twerk_reviewer.workflow import run_local_review


@dataclass(frozen=True)
class ReviewLocalRequest:
    review_path: str
    model: Annotated[
        str | None,
        click.Option(
            ["--model"],
            help="Model name to pass to the review executor.",
        ),
    ] = None
    base_ref: Annotated[
        str | None,
        click.Option(
            ["--base-ref"],
            help="Base branch to diff against. Defaults to the repo trunk branch.",
        ),
    ] = None


def render_review_local(result: LocalReviewResult) -> None:
    """Render local-review findings for the human CLI."""
    click.echo(f"Reviewer: {result.review_name}")
    click.echo(f"Model: {result.model}")
    click.echo(f"Base ref: {result.base_ref}")

    if not result.findings:
        click.echo("No findings.")
        return

    click.echo(f"Findings: {len(result.findings)}")
    for finding in result.findings:
        location = finding.path
        if finding.line is not None:
            location = f"{location}:{finding.line}"
        click.echo(f"- [{finding.severity}] {location} {finding.summary}")
        click.echo(f"  {finding.details}")


@clinkr_operation(
    name="review-local",
    help="Run a markdown-defined reviewer against the current branch diff.",
    human_renderer=render_review_local,
)
def run_review_local_command(
    ctx: click.Context,
    request: ReviewLocalRequest,
) -> LocalReviewResult | ClinkrCommandError:
    reviewer_context = load_reviewer_context(ctx)
    try:
        result = run_local_review(
            review_path=request.review_path,
            requested_model=request.model,
            requested_base_ref=request.base_ref,
            review_definition_gateway=reviewer_context.review_definition,
            local_diff_gateway=reviewer_context.local_diff,
            review_execution_gateway=reviewer_context.review_execution,
        )
    except ReviewDefinitionReadError as exc:
        return ClinkrCommandError(error_type="review_definition_read_failed", message=str(exc))
    except ReviewExecutorInvocationError as exc:
        return ClinkrCommandError(error_type="review_execution_invocation_failed", message=str(exc))
    except RepoRootUnavailableError as exc:
        return ClinkrCommandError(error_type="repo_root_unavailable", message=str(exc))
    except GitDiffFailedError as exc:
        return ClinkrCommandError(error_type="git_diff_failed", message=str(exc))

    if isinstance(result, LocalReviewResult):
        return result
    return ClinkrCommandError(error_type=type(result).ERROR_TYPE, message=result.message)
