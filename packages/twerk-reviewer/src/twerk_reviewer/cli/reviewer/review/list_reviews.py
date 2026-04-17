from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import click

from twerk_core.clinkr.command import ClinkrCommandError
from twerk_core.clinkr.operation import clinkr_operation
from twerk_reviewer.cli.reviewer.context import load_reviewer_context
from twerk_reviewer.gateways.review_definition.gateway import REVIEWS_DIRNAME
from twerk_reviewer.git_toplevel import git_toplevel
from twerk_reviewer.models import ReviewerFailure


@dataclass(frozen=True)
class ReviewListRequest:
    pass


@dataclass(frozen=True)
class ReviewListResult:
    keys: tuple[str, ...]
    reviews_dir: str

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "reviews_dir": self.reviews_dir,
            "keys": list(self.keys),
            "count": len(self.keys),
        }


def render_review_list(result: ReviewListResult) -> None:
    click.echo(f"Reviews directory: {result.reviews_dir}")
    if not result.keys:
        click.echo("No reviews found.")
        return
    click.echo(f"Reviews: {len(result.keys)}")
    for key in result.keys:
        click.echo(f"- {key}")


@clinkr_operation(
    name="list",
    aliases=("ls",),
    help="List markdown reviewers discovered under reviews/.",
    human_renderer=render_review_list,
)
def run_review_list_command(
    ctx: click.Context,
    request: ReviewListRequest,
) -> ReviewListResult | ClinkrCommandError:
    reviewer_context = load_reviewer_context(ctx)

    repo_root = git_toplevel(cwd=reviewer_context.cwd)
    if isinstance(repo_root, ReviewerFailure):
        return ClinkrCommandError(error_type=repo_root.error_type, message=repo_root.message)

    reviews_dir = repo_root / REVIEWS_DIRNAME

    keys = reviewer_context.review_definition.list_reviews(reviews_dir)
    if isinstance(keys, ReviewerFailure):
        return ClinkrCommandError(error_type=keys.error_type, message=keys.message)

    return ReviewListResult(keys=keys, reviews_dir=str(reviews_dir))
