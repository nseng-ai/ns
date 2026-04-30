"""Pure slot inventory derived from Git worktree state."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from twerk_core.git.git_gateway import GitGateway
from twerk_slots.naming import extract_slot_number

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
class SlotInventory:
    records: tuple[SlotRecord, ...]

    @property
    def pool_size(self) -> int:
        return len(self.records)


def build_slot_inventory(git: GitGateway) -> SlotInventory:
    records: list[SlotRecord] = []
    for wt in git.list_worktrees():
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
    return SlotInventory(records=tuple(records))
