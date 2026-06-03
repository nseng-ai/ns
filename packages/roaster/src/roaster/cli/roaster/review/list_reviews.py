from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Any, Literal

import click
from pydantic import model_serializer

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from roaster.context import RoasterCliContext
from roaster.models import (
    GitInvocationFailedError,
    RepoRootUnavailableError,
    ReviewDefinitionReadError,
    ReviewMetadata,
    ReviewTarget,
    review_metadata_to_json,
)
from roaster.workflow import list_reviews


class ReviewListRequest(ClinkrModel):
    target: Annotated[
        Literal["ci", "local"] | None,
        click.Option(
            ["--target"],
            type=click.Choice(["ci", "local"]),
            help="Filter reviews eligible for the requested target.",
        ),
    ] = None


class ReviewListResult(ClinkrModel):
    reviews: tuple[ReviewMetadata, ...]
    reviews_dir: str
    target: ReviewTarget | None

    @model_serializer
    def serialize_model(self) -> dict[str, Any]:
        return {
            "reviews_dir": self.reviews_dir,
            "target": self.target,
            "reviews": [review_metadata_to_json(review) for review in self.reviews],
            "count": len(self.reviews),
        }


@dataclass(frozen=True)
class ReviewEntryGroup:
    prefix: str | None
    entries: tuple[ReviewMetadata, ...]


def build_review_entry_groups(reviews: tuple[ReviewMetadata, ...]) -> tuple[ReviewEntryGroup, ...]:
    grouped_entries: dict[str | None, list[ReviewMetadata]] = {}
    for review in reviews:
        prefix, separator, _remainder = review.key.partition("/")
        group_prefix = prefix if separator else None
        grouped_entries.setdefault(group_prefix, []).append(review)

    return tuple(
        ReviewEntryGroup(prefix=prefix, entries=tuple(entries))
        for prefix, entries in sorted(
            grouped_entries.items(),
            key=lambda item: (item[0] is not None, item[0] or ""),
        )
    )


def render_review_list(result: ReviewListResult) -> None:
    click.echo(f"Reviews directory: {result.reviews_dir}")
    if result.target is not None:
        click.echo(f"Target: {result.target}")
    if not result.reviews:
        click.echo("No reviews found.")
        return
    click.echo(f"Reviews: {len(result.reviews)}")

    for group in build_review_entry_groups(result.reviews):
        if group.prefix is None:
            for entry in group.entries:
                click.echo(_format_review_entry(entry=entry, indent="", display_key=entry.key))
            continue

        click.echo("")
        click.echo(f"{group.prefix}/")
        for entry in group.entries:
            _prefix, _separator, remainder = entry.key.partition("/")
            click.echo(_format_review_entry(entry=entry, indent="  ", display_key=remainder))


@clinkr_operation(
    name="list",
    aliases=("ls",),
    help="List markdown reviewers discovered under reviews/.",
    human_renderer=render_review_list,
)
def run_review_list_command(
    ctx: click.Context,
    request: ReviewListRequest,
) -> ClinkrExit[ReviewListResult]:
    roaster_context = load_typed_context(ctx, RoasterCliContext)

    try:
        catalog = Ensure.ideal_state(
            list_reviews(
                requested_target=request.target,
                catalog=roaster_context.catalog,
            )
        )
    except ReviewDefinitionReadError as exc:
        raise ClinkrFailure(error_type="review_definition_read_failed", message=str(exc)) from exc
    except RepoRootUnavailableError as exc:
        raise ClinkrFailure(error_type="repo_root_unavailable", message=str(exc)) from exc
    except GitInvocationFailedError as exc:
        raise ClinkrFailure(error_type="git_invocation_failed", message=str(exc)) from exc

    return ClinkrExit.ok(
        ReviewListResult(
            reviews=catalog.reviews,
            reviews_dir=str(catalog.reviews_dir),
            target=request.target,
        )
    )


def _format_review_entry(*, entry: ReviewMetadata, indent: str, display_key: str) -> str:
    description = " ".join(entry.description.split())
    model = f"; model: {entry.default_model}" if entry.default_model else ""
    return f"{indent}- {display_key} [{entry.scope}{model}] — {description}"
