"""Worktree pool state dataclasses.

Persistence lives in :class:`twerk_slots.gateway.pool_state_gateway.PoolStateGateway`.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

DEFAULT_POOL_SIZE = 16


@dataclass(frozen=True)
class SlotAssignment:
    """A branch currently assigned to a pool slot."""

    slot_name: str
    branch_name: str
    assigned_at: str
    worktree_path: Path


@dataclass(frozen=True)
class PoolState:
    """Complete state of the worktree pool."""

    pool_size: int
    assignments: tuple[SlotAssignment, ...]
