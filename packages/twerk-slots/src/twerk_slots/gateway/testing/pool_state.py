"""In-memory FakePoolStateGateway used by slots tests."""

from __future__ import annotations

from pathlib import Path

from twerk_slots.gateway.pool_state_gateway import PoolStateGateway
from twerk_slots.pool_state import PoolState


class FakePoolStateGateway(PoolStateGateway):
    """PoolStateGateway bound to a single ``pool.json`` path."""

    def __init__(self, pool_json_path: Path, *, initial_state: PoolState | None = None) -> None:
        self._pool_json_path = pool_json_path
        self._state: PoolState | None = initial_state
        self._save_calls: list[PoolState] = []

    @property
    def pool_json_path(self) -> Path:
        return self._pool_json_path

    def load(self) -> PoolState | None:
        return self._state

    def save(self, state: PoolState) -> None:
        self._save_calls.append(state)
        self._state = state
