from __future__ import annotations

from pathlib import Path

from asdl_slots.gateway.storage import SlotsStorageGateway


class RealSlotsStorageGateway(SlotsStorageGateway):
    def path_exists(self, path: Path) -> bool:
        return path.exists()

    def ensure_dir(self, path: Path) -> None:
        path.mkdir(parents=True, exist_ok=True)
