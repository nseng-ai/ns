from __future__ import annotations

import pytest

from brmem.content_limits import (
    BINARY_SNIFF_BYTES,
    MAX_ENTRY_BYTES,
    check_entry_not_binary,
    check_entry_size,
    format_bytes,
)

# -- check_entry_size ----------------------------------------------------------


def test_check_entry_size_accepts_empty() -> None:
    assert check_entry_size(b"") is None


def test_check_entry_size_accepts_under_cap() -> None:
    assert check_entry_size(b"x" * (MAX_ENTRY_BYTES - 1)) is None


def test_check_entry_size_accepts_exactly_at_cap() -> None:
    assert check_entry_size(b"x" * MAX_ENTRY_BYTES) is None


def test_check_entry_size_rejects_one_byte_over() -> None:
    result = check_entry_size(b"x" * (MAX_ENTRY_BYTES + 1))

    assert result is not None
    assert "capped at 1 MiB" in result
    assert "1.0 MiB" in result


# -- check_entry_not_binary ----------------------------------------------------


def test_check_entry_not_binary_accepts_empty() -> None:
    assert check_entry_not_binary(b"") is None


def test_check_entry_not_binary_accepts_pure_ascii() -> None:
    assert check_entry_not_binary(b"hello world\n") is None


def test_check_entry_not_binary_accepts_multibyte_utf8() -> None:
    # "café" + emoji — multibyte UTF-8, no NUL bytes
    assert check_entry_not_binary("café 🎉\n".encode()) is None


def test_check_entry_not_binary_rejects_nul_at_offset_zero() -> None:
    result = check_entry_not_binary(b"\x00rest")

    assert result is not None
    assert "offset 0" in result


def test_check_entry_not_binary_rejects_nul_at_last_sniffed_byte() -> None:
    # NUL at the final byte still in the sniff window
    raw = b"x" * (BINARY_SNIFF_BYTES - 1) + b"\x00" + b"y" * 32
    result = check_entry_not_binary(raw)

    assert result is not None
    assert f"offset {BINARY_SNIFF_BYTES - 1}" in result


def test_check_entry_not_binary_accepts_nul_just_past_sniff_window() -> None:
    # NUL just past the sniff window must pass — the heuristic only looks at
    # the first BINARY_SNIFF_BYTES bytes, by design.
    raw = b"x" * BINARY_SNIFF_BYTES + b"\x00" + b"y" * 32
    assert check_entry_not_binary(raw) is None


# -- format_bytes --------------------------------------------------------------


@pytest.mark.parametrize(
    ("n", "expected"),
    [
        (0, "0 B"),
        (47, "47 B"),
        (1023, "1023 B"),
        (1024, "1 KiB"),
        (1_500_000, "1.4 MiB"),
        (1 << 20, "1.0 MiB"),
    ],
)
def test_format_bytes(n: int, expected: str) -> None:
    assert format_bytes(n) == expected
