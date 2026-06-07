"""Shared string normalization helpers for pr-address CLI operations."""

from __future__ import annotations


def trim_optional(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    if not stripped:
        return None
    return stripped


def trim_required(value: str | None) -> str:
    trimmed = trim_optional(value)
    if trimmed is None:
        return ""
    return trimmed
