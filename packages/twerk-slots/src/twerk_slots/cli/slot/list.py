from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

from twerk_core import get_console, make_table
from twerk_core.clinkr.command import ClinkrCommandError
from twerk_core.clinkr.operation import clinkr_operation
from twerk_core.format import format_relative_time
from twerk_slots.allocation import sync_pool_assignments
from twerk_slots.cli.slot._context import build_slots_context
from twerk_slots.gateway.storage import SlotsStorageGateway
from twerk_slots.naming import generate_slot_name
from twerk_slots.pool_state import DEFAULT_POOL_SIZE, PoolState
from twerk_slots.repo_context import NoRepoSentinel

SlotStatus = Literal["unallocated", "available", "assigned"]


@dataclass(frozen=True)
class SlotListRequest:
    """No inputs — `slot list` always renders the whole pool for the repo."""


@dataclass(frozen=True)
class SlotRow:
    slot_name: str
    branch: str | None
    assigned_at: str | None
    worktree_path: str | None
    status: SlotStatus


@dataclass(frozen=True)
class SlotListResult:
    pool_size: int
    rows: tuple[SlotRow, ...]
    repo_name: str

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "repo_name": self.repo_name,
            "pool_size": self.pool_size,
            "rows": [
                {
                    "slot_name": r.slot_name,
                    "branch": r.branch,
                    "assigned_at": r.assigned_at,
                    "worktree_path": r.worktree_path,
                    "status": r.status,
                }
                for r in self.rows
            ],
        }


def render_slot_list(result: SlotListResult) -> None:
    table = make_table()
    table.add_column("Slot", style="bold cyan", no_wrap=True)
    table.add_column("Status", no_wrap=True)
    table.add_column("Branch", no_wrap=True, overflow="ellipsis", ratio=1)
    table.add_column("Assigned", no_wrap=True, style="dim", justify="right", min_width=7)
    table.add_column("Worktree", no_wrap=True, style="dim", overflow="ellipsis", ratio=1)

    for row in result.rows:
        table.add_row(
            row.slot_name,
            row.status,
            row.branch or "",
            format_relative_time(row.assigned_at) if row.assigned_at else "",
            row.worktree_path or "",
        )

    get_console().print(table)


def _compose_rows(
    state: PoolState,
    storage: SlotsStorageGateway,
    worktrees_dir: Path,
) -> tuple[SlotRow, ...]:
    by_slot = {a.slot_name: a for a in state.assignments}
    rows: list[SlotRow] = []
    for slot_num in range(1, state.pool_size + 1):
        slot_name = generate_slot_name(slot_num)
        assignment = by_slot.get(slot_name)
        if assignment is not None:
            rows.append(
                SlotRow(
                    slot_name=slot_name,
                    branch=assignment.branch_name,
                    assigned_at=assignment.assigned_at,
                    worktree_path=str(assignment.worktree_path),
                    status="assigned",
                )
            )
            continue
        worktree_path = worktrees_dir / slot_name
        if storage.path_exists(worktree_path):
            rows.append(
                SlotRow(
                    slot_name=slot_name,
                    branch=None,
                    assigned_at=None,
                    worktree_path=str(worktree_path),
                    status="available",
                )
            )
        else:
            rows.append(
                SlotRow(
                    slot_name=slot_name,
                    branch=None,
                    assigned_at=None,
                    worktree_path=None,
                    status="unallocated",
                )
            )
    return tuple(rows)


@clinkr_operation(
    name="list",
    help="List worktree pool slots.",
    aliases=("ls",),
    human_renderer=render_slot_list,
)
def run_list_slots(request: SlotListRequest) -> SlotListResult | ClinkrCommandError:
    ctx = build_slots_context()
    if isinstance(ctx, NoRepoSentinel):
        return ClinkrCommandError(error_type="not_in_repo", message=ctx.message)

    state = ctx.pool_state.load()
    if state is None:
        state = PoolState(pool_size=DEFAULT_POOL_SIZE, assignments=())
    else:
        state = sync_pool_assignments(state, ctx.git, ctx.storage, ctx.pool_state)

    return SlotListResult(
        pool_size=state.pool_size,
        rows=_compose_rows(state, ctx.storage, ctx.repo.worktrees_dir),
        repo_name=ctx.repo.repo_name,
    )
