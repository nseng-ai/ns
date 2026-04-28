"""Gateway for ``pool.json`` load/save.

Keeps the JSON-serialization concern outside :mod:`twerk_slots.pool_state`
so tests can observe pool state via an in-memory fake. Concrete gateways
bind to a specific ``pool_json_path`` at construction time so callers
don't have to thread the path through every load/save.
"""

from __future__ import annotations

import json
from abc import ABC, abstractmethod
from pathlib import Path

from twerk_slots.pool_state import DEFAULT_POOL_SIZE, PoolState, SlotAssignment


class PoolStateGateway(ABC):
    """Abstract read/write for a specific ``pool.json``."""

    @abstractmethod
    def load(self) -> PoolState:
        """Return the pool state at the bound path.

        Returns a default ``PoolState`` (``pool_size=DEFAULT_POOL_SIZE``,
        no assignments) when no state has been persisted yet — callers
        that need to distinguish "never initialized" from "empty pool"
        should check :meth:`exists` first.
        """

    @abstractmethod
    def exists(self) -> bool: ...

    @abstractmethod
    def save(self, state: PoolState) -> None: ...


class RealPoolStateGateway(PoolStateGateway):
    """PoolStateGateway that reads and writes JSON on the real filesystem."""

    def __init__(self, pool_json_path: Path) -> None:
        self._pool_json_path = pool_json_path

    def load(self) -> PoolState:
        if not self._pool_json_path.exists():
            return PoolState(pool_size=DEFAULT_POOL_SIZE, assignments=())

        data = json.loads(self._pool_json_path.read_text(encoding="utf-8"))

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

    def exists(self) -> bool:
        return self._pool_json_path.exists()

    def save(self, state: PoolState) -> None:
        # Parent dir may not exist yet on first write; create it here so
        # callers don't have to thread a SlotsStorageGateway in solely
        # to pre-create ``~/.slots/repos/{repo}/``.
        self._pool_json_path.parent.mkdir(parents=True, exist_ok=True)

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

        self._pool_json_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
