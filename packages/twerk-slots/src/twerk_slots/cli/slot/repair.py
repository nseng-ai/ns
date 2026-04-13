from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Any

import click

from twerk_core import get_console, make_table
from twerk_core.clinkr.command import ClinkrCommandError
from twerk_core.clinkr.operation import clinkr_operation
from twerk_slots.cli.slot.context import build_slots_context
from twerk_slots.diagnostics import SyncIssue, run_sync_diagnostics
from twerk_slots.repair import (
    REPAIRABLE_CODES,
    RepairableAssignment,
    execute_repair,
    find_stale_assignments,
)
from twerk_slots.repo_context import NoRepoSentinel


@dataclass(frozen=True)
class SlotRepairRequest:
    force: Annotated[bool, click.Option(["--force"], is_flag=True, default=False)] = False
    dry_run: Annotated[bool, click.Option(["--dry-run"], is_flag=True, default=False)] = False


@dataclass(frozen=True)
class SyncIssueRow:
    code: str
    slot_name: str
    message: str
    repairable: bool


@dataclass(frozen=True)
class RepairRow:
    slot_name: str
    branch_name: str
    issue_code: str


@dataclass(frozen=True)
class SlotRepairResult:
    issues: tuple[SyncIssueRow, ...]
    repairable: tuple[RepairRow, ...]
    applied: tuple[RepairRow, ...]
    dry_run: bool

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "issues": [
                {
                    "code": i.code,
                    "slot_name": i.slot_name,
                    "message": i.message,
                    "repairable": i.repairable,
                }
                for i in self.issues
            ],
            "repairable": [
                {
                    "slot_name": r.slot_name,
                    "branch_name": r.branch_name,
                    "issue_code": r.issue_code,
                }
                for r in self.repairable
            ],
            "applied": [
                {
                    "slot_name": r.slot_name,
                    "branch_name": r.branch_name,
                    "issue_code": r.issue_code,
                }
                for r in self.applied
            ],
            "dry_run": self.dry_run,
        }


def _issue_row(issue: SyncIssue) -> SyncIssueRow:
    return SyncIssueRow(
        code=issue.code,
        slot_name=issue.slot_name,
        message=issue.message,
        repairable=issue.code in REPAIRABLE_CODES,
    )


def _repair_row(stale: RepairableAssignment) -> RepairRow:
    return RepairRow(
        slot_name=stale.assignment.slot_name,
        branch_name=stale.assignment.branch_name,
        issue_code=stale.issue_code,
    )


def render_slot_repair(result: SlotRepairResult) -> None:
    console = get_console()

    if not result.issues:
        console.print("[green]✓[/green] No issues found")
        return

    table = make_table()
    table.add_column("Code", style="yellow", no_wrap=True)
    table.add_column("Slot", style="bold cyan", no_wrap=True)
    table.add_column("Message", overflow="fold", ratio=1)
    table.add_column("Repairable", no_wrap=True)
    for issue in result.issues:
        table.add_row(
            issue.code,
            issue.slot_name,
            issue.message,
            "yes" if issue.repairable else "no",
        )
    console.print(table)

    informational = tuple(i for i in result.issues if not i.repairable)
    if informational:
        console.print(f"[yellow]{len(informational)} issue(s) require manual intervention[/yellow]")

    if not result.repairable:
        if not informational:
            console.print("[green]✓[/green] No repairable issues")
        return

    if result.applied:
        console.print(f"[green]✓[/green] Removed {len(result.applied)} stale assignment(s):")
        for row in result.applied:
            console.print(
                f"  - [bold cyan]{row.slot_name}[/bold cyan] "
                f"([yellow]{row.branch_name}[/yellow]) — {row.issue_code}"
            )
        return

    label = "[yellow][DRY RUN][/yellow] " if result.dry_run else ""
    console.print(
        f"{label}Would remove {len(result.repairable)} stale assignment(s) "
        f"(re-run with [bold]--force[/bold] to apply):"
    )
    for row in result.repairable:
        console.print(
            f"  - [bold cyan]{row.slot_name}[/bold cyan] "
            f"([yellow]{row.branch_name}[/yellow]) — {row.issue_code}"
        )


@clinkr_operation(
    name="repair",
    help="Detect and fix pool.json ↔ git inconsistencies.",
    human_renderer=render_slot_repair,
)
def run_repair_slot(request: SlotRepairRequest) -> SlotRepairResult | ClinkrCommandError:
    if request.force and request.dry_run:
        return ClinkrCommandError(
            error_type="conflicting_flags",
            message="Pass --force or --dry-run, not both.",
        )

    ctx = build_slots_context()
    if isinstance(ctx, NoRepoSentinel):
        return ClinkrCommandError(error_type="not_in_repo", message=ctx.message)

    state = ctx.pool_state.load()
    if state is None:
        return ClinkrCommandError(
            error_type="pool_not_configured",
            message="No pool configured. Run `slot assign` first.",
        )

    issues = run_sync_diagnostics(
        state=state,
        worktrees_dir=ctx.repo.worktrees_dir,
        git=ctx.git,
        storage=ctx.storage,
    )
    stale = find_stale_assignments(state, issues)

    issue_rows = tuple(_issue_row(i) for i in issues)
    repairable_rows = tuple(_repair_row(s) for s in stale)

    applied_rows: tuple[RepairRow, ...] = ()
    if request.force and stale:
        new_state = execute_repair(state, stale)
        ctx.pool_state.save(new_state)
        applied_rows = repairable_rows

    return SlotRepairResult(
        issues=issue_rows,
        repairable=repairable_rows,
        applied=applied_rows,
        dry_run=request.dry_run,
    )
