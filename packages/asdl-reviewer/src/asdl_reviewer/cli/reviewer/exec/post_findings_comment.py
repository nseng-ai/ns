"""Post or update the findings comment on a PR in place.

Reads a rendered Markdown body on stdin — the exact output of
``reviewer exec format-findings-comment`` — extracts the ``<!-- asdl-reviewer:... -->``
marker from the first line, and either PATCHes the matching bot comment in place
or POSTs a new comment if none is found.

The bot-author check guards against a human adding the marker to their own
comment and tricking the reviewer into overwriting it on a later run.
"""

from __future__ import annotations

import functools
import re
import sys
from dataclasses import dataclass
from datetime import UTC, datetime

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.gh.types import IssueComment
from asdl_reviewer.context import ReviewerCliContext

_BOT_AUTHOR_LOGIN = "github-actions[bot]"
_ACTIVITY_LOG_HEADING = "### Activity Log"
_ACTIVITY_LOG_CAP = 10


@functools.cache
def _get_marker_pattern() -> re.Pattern[str]:
    return re.compile(r"^<!-- (asdl-reviewer:[^ ]+) -->$")


class MarkerExtractionError(ValueError):
    """Input body did not start with a ``<!-- asdl-reviewer:... -->`` marker."""


@dataclass(frozen=True)
class _ParsedBody:
    marker: str
    body: str


def _parse_body(raw: str) -> _ParsedBody:
    lines = raw.splitlines()
    if not lines:
        raise MarkerExtractionError("input body is empty")
    match = _get_marker_pattern().match(lines[0].rstrip("\r"))
    if match is None:
        raise MarkerExtractionError(
            "first line of body must be a `<!-- asdl-reviewer:<key> -->` marker"
        )
    return _ParsedBody(marker=f"<!-- {match.group(1)} -->", body=raw)


def _preserve_activity_log(existing_body: str, new_body: str, run_summary: str) -> str:
    """Merge a new Activity Log entry into ``new_body`` from ``existing_body``.

    Reads any prior ``### Activity Log`` block off the end of ``existing_body``,
    appends ``run_summary`` as a fresh bullet, caps history at
    ``_ACTIVITY_LOG_CAP`` entries (oldest dropped), and rewrites or appends the
    block on ``new_body``.
    """
    prior_entries = _extract_activity_log_entries(existing_body)
    entries = list(prior_entries) + [run_summary]
    entries = entries[-_ACTIVITY_LOG_CAP:]

    base = _strip_activity_log(new_body).rstrip()
    rendered = [base, "", _ACTIVITY_LOG_HEADING, ""]
    rendered.extend(f"- {entry}" for entry in entries)
    return "\n".join(rendered) + "\n"


def _extract_activity_log_entries(body: str) -> tuple[str, ...]:
    lines = body.splitlines()
    for index, line in enumerate(lines):
        if line.strip() == _ACTIVITY_LOG_HEADING:
            entries: list[str] = []
            for entry_line in lines[index + 1 :]:
                stripped = entry_line.strip()
                if stripped.startswith("- "):
                    entries.append(stripped[2:])
            return tuple(entries)
    return ()


def _strip_activity_log(body: str) -> str:
    lines = body.splitlines()
    for index, line in enumerate(lines):
        if line.strip() == _ACTIVITY_LOG_HEADING:
            return "\n".join(lines[:index])
    return body


@click.command(
    name="post-findings-comment",
    help=(
        "Post or update the reviewer findings comment on a PR. Reads the "
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
    try:
        parsed = _parse_body(raw)
    except MarkerExtractionError as exc:
        click.echo(f"post-findings-comment: {exc}", err=True)
        sys.exit(1)

    issue_gateway = load_typed_context(ctx, ReviewerCliContext).issue_gateway

    run_summary = _format_run_summary(run_url)
    existing = issue_gateway.find_comment_by_marker(
        pr_number, parsed.marker, author_login=_BOT_AUTHOR_LOGIN
    )
    body = _preserve_activity_log(
        existing.body if existing is not None else "",
        parsed.body,
        run_summary=run_summary,
    )

    if existing is None:
        result = issue_gateway.add_comment(pr_number, body)
    else:
        result = issue_gateway.update_comment(existing.id, body)

    _report(result, created=existing is None)


def _format_run_summary(run_url: str | None) -> str:
    timestamp = datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    if run_url:
        return f"{timestamp} — {run_url}"
    return timestamp


def _report(comment: IssueComment, *, created: bool) -> None:
    verb = "created" if created else "updated"
    click.echo(f"post-findings-comment: {verb} comment {comment.id}", err=True)
