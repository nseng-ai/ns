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
from roaster.models import GitInvocationFailedError, RepoRootUnavailableError, ReviewSource
from roaster.review_definition import parse_review_definition


class ReviewListRequest(ClinkrModel):
    ci_enabled: Annotated[
        Literal["true", "false"] | None,
        click.Option(
            ["--ci-enabled"],
            type=click.Choice(["true", "false"]),
            default=None,
            help="Filter reviews by whether they are enabled for roaster CI discovery.",
        ),
    ] = None


class ReviewListReview(ClinkrModel):
    key: str
    ci: bool


class ReviewListResult(ClinkrModel):
    keys: tuple[str, ...]
    reviews: tuple[ReviewListReview, ...]
    reviews_dir: str

    @model_serializer
    def serialize_model(self) -> dict[str, Any]:
        return {
            "reviews_dir": self.reviews_dir,
            "keys": list(self.keys),
            "count": len(self.keys),
            "reviews": [review.model_dump(mode="json") for review in self.reviews],
        }


@dataclass(frozen=True)
class ReviewKeyGroup:
    prefix: str | None
    entries: tuple[str, ...]


def build_review_key_groups(keys: tuple[str, ...]) -> tuple[ReviewKeyGroup, ...]:
    grouped_entries: dict[str | None, list[str]] = {}
    for key in keys:
        prefix, separator, remainder = key.partition("/")
        group_prefix = prefix if separator else None
        entry = remainder if separator else prefix
        grouped_entries.setdefault(group_prefix, []).append(entry)

    return tuple(
        ReviewKeyGroup(prefix=prefix, entries=tuple(entries))
        for prefix, entries in sorted(
            grouped_entries.items(),
            key=lambda item: (item[0] is not None, item[0] or ""),
        )
    )


def render_review_list(result: ReviewListResult) -> None:
    click.echo(f"Reviews directory: {result.reviews_dir}")
    if not result.keys:
        click.echo("No reviews found.")
        return
    click.echo(f"Reviews: {len(result.keys)}")

    ci_by_key = {review.key: review.ci for review in result.reviews}
    for group in build_review_key_groups(result.keys):
        if group.prefix is None:
            for entry in group.entries:
                click.echo(f"- {entry} (ci: {_format_ci(ci_by_key[entry])})")
            continue

        click.echo("")
        click.echo(f"{group.prefix}/")
        for entry in group.entries:
            key = f"{group.prefix}/{entry}"
            click.echo(f"  - {entry} (ci: {_format_ci(ci_by_key[key])})")


def _format_ci(ci: bool) -> str:
    if ci:
        return "true"
    return "false"


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
        catalog = Ensure.ideal_state(roaster_context.catalog.list_review_keys())
    except RepoRootUnavailableError as exc:
        raise ClinkrFailure(error_type="repo_root_unavailable", message=str(exc)) from exc
    except GitInvocationFailedError as exc:
        raise ClinkrFailure(error_type="git_invocation_failed", message=str(exc)) from exc

    reviews: list[ReviewListReview] = []
    for key in catalog.keys:
        review_source = Ensure.ideal_state(roaster_context.catalog.load_review_source(key=key))
        if not isinstance(review_source, ReviewSource):
            Ensure.fail(
                error_type="invalid_review_catalog",
                message=f"Review catalog returned unexpected source for key {key!r}.",
            )
        try:
            definition = parse_review_definition(review_source.source, name=review_source.key)
        except ValueError as exc:
            raise ClinkrFailure(
                error_type="invalid_review_definition",
                message=f"{review_source.key}: {exc}",
            ) from exc
        if request.ci_enabled is not None and _format_ci(definition.ci) != request.ci_enabled:
            continue
        reviews.append(ReviewListReview(key=review_source.key, ci=definition.ci))

    return ClinkrExit.ok(
        ReviewListResult(
            keys=tuple(review.key for review in reviews),
            reviews=tuple(reviews),
            reviews_dir=str(catalog.reviews_dir),
        )
    )
