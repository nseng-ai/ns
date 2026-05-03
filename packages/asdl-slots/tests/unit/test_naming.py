from __future__ import annotations

import pytest

from asdl_slots.naming import extract_slot_number, generate_slot_name


@pytest.mark.parametrize(
    ("slot_number", "expected"),
    [
        (1, "slot-01"),
        (9, "slot-09"),
        (10, "slot-10"),
        (16, "slot-16"),
        (99, "slot-99"),
    ],
)
def test_generate_slot_name(slot_number: int, expected: str) -> None:
    assert generate_slot_name(slot_number) == expected


@pytest.mark.parametrize(
    ("slot_name", "expected"),
    [
        ("slot-01", "01"),
        ("slot-16", "16"),
        ("slot-99", "99"),
        ("slot-1", None),  # must be zero-padded
        ("slot-100", None),  # three digits not supported
        ("not-a-slot", None),
        ("slot-ab", None),
        ("", None),
    ],
)
def test_extract_slot_number(slot_name: str, expected: str | None) -> None:
    assert extract_slot_number(slot_name) == expected
