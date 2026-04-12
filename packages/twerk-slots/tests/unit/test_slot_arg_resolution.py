from __future__ import annotations

from twerk_slots.cli.slot.free import _resolve_slot_arg


def test_resolve_slot_arg_accepts_digit() -> None:
    assert _resolve_slot_arg("3", pool_size=16) == "slot-03"


def test_resolve_slot_arg_accepts_digit_at_pool_size_boundary() -> None:
    assert _resolve_slot_arg("16", pool_size=16) == "slot-16"


def test_resolve_slot_arg_accepts_canonical_name() -> None:
    assert _resolve_slot_arg("slot-03", pool_size=16) == "slot-03"


def test_resolve_slot_arg_rejects_zero() -> None:
    # Slot numbers are 1-based.
    assert _resolve_slot_arg("0", pool_size=16) is None


def test_resolve_slot_arg_rejects_out_of_range_digit() -> None:
    assert _resolve_slot_arg("99", pool_size=16) is None


def test_resolve_slot_arg_rejects_non_digit_garbage() -> None:
    assert _resolve_slot_arg("foo", pool_size=16) is None


def test_resolve_slot_arg_rejects_unpadded_name() -> None:
    # extract_slot_number requires zero-padded 2-digit suffix.
    assert _resolve_slot_arg("slot-3", pool_size=16) is None


def test_resolve_slot_arg_rejects_empty_string() -> None:
    assert _resolve_slot_arg("", pool_size=16) is None
