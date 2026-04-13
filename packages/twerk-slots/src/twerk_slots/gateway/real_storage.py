"""Real SlotsStorageGateway backed by pathlib."""

from __future__ import annotations

from pathlib import Path

from twerk_slots.gateway.storage import SlotsStorageGateway


class RealSlotsStorageGateway(SlotsStorageGateway):
    """SlotsStorageGateway that forwards to :class:`pathlib.Path`."""

    def path_exists(self, path: Path) -> bool:
        return path.exists()

    def ensure_dir(self, path: Path) -> None:
        path.mkdir(parents=True, exist_ok=True)

    def list_subdirs(self, path: Path) -> tuple[str, ...]:
        if not path.exists():
            return ()
        return tuple(entry.name for entry in path.iterdir() if entry.is_dir())
