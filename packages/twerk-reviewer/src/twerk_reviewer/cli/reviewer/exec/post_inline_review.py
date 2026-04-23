"""Submit a batched PR review with one inline comment per reviewer finding.

Reads a reviewer clinkr envelope on stdin (the exact output of
``reviewer review run <key> --review-format findings --format json``),
pre-filters findings whose ``(path, line)`` pair is not inside a diff hunk
on the PR head, and submits the remaining findings as inline comments on a
single batched ``POST /pulls/{n}/reviews`` call with ``event="COMMENT"``
(post-only; never blocks the PR's merge check).

Complements :mod:`post_findings_comment`, which posts / updates the
summary discussion comment. Both consume the same upstream envelope —
``post-findings-comment`` reads the rendered Markdown from
``format-findings-comment``, while this command reads the envelope
directly so it can access the structured ``path`` / ``line`` fields.
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass

import click

from twerk_core.clinkr.context import load_typed_context
from twerk_core.gh.issue_gateway import IssueGateway
from twerk_core.gh.types import PRFile, PRReviewInlineComment
from twerk_reviewer.cli.reviewer.exec.format_findings_comment import (
    FindingRow,
    FindingsParseError,
    FindingsPayload,
    parse_findings_payload,
)
from twerk_reviewer.context import ReviewerCliContext

_SEVERITY_LABELS: dict[str, str] = {
    "error": "⛔ error",
    "warning": "⚠️ warning",
    "info": "ℹ️ info",
}

_HUNK_HEADER = re.compile(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@")


@dataclass(frozen=True)
class _FilterDecision:
    """Result of pre-filtering: what to post vs what to drop and why."""

    inline: tuple[PRReviewInlineComment, ...]
    skipped_no_line: tuple[FindingRow, ...]
    skipped_out_of_diff: tuple[FindingRow, ...]


def targetable_lines(patch: str | None) -> frozenset[int]:
    """Return the set of new-file line numbers addressable by inline comments.

    GitHub's PR review API accepts inline comments only on lines that lie
    inside a unified-diff hunk — either added (``+``) or context (``' '``)
    lines in the new-file view. A line outside every hunk on a file's patch
    fails the batched review with a non-transient ``422 line not in diff``.

    ``patch`` may be ``None`` (GitHub omits patches for renames without
    content changes and for files too large to diff); in that case no lines
    are targetable.
    """
    if patch is None:
        return frozenset()
    lines: set[int] = set()
    current = 0
    in_hunk = False
    for raw_line in patch.splitlines():
        if raw_line.startswith("@@"):
            match = _HUNK_HEADER.match(raw_line)
            if match:
                current = int(match.group(1))
                in_hunk = True
            else:
                in_hunk = False
            continue
        if not in_hunk:
            continue
        if raw_line.startswith("+") and not raw_line.startswith("+++"):
            lines.add(current)
            current += 1
        elif raw_line.startswith(" "):
            lines.add(current)
            current += 1
        elif raw_line.startswith("-") and not raw_line.startswith("---"):
            # Deletion — exists in the old file only; does not advance the
            # new-file line counter.
            continue
        # Anything else (e.g., "\ No newline at end of file" sentinels) is
        # ignored without advancing the counter.
    return frozenset(lines)


def build_diff_index(pr_files: tuple[PRFile, ...]) -> dict[str, frozenset[int]]:
    """Index a PR's changed files to a ``{path: targetable-lines}`` mapping."""
    return {pr_file.path: targetable_lines(pr_file.patch) for pr_file in pr_files}


def filter_findings(
    findings: tuple[FindingRow, ...],
    diff_index: dict[str, frozenset[int]],
) -> _FilterDecision:
    """Partition findings into postable inline comments vs dropped-with-reason.

    Two drop reasons are surfaced separately so the review summary body can
    explain each one to reviewers looking at the PR:

    - ``skipped_no_line`` — the finding's ``line`` field is ``None``. The
      reviewer schema still accepts ``line: null`` (see
      ``ReviewFinding.from_json_dict``) but GitHub's inline review API
      requires a concrete line.
    - ``skipped_out_of_diff`` — the finding points at a ``(path, line)``
      that exists in the repo but is not inside any diff hunk on the PR
      head. These are common when the reviewer flags structural issues
      that touch lines the PR did not change.
    """
    inline: list[PRReviewInlineComment] = []
    skipped_no_line: list[FindingRow] = []
    skipped_out_of_diff: list[FindingRow] = []
    for finding in findings:
        if finding.line is None:
            skipped_no_line.append(finding)
            continue
        valid_lines = diff_index.get(finding.path, frozenset())
        if finding.line not in valid_lines:
            skipped_out_of_diff.append(finding)
            continue
        inline.append(
            PRReviewInlineComment(
                path=finding.path,
                line=finding.line,
                body=render_finding_inline(finding),
            )
        )
    return _FilterDecision(
        inline=tuple(inline),
        skipped_no_line=tuple(skipped_no_line),
        skipped_out_of_diff=tuple(skipped_out_of_diff),
    )


def render_finding_inline(finding: FindingRow) -> str:
    """Render a single finding as the body of one inline comment."""
    label = _SEVERITY_LABELS.get(finding.severity, finding.severity)
    return f"**{label} — {finding.summary}**\n\n{finding.details}"


def render_review_summary(
    payload: FindingsPayload,
    *,
    decision: _FilterDecision,
) -> str:
    """Top-level review body describing what was posted vs what was dropped."""
    marker = f"<!-- twerk-reviewer-inline:{payload.review_name} -->"
    posted_count = len(decision.inline)
    skipped_total = len(decision.skipped_no_line) + len(decision.skipped_out_of_diff)

    lines = [
        marker,
        f"## twerk-reviewer inline · `{payload.review_name}`",
        "",
        f"**{posted_count} inline** / {payload.count} total "
        f"finding(s) against base `{payload.base_ref}`.",
    ]

    if skipped_total == 0:
        return "\n".join(lines)

    lines.extend(["", "<details>", "<summary>Findings skipped</summary>", ""])
    if decision.skipped_out_of_diff:
        lines.append("**Outside the PR diff** — see the summary comment for details:")
        lines.append("")
        for finding in decision.skipped_out_of_diff:
            lines.append(f"- `{_location(finding)}` — {finding.summary}")
        lines.append("")
    if decision.skipped_no_line:
        lines.append("**No line** — file-level findings; see the summary comment:")
        lines.append("")
        for finding in decision.skipped_no_line:
            lines.append(f"- `{finding.path}` — {finding.summary}")
        lines.append("")
    lines.append("</details>")
    return "\n".join(lines)


def _location(finding: FindingRow) -> str:
    return finding.path if finding.line is None else f"{finding.path}:{finding.line}"


@click.command(
    name="post-inline-review",
    help=(
        "Submit a batched PR review with one inline comment per reviewer "
        "finding that falls inside the PR diff. Reads the reviewer JSON "
        "envelope from stdin."
    ),
)
@click.option("--pr-number", required=True, type=int, help="PR number to post against.")
@click.option(
    "--commit-sha",
    required=True,
    type=str,
    help=(
        "Head commit SHA the review is anchored to — typically "
        "`${{ github.event.pull_request.head.sha }}` in CI."
    ),
)
@click.pass_context
def post_inline_review_command(
    ctx: click.Context,
    pr_number: int,
    commit_sha: str,
) -> None:
    raw = sys.stdin.read()
    try:
        payload = parse_findings_payload(raw)
    except FindingsParseError as exc:
        click.echo(f"post-inline-review: {exc}", err=True)
        sys.exit(1)

    if payload.is_error:
        click.echo(
            (
                "post-inline-review: upstream reviewer reported "
                f"{payload.error_type}; skipping inline review submission"
            ),
            err=True,
        )
        return

    if payload.count == 0:
        click.echo("post-inline-review: no findings; skipping submission", err=True)
        return

    issue_gateway: IssueGateway = load_typed_context(ctx, ReviewerCliContext).issue_gateway
    diff_index = build_diff_index(issue_gateway.get_pr_files(pr_number))
    decision = filter_findings(payload.findings, diff_index)

    if not decision.inline and not decision.skipped_no_line and not decision.skipped_out_of_diff:
        # Defensive — should be unreachable given the count>0 check above.
        click.echo("post-inline-review: no findings to post", err=True)
        return

    body = render_review_summary(payload, decision=decision)

    if not decision.inline:
        click.echo(
            (
                "post-inline-review: all "
                f"{payload.count} finding(s) dropped "
                f"(no-line={len(decision.skipped_no_line)}, "
                f"out-of-diff={len(decision.skipped_out_of_diff)}); "
                "skipping submission"
            ),
            err=True,
        )
        return

    review_id = issue_gateway.submit_pr_review(
        pr_number,
        commit_sha=commit_sha,
        body=body,
        comments=decision.inline,
    )
    click.echo(
        (
            f"post-inline-review: submitted review {review_id} with "
            f"{len(decision.inline)} inline comment(s); "
            f"{len(decision.skipped_no_line)} no-line, "
            f"{len(decision.skipped_out_of_diff)} out-of-diff skipped"
        ),
        err=True,
    )
