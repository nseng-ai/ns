from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.dataclass_json import JsonSerializable
from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.clinkr.operation import clinkr_operation
from asdl_reviewer.context import ReviewerCliContext
from asdl_reviewer.gateways.review_definition.gateway import REVIEWS_DIRNAME
from asdl_reviewer.git_toplevel import git_toplevel
from asdl_reviewer.models import (
    GitInvocationFailedError,
    RepoRootUnavailableError,
)


@dataclass(frozen=True)
class ReviewListRequest:
    pass


@dataclass(frozen=True)
class ReviewListResult(JsonSerializable):
    keys: tuple[str, ...]
    reviews_dir: str

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "reviews_dir": self.reviews_dir,
            "keys": list(self.keys),
            "count": len(self.keys),
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

    for group in build_review_key_groups(result.keys):
        if group.prefix is None:
            for entry in group.entries:
                click.echo(f"- {entry}")
            continue

        click.echo("")
        click.echo(f"{group.prefix}/")
        for entry in group.entries:
            click.echo(f"  - {entry}")


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
    reviewer_context = load_typed_context(ctx, ReviewerCliContext)

    try:
        repo_root = git_toplevel(cwd=reviewer_context.cwd)
    except RepoRootUnavailableError as exc:
        raise ClinkrFailure(error_type="repo_root_unavailable", message=str(exc)) from exc
    except GitInvocationFailedError as exc:
        raise ClinkrFailure(error_type="git_invocation_failed", message=str(exc)) from exc

    reviews_dir = repo_root / REVIEWS_DIRNAME

    keys = Ensure.ideal_state(reviewer_context.review_definition.list_reviews(reviews_dir))

    return ClinkrExit.ok(ReviewListResult(keys=keys, reviews_dir=str(reviews_dir)))
