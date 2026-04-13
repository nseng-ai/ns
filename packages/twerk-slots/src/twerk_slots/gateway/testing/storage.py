"""In-memory FakeSlotsStorageGateway used by slots tests.

Constructor-only configuration with a mutation log for assertions, mirroring
the :class:`FakeGitGateway` shape.
"""

from __future__ import annotations

from collections.abc import Iterable
from pathlib import Path

from twerk_slots.gateway.storage import SlotsStorageGateway


class FakeSlotsStorageGateway(SlotsStorageGateway):
    """SlotsStorageGateway backed by a pair of in-memory sets."""

    def __init__(self, *, existing_paths: Iterable[Path] = ()) -> None:
        self._existing_paths: set[Path] = set(existing_paths)
        self._ensured_dirs: list[Path] = []

    def path_exists(self, path: Path) -> bool:
        return path in self._existing_paths

    def ensure_dir(self, path: Path) -> None:
        self._ensured_dirs.append(path)
        self._existing_paths.add(path)

    def list_subdirs(self, path: Path) -> tuple[str, ...]:
        if path not in self._existing_paths:
            return ()
        return tuple(
            sorted(
                {entry.name for entry in self._existing_paths if entry.parent == path},
            )
        )
