"""Pure slot inventory derived from Git worktree state."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from asdl_core.git.git_gateway import GitGateway
from asdl_core.git.types import WorktreeInfo
from asdl_slots.naming import extract_slot_number

InventoryStatus = Literal["assigned", "available"]


@dataclass(frozen=True)
class SlotRecord:
    slot_name: str
    slot_number: int
    path: Path
    branch: str | None

    @property
    def status(self) -> InventoryStatus:
        return "assigned" if self.branch is not None else "available"


@dataclass(frozen=True)
class SlotMatch:
    """Result of ``find_by_branch`` when the branch lives in a managed slot."""

    record: SlotRecord


@dataclass(frozen=True)
class MainWorktreeMatch:
    """Result of ``find_by_branch`` when the branch lives in the main worktree."""

    worktree: WorktreeInfo


@dataclass(frozen=True)
class SlotInventory:
    records: tuple[SlotRecord, ...]
    main_worktree: WorktreeInfo | None = None

    @property
    def pool_size(self) -> int:
        return len(self.records)

    def find_by_branch(self, branch_name: str) -> SlotMatch | MainWorktreeMatch | None:
        for record in self.records:
            if record.branch == branch_name:
                return SlotMatch(record=record)
        if self.main_worktree is not None and self.main_worktree.branch == branch_name:
            return MainWorktreeMatch(worktree=self.main_worktree)
        return None

    def find_by_slot(self, slot_name: str) -> SlotRecord | None:
        for record in self.records:
            if record.slot_name == slot_name:
                return record
        return None

    def lowest_available(self, git: GitGateway) -> SlotRecord | None:
        for record in self.records:
            if record.branch is not None:
                continue
            if git.has_uncommitted_changes(record.path):
                continue
            return record
        return None


def build_slot_inventory(
    git: GitGateway,
    *,
    main_repo_root: Path | None = None,
) -> SlotInventory:
    records: list[SlotRecord] = []
    main_worktree: WorktreeInfo | None = None
    for wt in git.list_worktrees():
        if main_repo_root is not None and wt.path == main_repo_root:
            main_worktree = wt
            continue
        suffix = extract_slot_number(wt.path.name)
        if suffix is None:
            continue
        records.append(
            SlotRecord(
                slot_name=wt.path.name,
                slot_number=int(suffix),
                path=wt.path,
                branch=wt.branch,
            )
        )
    records.sort(key=lambda r: r.slot_number)
    return SlotInventory(records=tuple(records), main_worktree=main_worktree)
