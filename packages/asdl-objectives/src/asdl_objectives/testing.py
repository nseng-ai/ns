"""Shared test helpers for ``asdl_objectives`` tests."""

from __future__ import annotations

from pathlib import Path

from asdl_core.git.types import PathChangeTouch


def change_touch(
    oid: str,
    *,
    paths: tuple[str, ...],
    committed_iso: str = "2026-05-20T10:00:00Z",
) -> PathChangeTouch:
    return PathChangeTouch(oid=oid, committed_iso=committed_iso, paths=paths)


def write_objective_record(
    root: Path,
    slug: str,
    *,
    closed: bool = False,
    updates: tuple[str, ...] = (),
) -> Path:
    path = root / slug
    path.mkdir(parents=True)
    (path / "objective.md").write_text(f"# {slug}\n", encoding="utf-8")
    (path / "roadmap.md").write_text("# Roadmap\n", encoding="utf-8")
    updates_dir = path / "updates"
    updates_dir.mkdir()
    for update_name in updates:
        (updates_dir / update_name).write_text("# Update\n", encoding="utf-8")
    if closed:
        (path / "closed.md").write_text("closed\n", encoding="utf-8")
    return path
