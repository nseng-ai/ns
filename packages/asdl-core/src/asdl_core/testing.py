from __future__ import annotations

from pathlib import Path


def symlink_or_skip(link_path: Path, target_path: Path, *, target_is_directory: bool) -> None:
    try:
        link_path.symlink_to(target_path, target_is_directory=target_is_directory)
    except OSError as exc:
        import pytest

        pytest.skip(f"symlink creation is unavailable: {exc}")
