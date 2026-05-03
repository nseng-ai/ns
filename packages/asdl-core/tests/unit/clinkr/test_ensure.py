from __future__ import annotations

from dataclasses import dataclass
from typing import NamedTuple

import pytest

from asdl_core.clinkr.ensure import Ensure
from asdl_core.clinkr.failure import ClinkrFailure

# -- Ensure.true -------------------------------------------------------------


def test_true_is_a_noop_when_condition_holds() -> None:
    Ensure.true(True, error_type="bad", message="should not raise")


def test_true_raises_when_condition_fails() -> None:
    with pytest.raises(ClinkrFailure) as excinfo:
        Ensure.true(False, error_type="bad", message="boom")

    assert excinfo.value.error_type == "bad"
    assert excinfo.value.message == "boom"


# -- Ensure.truthy -----------------------------------------------------------


def test_truthy_returns_value_when_truthy() -> None:
    result = Ensure.truthy([1, 2], error_type="empty", message="boom")

    assert result == [1, 2]


def test_truthy_raises_when_falsy() -> None:
    with pytest.raises(ClinkrFailure) as excinfo:
        Ensure.truthy([], error_type="empty", message="boom")

    assert excinfo.value.error_type == "empty"
    assert excinfo.value.message == "boom"


# -- Ensure.not_none ---------------------------------------------------------


def test_not_none_returns_value_when_set() -> None:
    value: str | None = "hello"

    result = Ensure.not_none(value, error_type="missing", message="boom")

    assert result == "hello"


def test_not_none_raises_when_none() -> None:
    value: str | None = None

    with pytest.raises(ClinkrFailure) as excinfo:
        Ensure.not_none(value, error_type="missing", message="boom")

    assert excinfo.value.error_type == "missing"
    assert excinfo.value.message == "boom"


# -- Ensure.inst -------------------------------------------------------------


def test_inst_returns_value_when_isinstance() -> None:
    value: object = {"k": 1}

    result = Ensure.inst(value, dict, error_type="bad_shape", message="boom")

    assert result == {"k": 1}


def test_inst_raises_when_not_isinstance() -> None:
    value: object = [1, 2]

    with pytest.raises(ClinkrFailure) as excinfo:
        Ensure.inst(value, dict, error_type="bad_shape", message="boom")

    assert excinfo.value.error_type == "bad_shape"
    assert excinfo.value.message == "boom"


# -- Ensure.ideal_state ------------------------------------------------------


class _Ideal(NamedTuple):
    payload: str


@dataclass(frozen=True)
class _NisFailureWithFields:
    error_type: str
    message: str


@dataclass(frozen=True)
class _NisFailureWithProperties:
    branch: str

    @property
    def error_type(self) -> str:
        return "no_objective_on_branch"

    @property
    def message(self) -> str:
        return f"No objective on branch {self.branch!r}."


def test_ideal_state_returns_value_when_ideal() -> None:
    value: _Ideal | _NisFailureWithFields = _Ideal(payload="ok")

    result = Ensure.ideal_state(value)

    assert result == _Ideal(payload="ok")


def test_ideal_state_raises_with_field_based_failure() -> None:
    value: _Ideal | _NisFailureWithFields = _NisFailureWithFields(
        error_type="git_failed", message="fatal: bad rev"
    )

    with pytest.raises(ClinkrFailure) as excinfo:
        Ensure.ideal_state(value)

    assert excinfo.value.error_type == "git_failed"
    assert excinfo.value.message == "fatal: bad rev"


def test_ideal_state_raises_with_property_based_failure() -> None:
    value: _Ideal | _NisFailureWithProperties = _NisFailureWithProperties(branch="feat/x")

    with pytest.raises(ClinkrFailure) as excinfo:
        Ensure.ideal_state(value)

    assert excinfo.value.error_type == "no_objective_on_branch"
    assert excinfo.value.message == "No objective on branch 'feat/x'."
