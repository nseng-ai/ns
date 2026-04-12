"""Gateway for ``pool.json`` load/save.

Keeps the JSON-serialization concern outside :mod:`twerk_slots.pool_state`
so tests can observe pool state via an in-memory fake.
"""

from __future__ import annotations

import json
from abc import ABC, abstractmethod
from pathlib import Path

from twerk_slots.pool_state import DEFAULT_POOL_SIZE, PoolState, SlotAssignment


class PoolStateGateway(ABC):
    """Abstract read/write for pool.json."""

    @abstractmethod
    def load(self, pool_json_path: Path) -> PoolState | None:
        """Return the pool state at ``pool_json_path`` or ``None`` when absent."""

    @abstractmethod
    def save(self, pool_json_path: Path, state: PoolState) -> None:
        """Persist ``state`` at ``pool_json_path``."""


class RealPoolStateGateway(PoolStateGateway):
    """PoolStateGateway that reads and writes JSON on the real filesystem."""

    def load(self, pool_json_path: Path) -> PoolState | None:
        if not pool_json_path.exists():
            return None

        data = json.loads(pool_json_path.read_text(encoding="utf-8"))

        assignments = tuple(
            SlotAssignment(
                slot_name=a["slot_name"],
                branch_name=a["branch_name"],
                assigned_at=a["assigned_at"],
                worktree_path=Path(a["worktree_path"]),
            )
            for a in data.get("assignments", [])
        )

        return PoolState(
            pool_size=data.get("pool_size", DEFAULT_POOL_SIZE),
            assignments=assignments,
        )

    def save(self, pool_json_path: Path, state: PoolState) -> None:
        # Parent dir may not exist yet on first write; create it here so
        # callers don't have to thread a SlotsStorageGateway in solely
        # to pre-create ``~/.slots/repos/{repo}/``.
        pool_json_path.parent.mkdir(parents=True, exist_ok=True)

        data = {
            "pool_size": state.pool_size,
            "assignments": [
                {
                    "slot_name": a.slot_name,
                    "branch_name": a.branch_name,
                    "assigned_at": a.assigned_at,
                    "worktree_path": str(a.worktree_path),
                }
                for a in state.assignments
            ],
        }

        pool_json_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
