"""Garbage-collect handoff artifacts for deleted local branches."""

from __future__ import annotations

import sys
from typing import Annotated, Literal

import click

from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_handoff.cli.handoff.brmem_gateway import BrmemGatewayError, KeyNotFoundError
from asdl_handoff.cli.handoff.context import HandoffCliContext, load_handoff_context
from asdl_handoff.cli.handoff.inventory import (
    HANDOFF_NAMESPACE,
    BranchState,
    HandoffSummary,
    collect_handoff_summaries,
)

GcHandoffAction = Literal["kept_active", "would_delete", "deleted", "error"]


class GcHandoffsRequest(ClinkrModel):
    dry_run: Annotated[
        bool,
        click.Option(["--dry-run"], is_flag=True, default=False),
    ] = False
    force: Annotated[
        bool,
        click.Option(["-f", "--force"], is_flag=True, default=False),
    ] = False


class GcHandoffResultEntry(ClinkrModel):
    branch: str
    branch_state: BranchState
    slug: str
    key: str
    entry_locator: str
    action: GcHandoffAction
    commit: str | None = None
    message: str | None = None


class GcHandoffsResult(ClinkrModel):
    entries: list[GcHandoffResultEntry]
    would_delete_count: int
    deleted_count: int
    kept_count: int
    error_count: int
    dry_run: bool
    cancelled: bool = False


def render_gc_handoffs(result: GcHandoffsResult, *, err: bool = False) -> None:
    if result.cancelled:
        click.echo("Cancelled — no handoffs deleted.", err=err)
        return

    candidates = _candidate_entries(result)
    if not candidates:
        click.echo("No handoffs for deleted branches.", err=err)
        _render_summary(result, err=err)
        return

    if result.would_delete_count > 0:
        click.echo(
            f"Would delete {result.would_delete_count} handoff(s) for deleted branches:",
            err=err,
        )
    else:
        click.echo(
            f"Deleted {result.deleted_count} handoff(s) for deleted branches:",
            err=err,
        )

    for entry in candidates:
        _render_gc_entry(entry, err=err)
    click.echo(err=err)
    _render_summary(result, err=err)


@clinkr_operation(
    name="gc",
    help="Delete handoffs whose local branch no longer exists.",
    human_renderer=render_gc_handoffs,
)
def run_gc_handoffs(ctx: click.Context, request: GcHandoffsRequest) -> ClinkrExit[GcHandoffsResult]:
    handoff_context = load_handoff_context(ctx)

    Ensure.true(
        not (request.dry_run and request.force),
        error_type="conflicting_flags",
        message="--dry-run and --force are mutually exclusive.",
    )

    summaries = _load_all_handoff_summaries(handoff_context)
    preview = _preview_result(summaries, dry_run=request.dry_run)

    if request.dry_run or preview.would_delete_count == 0:
        return ClinkrExit.ok(preview)

    if request.force:
        return ClinkrExit.ok(_delete_deleted_branch_handoffs(handoff_context, summaries))

    render_gc_handoffs(preview, err=True)
    sys.stderr.flush()
    if _confirm_delete_handoffs(preview.would_delete_count):
        return ClinkrExit.ok(_delete_deleted_branch_handoffs(handoff_context, summaries))

    return ClinkrExit.ok(
        _result_from_entries(
            preview.entries,
            dry_run=False,
            cancelled=True,
        )
    )


def _load_all_handoff_summaries(context: HandoffCliContext) -> list[HandoffSummary]:
    try:
        entries = context.brmem_gateway.list_entries(namespace=HANDOFF_NAMESPACE, branch=None)
        return collect_handoff_summaries(entries, context.brmem_gateway, context.git_gateway)
    except BrmemGatewayError as exc:
        Ensure.fail(error_type=exc.error_type, message=f"Failed to load handoffs: {exc.message}")


def _preview_result(summaries: list[HandoffSummary], *, dry_run: bool) -> GcHandoffsResult:
    entries = [
        _entry_from_summary(
            summary,
            action="would_delete" if summary.branch_state == "deleted" else "kept_active",
        )
        for summary in summaries
    ]
    return _result_from_entries(entries, dry_run=dry_run)


def _delete_deleted_branch_handoffs(
    context: HandoffCliContext,
    summaries: list[HandoffSummary],
) -> GcHandoffsResult:
    entries: list[GcHandoffResultEntry] = []
    for summary in summaries:
        if summary.branch_state == "active":
            entries.append(_entry_from_summary(summary, action="kept_active"))
            continue

        try:
            commit = context.brmem_gateway.delete(HANDOFF_NAMESPACE, summary.key, summary.branch)
        except KeyNotFoundError as exc:
            entries.append(
                _entry_from_summary(
                    summary,
                    action="error",
                    message=f"Handoff disappeared before deletion: {exc}",
                )
            )
            continue
        except BrmemGatewayError as exc:
            entries.append(
                _entry_from_summary(
                    summary,
                    action="error",
                    message=f"Failed to delete handoff: {exc.message}",
                )
            )
            continue

        entries.append(_entry_from_summary(summary, action="deleted", commit=commit))

    return _result_from_entries(entries, dry_run=False)


def _entry_from_summary(
    summary: HandoffSummary,
    *,
    action: GcHandoffAction,
    commit: str | None = None,
    message: str | None = None,
) -> GcHandoffResultEntry:
    return GcHandoffResultEntry(
        branch=summary.branch,
        branch_state=summary.branch_state,
        slug=summary.slug,
        key=summary.key,
        entry_locator=summary.entry_locator,
        action=action,
        commit=commit,
        message=message,
    )


def _result_from_entries(
    entries: list[GcHandoffResultEntry],
    *,
    dry_run: bool,
    cancelled: bool = False,
) -> GcHandoffsResult:
    return GcHandoffsResult(
        entries=entries,
        would_delete_count=sum(1 for entry in entries if entry.action == "would_delete"),
        deleted_count=sum(1 for entry in entries if entry.action == "deleted"),
        kept_count=sum(1 for entry in entries if entry.action == "kept_active"),
        error_count=sum(1 for entry in entries if entry.action == "error"),
        dry_run=dry_run,
        cancelled=cancelled,
    )


def _candidate_entries(result: GcHandoffsResult) -> list[GcHandoffResultEntry]:
    return [
        entry for entry in result.entries if entry.action in ("would_delete", "deleted", "error")
    ]


def _render_gc_entry(entry: GcHandoffResultEntry, *, err: bool) -> None:
    label = entry.action.replace("_", " ")
    line = f"  {label} {entry.branch_state} {entry.branch} {entry.slug}"
    if entry.message is not None:
        line = f"{line}: {entry.message}"
    click.echo(line, err=err)


def _render_summary(result: GcHandoffsResult, *, err: bool) -> None:
    click.echo(
        f"Would delete {result.would_delete_count}; "
        f"deleted {result.deleted_count}; "
        f"kept {result.kept_count}; "
        f"errors {result.error_count}",
        err=err,
    )


def _confirm_delete_handoffs(count: int) -> bool:
    while True:
        click.echo(f"Delete {count} handoff(s)? [y/N]: ", err=True, nl=False)
        sys.stderr.flush()
        raw_value = sys.stdin.readline()
        if raw_value == "":
            raise click.Abort()

        value = raw_value.strip().lower()
        if value in ("y", "yes"):
            return True
        if value in ("", "n", "no"):
            return False
        click.echo("Error: invalid input", err=True)
