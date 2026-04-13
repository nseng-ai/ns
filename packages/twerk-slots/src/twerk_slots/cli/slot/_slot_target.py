"""Shared slot-identification logic for CLI commands that target one slot.

Commands like ``slot free`` and ``slot goto`` both accept mutually-exclusive
``--num`` / ``--wt`` flags. Keeping the validation in one place ensures the
two CLIs stay in lockstep.
"""

from __future__ import annotations

from twerk_core.clinkr.command import ClinkrCommandError
from twerk_slots.naming import extract_slot_number, generate_slot_name


def resolve_slot_target(
    *,
    num: int | None,
    wt: str | None,
    pool_size: int,
) -> str | ClinkrCommandError:
    """Turn ``(num, wt)`` into a canonical slot name or a user-facing error.

    Exactly one of ``num`` or ``wt`` must be provided. ``num`` is validated
    against ``pool_size``; ``wt`` is validated as a canonically-formatted
    slot name.
    """
    if num is not None and wt is not None:
        return ClinkrCommandError(
            error_type="conflicting_slot_args",
            message="Pass exactly one of --num or --wt, not both.",
        )
    if num is not None:
        if not (1 <= num <= pool_size):
            return ClinkrCommandError(
                error_type="invalid_slot_num",
                message=f"--num must be in 1..{pool_size} (got {num}).",
            )
        return generate_slot_name(num)
    if wt is not None:
        if extract_slot_number(wt) is None:
            return ClinkrCommandError(
                error_type="invalid_slot_wt",
                message=f"--wt '{wt}' is not a valid slot name (e.g. 'slot-01').",
            )
        return wt
    return ClinkrCommandError(
        error_type="missing_slot_arg",
        message="Pass one of --num or --wt to identify the slot.",
    )
