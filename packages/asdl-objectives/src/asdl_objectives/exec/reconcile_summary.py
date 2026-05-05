"""``objective exec reconcile-summary`` — compact plan summary for agents."""

from __future__ import annotations

from typing import Any

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrJsonSchemaModel, ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_objectives.context import ObjectiveCliContext
from asdl_objectives.exec.reconcile_plan import (
    CanonicalFile,
    IncludedSnapshot,
    ReconcilePlanRequest,
    SkippedSnapshot,
    SlugPlanItem,
    build_reconcile_plan,
)

SUMMARY_SCHEMA = "reconcile-summary/v1"


class ReconcileSummaryCounts(ClinkrModel):
    slug_count: int
    actionable_slug_count: int
    gap_count: int
    conflict_count: int


class ReconcileSummaryCanonicalFile(ClinkrModel):
    file: str
    present: bool
    expected_old_blob_sha: str | None
    expected_old_head_sha: str | None


class ReconcileSummaryIncludedSnapshot(ClinkrModel):
    branch: str
    pr_number: int | None
    pr_state: str | None
    pr_title: str | None
    pr_url: str | None
    files: tuple[str, ...]


class ReconcileSummarySkippedSnapshot(ClinkrModel):
    branch: str
    reason: str
    pr_number: int | None
    pr_state: str | None
    pr_title: str | None
    pr_url: str | None
    pr_error: str | None


class ReconcileSummarySlug(ClinkrModel):
    slug: str
    canonical_present: bool
    canonical_files: tuple[ReconcileSummaryCanonicalFile, ...]
    included_snapshots: tuple[ReconcileSummaryIncludedSnapshot, ...]
    skipped_snapshots: tuple[ReconcileSummarySkippedSnapshot, ...]
    gaps: tuple[str, ...]
    conflicts: tuple[str, ...]


class ReconcileSummaryResult(ClinkrJsonSchemaModel):
    success: bool
    canonical_branch: str
    summary: ReconcileSummaryCounts
    slugs: tuple[ReconcileSummarySlug, ...]


def render_reconcile_summary(result: ReconcileSummaryResult) -> None:
    click.echo("# Objective reconcile summary")
    click.echo()
    click.echo(f"Canonical branch: `{result.canonical_branch}`")
    click.echo()
    if not result.slugs:
        click.echo("No objectives matched.")
        return

    for slug in result.slugs:
        click.echo(f"## {slug.slug}")
        click.echo()
        click.echo(f"Status: {_slug_status(slug)}")
        present_files = [f"`{f.file}`" for f in slug.canonical_files if f.present]
        click.echo(f"Canonical files: {', '.join(present_files) if present_files else 'None'}")
        click.echo()

        click.echo("### Included merged snapshots")
        click.echo()
        if slug.included_snapshots:
            for snapshot in slug.included_snapshots:
                pr_label = _pr_label(snapshot.pr_number, snapshot.pr_state)
                click.echo(f"- {pr_label} — {snapshot.branch}")
                if snapshot.pr_title:
                    click.echo(f"  {snapshot.pr_title}")
        else:
            click.echo("None.")
        click.echo()

        click.echo("### Skipped snapshots")
        click.echo()
        if slug.skipped_snapshots:
            for snapshot in slug.skipped_snapshots:
                click.echo(f"- {snapshot.branch} — {snapshot.reason}")
        else:
            click.echo("None.")
        click.echo()

        click.echo("### Gaps")
        click.echo()
        _render_string_list(slug.gaps)
        click.echo()

        click.echo("### Conflicts")
        click.echo()
        _render_string_list(slug.conflicts)
        click.echo()


@clinkr_operation(
    name="reconcile-summary",
    help=(
        "Emit a compact objective-reconcile summary without raw Markdown contents. "
        "The command shares reconcile-plan mechanics, preserving included/skipped "
        "snapshot classification, gaps, conflicts, and canonical file SHAs."
    ),
    human_renderer=render_reconcile_summary,
)
def run_reconcile_summary_objective(
    ctx: click.Context,
    request: ReconcilePlanRequest,
) -> ClinkrExit[ReconcileSummaryResult]:
    mctx = load_typed_context(ctx, ObjectiveCliContext)
    plan = build_reconcile_plan(mctx, request.slugs)
    return ClinkrExit.ok(_summary_from_plan(plan.canonical_branch, plan.slugs))


def _summary_from_plan(
    canonical_branch: str,
    slugs: tuple[SlugPlanItem, ...],
) -> ReconcileSummaryResult:
    summary_slugs = tuple(_summarize_slug(slug) for slug in slugs)
    return ReconcileSummaryResult(
        success=True,
        json_schema=SUMMARY_SCHEMA,
        canonical_branch=canonical_branch,
        summary=ReconcileSummaryCounts(
            slug_count=len(summary_slugs),
            actionable_slug_count=sum(1 for slug in summary_slugs if _is_actionable(slug)),
            gap_count=sum(len(slug.gaps) for slug in summary_slugs),
            conflict_count=sum(len(slug.conflicts) for slug in summary_slugs),
        ),
        slugs=summary_slugs,
    )


def _summarize_slug(slug: SlugPlanItem) -> ReconcileSummarySlug:
    return ReconcileSummarySlug(
        slug=slug.slug,
        canonical_present=slug.canonical_present,
        canonical_files=tuple(_summarize_file(file) for file in slug.canonical_files),
        included_snapshots=tuple(
            _summarize_included_snapshot(snapshot) for snapshot in slug.included_snapshots
        ),
        skipped_snapshots=tuple(
            _summarize_skipped_snapshot(snapshot) for snapshot in slug.skipped_snapshots
        ),
        gaps=slug.gaps,
        conflicts=slug.conflicts,
    )


def _summarize_file(file: CanonicalFile) -> ReconcileSummaryCanonicalFile:
    return ReconcileSummaryCanonicalFile(
        file=file.file,
        present=file.present,
        expected_old_blob_sha=file.expected_old_blob_sha,
        expected_old_head_sha=file.expected_old_head_sha,
    )


def _summarize_included_snapshot(
    snapshot: IncludedSnapshot,
) -> ReconcileSummaryIncludedSnapshot:
    return ReconcileSummaryIncludedSnapshot(
        branch=snapshot.branch,
        pr_number=snapshot.pr.number,
        pr_state=snapshot.pr.state,
        pr_title=snapshot.pr.title,
        pr_url=snapshot.pr.url,
        files=tuple(file.file for file in snapshot.files),
    )


def _summarize_skipped_snapshot(
    snapshot: SkippedSnapshot,
) -> ReconcileSummarySkippedSnapshot:
    pr = snapshot.pr
    return ReconcileSummarySkippedSnapshot(
        branch=snapshot.branch,
        reason=snapshot.reason,
        pr_number=pr.number,
        pr_state=pr.state,
        pr_title=pr.title,
        pr_url=pr.url,
        pr_error=pr.error,
    )


def _slug_to_json(slug: ReconcileSummarySlug) -> dict[str, Any]:
    return {
        "slug": slug.slug,
        "canonical_present": slug.canonical_present,
        "canonical_files": [
            {
                "file": file.file,
                "present": file.present,
                "expected_old_blob_sha": file.expected_old_blob_sha,
                "expected_old_head_sha": file.expected_old_head_sha,
            }
            for file in slug.canonical_files
        ],
        "included_snapshots": [
            {
                "branch": snapshot.branch,
                "pr_number": snapshot.pr_number,
                "pr_state": snapshot.pr_state,
                "pr_title": snapshot.pr_title,
                "pr_url": snapshot.pr_url,
                "files": list(snapshot.files),
            }
            for snapshot in slug.included_snapshots
        ],
        "skipped_snapshots": [
            {
                "branch": snapshot.branch,
                "reason": snapshot.reason,
                "pr_number": snapshot.pr_number,
                "pr_state": snapshot.pr_state,
                "pr_title": snapshot.pr_title,
                "pr_url": snapshot.pr_url,
                "pr_error": snapshot.pr_error,
            }
            for snapshot in slug.skipped_snapshots
        ],
        "gaps": list(slug.gaps),
        "conflicts": list(slug.conflicts),
    }


def _is_actionable(slug: ReconcileSummarySlug) -> bool:
    return slug.canonical_present and bool(slug.included_snapshots) and not slug.conflicts


def _slug_status(slug: ReconcileSummarySlug) -> str:
    if slug.conflicts:
        return "conflict"
    if _is_actionable(slug):
        return "actionable"
    if slug.gaps:
        return "gap"
    return "no-op"


def _pr_label(pr_number: int | None, pr_state: str | None) -> str:
    if pr_number is None:
        return pr_state or "PR unknown"
    if pr_state is None:
        return f"PR #{pr_number}"
    return f"PR #{pr_number} {pr_state}"


def _render_string_list(items: tuple[str, ...]) -> None:
    if not items:
        click.echo("None.")
        return
    for item in items:
        click.echo(f"- {item}")
