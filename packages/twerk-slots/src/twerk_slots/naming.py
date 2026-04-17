"""Pure naming utilities for pool slots.

All functions are pure (no I/O) and rely only on the standard library.
"""

from __future__ import annotations

SLOT_NAME_PREFIX = "slot"


def generate_slot_name(slot_number: int) -> str:
    """Return the canonical slot name for a 1-based slot number."""
    return f"{SLOT_NAME_PREFIX}-{slot_number:02d}"


def extract_slot_number(slot_name: str) -> str | None:
    """Extract the zero-padded slot number suffix from a slot name."""
    if not slot_name.startswith(SLOT_NAME_PREFIX + "-"):
        return None
    suffix = slot_name[len(SLOT_NAME_PREFIX) + 1 :]
    if len(suffix) != 2 or not suffix.isdigit():
        return None
    return suffix
