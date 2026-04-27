from __future__ import annotations

import pytest

from brmem.key_validation import (
    InvalidKeyError,
    check_key,
    validate_key,
)

# -- check_key: accepted keys --------------------------------------------------


@pytest.mark.parametrize(
    "key",
    [
        "plan",
        "plan.md",
        "plan/plan.md",
        "a/b/c/d/e",
        "a---b",
        "a-b_c.d",
        "UPPER",
        "with.dots.many",
        "foo..bar",  # '..' inside a segment is allowed; only '..' as a full segment is rejected
        "a.locker",  # suffix is not exactly '.lock'
        ".lockfile",  # segment does not end with '.lock'
        "unicode-é-ok",
    ],
)
def test_check_key_accepts_valid(key: str) -> None:
    assert check_key(key) is None


# -- check_key: rejected keys --------------------------------------------------


@pytest.mark.parametrize(
    ("key", "expected_reason"),
    [
        ("", "key must not be empty"),
        ("/abs", "key must not start with '/'"),
        ("abs/", "key must not end with '/'"),
        ("a//b", "key must not contain '//'"),
        ("a:b", "':' is not supported in keys"),
        ("a b", "key contains forbidden character ' '"),
        ("a~b", "key contains forbidden character '~'"),
        ("a^b", "key contains forbidden character '^'"),
        ("a?b", "key contains forbidden character '?'"),
        ("a*b", "key contains forbidden character '*'"),
        ("a[b", "key contains forbidden character '['"),
        ("a\\b", "key contains forbidden character '\\\\'"),
        ("a\tb", "key contains a control character"),
        ("a\nb", "key contains a control character"),
        ("a\x00b", "key contains a control character"),
        ("a\x7fb", "key contains a control character"),
        ("foo/../escape", "key must not contain '..' segment"),
        ("..", "key must not contain '..' segment"),
        ("../foo", "key must not contain '..' segment"),
        ("foo/..", "key must not contain '..' segment"),
        ("foo.lock", "key segment must not end with '.lock'"),
        ("a/foo.lock", "key segment must not end with '.lock'"),
        ("foo.lock/a", "key segment must not end with '.lock'"),
    ],
)
def test_check_key_rejects_with_reason(key: str, expected_reason: str) -> None:
    result = check_key(key)

    assert result is not None
    assert result == f"Invalid key {key!r}: {expected_reason}"


# -- check_key: ordering of specific vs generic reasons ------------------------


def test_check_key_prefers_specific_leading_slash_over_slash_inside() -> None:
    # Both leading '/' and '//' would apply; leading check fires first.
    assert check_key("//a") == "Invalid key '//a': key must not start with '/'"


def test_check_key_prefers_specific_trailing_slash_over_slash_inside() -> None:
    # Both trailing '/' and '//' would apply; trailing check fires first.
    assert check_key("a//") == "Invalid key 'a//': key must not end with '/'"


def test_check_key_reports_colon_before_forbidden_chars_loop() -> None:
    # ':' check runs before the per-character forbidden-chars loop.
    assert check_key("a:b~c") == "Invalid key 'a:b~c': ':' is not supported in keys"


def test_check_key_reports_forbidden_char_before_dotdot_segment() -> None:
    # Per-char forbidden check runs before the '..' segment check.
    result = check_key("../ab cd")
    assert result == "Invalid key '../ab cd': key contains forbidden character ' '"


def test_check_key_reports_dotdot_before_dot_lock() -> None:
    # '..' segment check runs before the '.lock' suffix check.
    assert check_key("../a.lock") == "Invalid key '../a.lock': key must not contain '..' segment"


# -- validate_key: raising behaviour -------------------------------------------


def test_validate_key_returns_none_for_valid_key() -> None:
    assert validate_key("plan/plan.md") is None


def test_validate_key_raises_invalid_key_error_with_attributes() -> None:
    with pytest.raises(InvalidKeyError) as exc_info:
        validate_key("a:b")

    err = exc_info.value
    assert err.key == "a:b"
    assert err.reason == "':' is not supported in keys"
    assert str(err) == "Invalid key 'a:b': ':' is not supported in keys"


def test_invalid_key_error_is_value_error() -> None:
    assert issubclass(InvalidKeyError, ValueError)
