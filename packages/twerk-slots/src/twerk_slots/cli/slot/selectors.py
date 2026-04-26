"""Shared validation helpers for existing-slot selectors (`-n`, `-w`, `-c`).

Used by commands that operate on an already-assigned slot (`slot free`,
`slot goto`). Each helper returns a discriminated result so callers can
pick their own aggregation strategy: `slot free` batches every error into
one combined message, `slot goto` fail-fasts with command-specific
`error_type` codes.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from twerk_slots.naming import extract_slot_number, generate_slot_name


@dataclass(frozen=True)
class SelectorOk:
    slot_name: str


@dataclass(frozen=True)
class SelectorError:
    message: str


SelectorResult = SelectorOk | SelectorError


def resolve_num(num: int, pool_size: int) -> SelectorResult:
    if not (1 <= num <= pool_size):
        return SelectorError(f"--num must be in 1..{pool_size} (got {num}).")
    return SelectorOk(generate_slot_name(num))


def resolve_wt(wt: str) -> SelectorResult:
    if extract_slot_number(wt) is None:
        return SelectorError(f"--wt '{wt}' is not a valid slot name (e.g. 'slot-01').")
    return SelectorOk(wt)


def resolve_current(cwd: Path) -> SelectorResult:
    if extract_slot_number(cwd.name) is None:
        return SelectorError(
            f"--current requires running from a slot worktree; "
            f"cwd '{cwd}' is not a slot directory (e.g. 'slot-01')."
        )
    return SelectorOk(cwd.name)
