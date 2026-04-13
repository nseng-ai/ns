from __future__ import annotations

from twerk_core.clinkr.command import ClinkrCommandError
from twerk_slots.cli.slot._slot_target import resolve_slot_target


def test_resolve_num_in_range_returns_slot_name() -> None:
    assert resolve_slot_target(num=3, wt=None, pool_size=4) == "slot-03"


def test_resolve_num_equal_to_pool_size() -> None:
    assert resolve_slot_target(num=4, wt=None, pool_size=4) == "slot-04"


def test_resolve_num_equal_to_one() -> None:
    assert resolve_slot_target(num=1, wt=None, pool_size=4) == "slot-01"


def test_resolve_valid_wt_returns_it_unchanged() -> None:
    assert resolve_slot_target(num=None, wt="slot-02", pool_size=4) == "slot-02"


def test_resolve_num_zero_errors() -> None:
    result = resolve_slot_target(num=0, wt=None, pool_size=4)
    assert isinstance(result, ClinkrCommandError)
    assert result.error_type == "invalid_slot_num"
    assert "1..4" in result.message


def test_resolve_num_above_pool_size_errors() -> None:
    result = resolve_slot_target(num=99, wt=None, pool_size=4)
    assert isinstance(result, ClinkrCommandError)
    assert result.error_type == "invalid_slot_num"
    assert "99" in result.message


def test_resolve_invalid_wt_errors() -> None:
    result = resolve_slot_target(num=None, wt="bogus", pool_size=4)
    assert isinstance(result, ClinkrCommandError)
    assert result.error_type == "invalid_slot_wt"
    assert "bogus" in result.message


def test_resolve_conflicting_flags_errors() -> None:
    result = resolve_slot_target(num=1, wt="slot-01", pool_size=4)
    assert isinstance(result, ClinkrCommandError)
    assert result.error_type == "conflicting_slot_args"
    assert "not both" in result.message


def test_resolve_missing_flags_errors() -> None:
    result = resolve_slot_target(num=None, wt=None, pool_size=4)
    assert isinstance(result, ClinkrCommandError)
    assert result.error_type == "missing_slot_arg"
    assert "--num or --wt" in result.message
