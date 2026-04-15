from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Any

import click

from twerk_core import get_console
from twerk_core.clinkr.command import ClinkrCommandError
from twerk_core.clinkr.operation import clinkr_operation
from twerk_core.gh.types import PRState
from twerk_slots.cli.slot.context import load_slots_context
from twerk_slots.gc import SlotGcAction, SlotGcOutcome, run_gc
from twerk_slots.repo_context import NoRepoSentinel


@dataclass(frozen=True)
class SlotGcRequest:
    dry_run: Annotated[
        bool,
        click.Option(["--dry-run"], is_flag=True, default=False),
    ] = False


@dataclass(frozen=True)
class SlotGcEntryResult:
    slot_name: str
    branch_name: str
    worktree_path: str
    action: SlotGcAction
    pr_number: int | None
    pr_state: PRState | None
    pr_url: str | None
    message: str | None


@dataclass(frozen=True)
class SlotGcResult:
    entries: tuple[SlotGcEntryResult, ...]
    freed_count: int
    kept_count: int
    skipped_count: int
    error_count: int
    dry_run: bool

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "entries": [
                {
                    "slot_name": entry.slot_name,
                    "branch_name": entry.branch_name,
                    "worktree_path": entry.worktree_path,
                    "action": entry.action,
                    "pr_number": entry.pr_number,
                    "pr_state": entry.pr_state,
                    "pr_url": entry.pr_url,
                    "message": entry.message,
                }
                for entry in self.entries
            ],
            "freed_count": self.freed_count,
            "kept_count": self.kept_count,
            "skipped_count": self.skipped_count,
            "error_count": self.error_count,
            "dry_run": self.dry_run,
        }


def _verb_for_action(action: SlotGcAction) -> str:
    return {
        "freed": "Freed",
        "would_free": "Would free",
        "kept_open_pr": "Kept",
        "kept_no_pr": "Kept",
        "skipped_dirty": "Skipped dirty",
        "error": "Error",
    }[action]


def _default_message(entry: SlotGcEntryResult) -> str:
    if entry.action == "kept_open_pr" and entry.pr_number is not None:
        return f"PR #{entry.pr_number} is still open."
    if entry.action == "kept_no_pr":
        return "No PR matched the local branch head."
    if entry.action in {"freed", "would_free"} and entry.pr_number is not None:
        state = entry.pr_state.lower() if entry.pr_state is not None else "closed"
        return f"PR #{entry.pr_number} is {state}."
    return ""


def render_slot_gc(result: SlotGcResult) -> None:
    console = get_console()
    if result.dry_run:
        console.print("[yellow]Dry run: no slot assignments were changed.[/yellow]")

    for entry in result.entries:
        detail = entry.message or _default_message(entry)
        line = (
            f"{_verb_for_action(entry.action)} [bold cyan]{entry.slot_name}[/bold cyan] "
            f"([green]{entry.branch_name}[/green])"
        )
        if detail:
            line = f"{line}: {detail}"
        console.print(line)

    freed_label = "would free" if result.dry_run else "freed"
    console.print(
        f"{freed_label.capitalize()} {result.freed_count}; kept {result.kept_count}; "
        f"skipped dirty {result.skipped_count}; errors {result.error_count}."
    )


def _to_result(outcome: SlotGcOutcome) -> SlotGcResult:
    return SlotGcResult(
        entries=tuple(
            SlotGcEntryResult(
                slot_name=entry.slot_name,
                branch_name=entry.branch_name,
                worktree_path=str(entry.worktree_path),
                action=entry.action,
                pr_number=entry.pr_number,
                pr_state=entry.pr_state,
                pr_url=entry.pr_url,
                message=entry.message,
            )
            for entry in outcome.entries
        ),
        freed_count=outcome.freed_count,
        kept_count=outcome.kept_count,
        skipped_count=outcome.skipped_count,
        error_count=outcome.error_count,
        dry_run=outcome.dry_run,
    )


@clinkr_operation(
    name="gc",
    help="Garbage-collect slot assignments whose PRs are merged or closed.",
    human_renderer=render_slot_gc,
)
def run_slot_gc(
    ctx: click.Context,
    request: SlotGcRequest,
) -> SlotGcResult | ClinkrCommandError:
    slots_ctx = load_slots_context(ctx)
    if isinstance(slots_ctx, NoRepoSentinel):
        return ClinkrCommandError(error_type="not_in_repo", message=slots_ctx.message)

    state = slots_ctx.pool_state.load()
    if state is None:
        return ClinkrCommandError(
            error_type="pool_empty",
            message="No pool configured. Run `slot checkout` first.",
        )

    return _to_result(run_gc(slots_ctx, dry_run=request.dry_run))
