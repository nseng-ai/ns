"""In-memory FakePoolStateGateway used by slots tests."""

from __future__ import annotations

from pathlib import Path

from twerk_slots.gateway.pool_state_gateway import PoolStateGateway
from twerk_slots.pool_state import PoolState


class FakePoolStateGateway(PoolStateGateway):
    """PoolStateGateway backed by a path-keyed dict."""

    def __init__(self, *, states: dict[Path, PoolState] | None = None) -> None:
        self._states: dict[Path, PoolState] = dict(states or {})
        self._save_calls: list[tuple[Path, PoolState]] = []

    def load(self, pool_json_path: Path) -> PoolState | None:
        return self._states.get(pool_json_path)

    def save(self, pool_json_path: Path, state: PoolState) -> None:
        self._save_calls.append((pool_json_path, state))
        self._states[pool_json_path] = state
