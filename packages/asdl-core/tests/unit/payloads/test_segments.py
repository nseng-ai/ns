"""Tests for payload safe-segment validation."""

from __future__ import annotations

import pytest

from asdl_core.payloads.segments import is_safe_segment, require_safe_segment


@pytest.mark.parametrize(
    "value",
    [
        "a",
        "z9",
        "abc-123",
        "abc_def",
        "abc.def",
        "a" * 128,
    ],
)
def test_is_safe_segment_accepts_safe_segments(value: str) -> None:
    assert is_safe_segment(value)


@pytest.mark.parametrize(
    "value",
    [
        "",
        "ABC",
        "abc/def",
        "abc def",
        ".abc",
        "_abc",
        "-abc",
        "a" * 129,
    ],
)
def test_is_safe_segment_rejects_unsafe_segments(value: str) -> None:
    assert not is_safe_segment(value)


def test_require_safe_segment_returns_valid_value_unchanged() -> None:
    assert require_safe_segment("abc-123", label="descriptor") == "abc-123"


def test_require_safe_segment_raises_value_error_with_label_for_invalid_value() -> None:
    with pytest.raises(ValueError, match="descriptor"):
        require_safe_segment("Bad", label="descriptor")
