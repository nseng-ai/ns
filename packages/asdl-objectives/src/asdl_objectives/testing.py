"""Shared test helpers for ``asdl_objectives`` tests."""

from __future__ import annotations

from asdl_core.git.types import PathChangeTouch


def change_touch(
    oid: str,
    *,
    paths: tuple[str, ...],
    committed_iso: str = "2026-05-20T10:00:00Z",
) -> PathChangeTouch:
    return PathChangeTouch(oid=oid, committed_iso=committed_iso, paths=paths)
