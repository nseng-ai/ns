"""Post or update the findings comment on a PR in place.

Reads a rendered Markdown body on stdin — the exact output of
``roaster exec format-findings-comment`` — extracts the ``<!-- roaster:... -->``
marker from the first line, and either PATCHes the matching bot comment in place
or POSTs a new comment if none is found.

The bot-author check guards against a human adding the marker to their own
comment and tricking the roaster into overwriting it on a later run.
"""

from __future__ import annotations

import sys
from datetime import UTC, datetime

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.gh.types import PRDiscussionComment
from roaster.context import RoasterCliContext
from roaster.findings_publication import (
    FindingsCommentBodyParseError,
    parse_findings_comment_body,
    preserve_activity_log,
)

_BOT_AUTHOR_LOGIN = "github-actions[bot]"


@click.command(
    name="post-findings-comment",
    help=(
        "Post or update the roaster findings comment on a PR. Reads the "
        "rendered Markdown body from stdin."
    ),
)
@click.option("--pr-number", required=True, type=int, help="PR number to post against.")
@click.option(
    "--run-url",
    default=None,
    help=(
        "Optional URL or identifier for the current CI run, recorded in the "
        "Activity Log alongside the timestamp."
    ),
)
@click.pass_context
def post_findings_comment_command(
    ctx: click.Context,
    pr_number: int,
    run_url: str | None,
) -> None:
    raw = sys.stdin.read()
    parsed = parse_findings_comment_body(raw)
    if isinstance(parsed, FindingsCommentBodyParseError):
        click.echo(f"post-findings-comment: {parsed.message}", err=True)
        sys.exit(1)

    pr_gateway = load_typed_context(ctx, RoasterCliContext).pr_gateway

    run_summary = _format_run_summary(run_url)
    existing = pr_gateway.find_pr_discussion_comment_by_marker(
        pr_number, parsed.marker, author_login=_BOT_AUTHOR_LOGIN
    )
    body = preserve_activity_log(
        existing.body if existing is not None else "",
        parsed.body,
        run_summary=run_summary,
    )

    if existing is None:
        result = pr_gateway.add_pr_discussion_comment(pr_number, body)
    else:
        result = pr_gateway.update_pr_discussion_comment(existing.id, body)

    _report(result, created=existing is None)


def _format_run_summary(run_url: str | None) -> str:
    timestamp = datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    if run_url:
        return f"{timestamp} — {run_url}"
    return timestamp


def _report(comment: PRDiscussionComment, *, created: bool) -> None:
    verb = "created" if created else "updated"
    click.echo(f"post-findings-comment: {verb} comment {comment.id}", err=True)
