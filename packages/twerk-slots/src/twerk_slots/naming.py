"""Pure naming utilities for pool slots.

All functions are pure (no I/O) and rely only on the standard library.
"""

from __future__ import annotations

import re

SLOT_NAME_PREFIX = "slot"
_PLACEHOLDER_RE = re.compile(r"^__slot-\d+-br-stub__$")


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


def get_placeholder_branch_name(slot_name: str) -> str | None:
    """Return the placeholder branch name for a slot, if the name is valid."""
    slot_number = extract_slot_number(slot_name)
    if slot_number is None:
        return None
    return f"__slot-{slot_number}-br-stub__"


def is_placeholder_branch(branch_name: str) -> bool:
    """Return True when the branch looks like a slot placeholder branch."""
    return bool(_PLACEHOLDER_RE.match(branch_name))
