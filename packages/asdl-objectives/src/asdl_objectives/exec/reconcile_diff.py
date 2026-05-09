"""``objective exec reconcile-diff`` — deterministic text diffs for reconcile."""

from __future__ import annotations

import difflib
from typing import Annotated

import click

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.clinkr.models import ClinkrJsonSchemaModel, ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.gh.types import PRChangedFile
from asdl_objectives.context import ObjectiveCliContext
from asdl_objectives.discovery import BODY_FILE, NOTES_FILE, ROADMAP_FILE
from asdl_objectives.exec.reconcile_plan import (
    PLAN_SCHEMA,
    CanonicalFile,
    SkippedSnapshot,
    SlugPlanItem,
    build_reconcile_plan,
)

DIFF_SCHEMA = "reconcile-diff/v1"
_OBJECTIVE_FILES = (BODY_FILE, ROADMAP_FILE, NOTES_FILE)


class ReconcileDiffRequest(ClinkrModel):
    slug: Annotated[str, click.Argument(["slug"], type=click.STRING)]


class ReconcileDiffFile(ClinkrModel):
    file: str
    canonical_present: bool
    snapshot_present: bool
    changed: bool
    diff: str


class ReconcileDiffChangedFile(ClinkrModel):
    path: str
    status: str


class ReconcileDiffPrEvidence(ClinkrModel):
    number: int | None
    state: str | None
    title: str | None
    url: str | None
    body: str | None
    files: tuple[ReconcileDiffChangedFile, ...]


class ReconcileDiffSnapshot(ClinkrModel):
    branch: str
    pr_number: int | None
    pr_state: str | None
    pr_title: str | None
    pr_url: str | None
    pr_evidence: ReconcileDiffPrEvidence
    files: tuple[ReconcileDiffFile, ...]


class ReconcileDiffSkippedSnapshot(ClinkrModel):
    branch: str
    reason: str
    pr_number: int | None
    pr_state: str | None
    pr_title: str | None
    pr_url: str | None
    pr_error: str | None


class ReconcileDiffResult(ClinkrJsonSchemaModel):
    success: bool
    slug: str
    canonical_branch: str
    snapshots: tuple[ReconcileDiffSnapshot, ...]
    skipped_snapshots: tuple[ReconcileDiffSkippedSnapshot, ...]
    gaps: tuple[str, ...]
    conflicts: tuple[str, ...]


def render_reconcile_diff(result: ReconcileDiffResult) -> None:
    click.echo(f"# Diff: {result.slug}")
    click.echo()
    click.echo(f"Canonical branch: `{result.canonical_branch}`")
    click.echo()

    if result.gaps:
        click.echo("## Gaps")
        click.echo()
        for gap in result.gaps:
            click.echo(f"- {gap}")
        click.echo()

    if result.conflicts:
        click.echo("## Conflicts")
        click.echo()
        for conflict in result.conflicts:
            click.echo(f"- {conflict}")
        click.echo()

    if result.skipped_snapshots:
        click.echo("## Skipped snapshots")
        click.echo()
        for snapshot in result.skipped_snapshots:
            click.echo(f"- {snapshot.branch} — {snapshot.reason}")
        click.echo()

    if not result.snapshots:
        click.echo("No included merged snapshots.")
        return

    for snapshot in result.snapshots:
        click.echo(f"## {_snapshot_heading(snapshot)}")
        click.echo()
        click.echo("### PR evidence")
        click.echo()
        _render_pr_evidence(snapshot.pr_evidence)
        changed_files = tuple(file for file in snapshot.files if file.changed)
        if changed_files:
            click.echo("### Snapshot edits (hint)")
            click.echo()
            for file in changed_files:
                click.echo(f"#### {file.file}")
                click.echo()
                click.echo("```diff")
                click.echo(file.diff, nl=False)
                if file.diff and not file.diff.endswith("\n"):
                    click.echo()
                click.echo("```")
                click.echo()


@clinkr_operation(
    name="reconcile-diff",
    help=(
        "Emit merged PR evidence plus optional deterministic snapshot diff "
        "hints for one slug. Markdown is treated as opaque text."
    ),
    human_renderer=render_reconcile_diff,
)
def run_reconcile_diff_objective(
    ctx: click.Context,
    request: ReconcileDiffRequest,
) -> ClinkrExit[ReconcileDiffResult]:
    mctx = load_typed_context(ctx, ObjectiveCliContext)
    plan = build_reconcile_plan(mctx, request.slug)
    if len(plan.slugs) != 1:
        raise ClinkrFailure(
            error_type="diff_plan_error",
            message=f"Expected exactly one slug in {PLAN_SCHEMA} result for {request.slug!r}.",
        )
    return ClinkrExit.ok(_diff_from_slug(plan.canonical_branch, plan.slugs[0]))


def _diff_from_slug(canonical_branch: str, slug: SlugPlanItem) -> ReconcileDiffResult:
    canonical_by_file = {file.file: file for file in slug.canonical_files}
    snapshots: list[ReconcileDiffSnapshot] = []
    for snapshot in slug.included_snapshots:
        snapshot_by_file = {file.file: file for file in snapshot.files}
        snapshots.append(
            ReconcileDiffSnapshot(
                branch=snapshot.branch,
                pr_number=snapshot.pr.number,
                pr_state=snapshot.pr.state,
                pr_title=snapshot.pr.title,
                pr_url=snapshot.pr.url,
                pr_evidence=ReconcileDiffPrEvidence(
                    number=snapshot.pr.number,
                    state=snapshot.pr.state,
                    title=snapshot.pr.title,
                    url=snapshot.pr.url,
                    body=snapshot.pr_body,
                    files=tuple(_diff_changed_file(file) for file in snapshot.pr_changed_files),
                ),
                files=tuple(
                    _diff_file(
                        slug=slug.slug,
                        branch=snapshot.branch,
                        filename=filename,
                        canonical=canonical_by_file.get(filename),
                        snapshot=snapshot_by_file.get(filename),
                    )
                    for filename in _OBJECTIVE_FILES
                ),
            )
        )

    return ReconcileDiffResult(
        success=True,
        json_schema=DIFF_SCHEMA,
        slug=slug.slug,
        canonical_branch=canonical_branch,
        snapshots=tuple(snapshots),
        skipped_snapshots=tuple(_skipped_snapshot(snapshot) for snapshot in slug.skipped_snapshots),
        gaps=slug.gaps,
        conflicts=slug.conflicts,
    )


def _diff_file(
    *,
    slug: str,
    branch: str,
    filename: str,
    canonical: CanonicalFile | None,
    snapshot: CanonicalFile | None,
) -> ReconcileDiffFile:
    canonical_present = canonical is not None and canonical.present
    snapshot_present = snapshot is not None and snapshot.present
    canonical_content = canonical.content if canonical_present and canonical is not None else ""
    snapshot_content = snapshot.content if snapshot_present and snapshot is not None else ""
    changed = canonical_content != snapshot_content or canonical_present != snapshot_present
    diff = ""
    if changed:
        diff = "".join(
            difflib.unified_diff(
                canonical_content.splitlines(keepends=True),
                snapshot_content.splitlines(keepends=True),
                fromfile=f"canonical/{slug}/{filename}",
                tofile=f"{branch}/{slug}/{filename}",
                lineterm="\n",
            )
        )
    return ReconcileDiffFile(
        file=filename,
        canonical_present=canonical_present,
        snapshot_present=snapshot_present,
        changed=changed,
        diff=diff,
    )


def _diff_changed_file(file: PRChangedFile) -> ReconcileDiffChangedFile:
    return ReconcileDiffChangedFile(
        path=file.path,
        status=file.status.upper(),
    )


def _skipped_snapshot(snapshot: SkippedSnapshot) -> ReconcileDiffSkippedSnapshot:
    return ReconcileDiffSkippedSnapshot(
        branch=snapshot.branch,
        reason=snapshot.reason,
        pr_number=snapshot.pr.number,
        pr_state=snapshot.pr.state,
        pr_title=snapshot.pr.title,
        pr_url=snapshot.pr.url,
        pr_error=snapshot.pr.error,
    )


def _snapshot_heading(snapshot: ReconcileDiffSnapshot) -> str:
    if snapshot.pr_number is None:
        return snapshot.branch
    return f"PR #{snapshot.pr_number} — {snapshot.branch}"


def _render_pr_evidence(evidence: ReconcileDiffPrEvidence) -> None:
    if evidence.number is not None:
        click.echo(f"- Number: #{evidence.number}")
    if evidence.state is not None:
        click.echo(f"- State: {evidence.state}")
    if evidence.title:
        click.echo(f"- Title: {evidence.title}")
    if evidence.url:
        click.echo(f"- URL: {evidence.url}")
    click.echo()
    click.echo("#### Body")
    click.echo()
    if evidence.body:
        click.echo("```markdown")
        click.echo(evidence.body, nl=False)
        if not evidence.body.endswith("\n"):
            click.echo()
        click.echo("```")
    else:
        click.echo("(empty)")
    click.echo()
    click.echo("#### Changed files")
    click.echo()
    if not evidence.files:
        click.echo("None.")
    else:
        for file in evidence.files:
            click.echo(f"- {file.status} `{file.path}`")
    click.echo()
