"""Shared Objective record path helpers."""

from __future__ import annotations

from pathlib import Path

ACTIVE_OBJECTIVE_ROOT = Path(".asdl") / "objectives"
OBJECTIVE_ARCHIVE_ROOT = Path(".asdl") / "objective-archive"


def active_objective_record_path(slug: str) -> Path:
    return ACTIVE_OBJECTIVE_ROOT / slug


def archived_objective_record_path(slug: str) -> Path:
    return OBJECTIVE_ARCHIVE_ROOT / slug


def is_valid_objective_slug(slug: str) -> bool:
    return slug not in {"", ".", ".."} and "/" not in slug and "\\" not in slug
