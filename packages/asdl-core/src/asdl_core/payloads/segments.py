"""Safe path segment validation for payload side-channel identifiers."""

from __future__ import annotations

import re

SAFE_SEGMENT_PATTERN_TEXT = r"^[a-z0-9][a-z0-9._-]{0,127}$"


def is_safe_segment(value: str) -> bool:
    """Return whether ``value`` satisfies the shared safe-segment contract."""

    return re.fullmatch(SAFE_SEGMENT_PATTERN_TEXT, value) is not None


def require_safe_segment(value: str, *, label: str) -> str:
    """Return ``value`` if safe, otherwise raise ``ValueError`` with ``label`` context."""

    if is_safe_segment(value):
        return value
    raise ValueError(
        f"{label} must match safe segment pattern {SAFE_SEGMENT_PATTERN_TEXT!r}: {value!r}"
    )
