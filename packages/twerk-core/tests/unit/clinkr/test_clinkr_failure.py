from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Annotated

import click
from click.testing import CliRunner

from twerk_core.clinkr.context import build_clinkr_context_object
from twerk_core.clinkr.dataclass_json import JsonSerializable
from twerk_core.clinkr.ensure import Ensure
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.failure import ClinkrFailure
from twerk_core.clinkr.group import ClinkrGroup
from twerk_core.clinkr.operation import clinkr_operation

# -- ClinkrFailure unit tests ------------------------------------------------


def test_failure_init_sets_error_type_and_message() -> None:
    fail = ClinkrFailure(error_type="bad_thing", message="it broke")

    assert fail.error_type == "bad_thing"
    assert fail.message == "it broke"
    assert str(fail) == "it broke"
    assert isinstance(fail, Exception)


# -- Dispatcher conversion ---------------------------------------------------


@dataclass(frozen=True)
class _Request:
    mode: Annotated[str, click.Argument(["mode"], type=click.STRING)]


@dataclass(frozen=True)
class _Result(JsonSerializable):
    value: str


@clinkr_operation(name="probe", help="Exercise ClinkrFailure dispatch.")
def _run_probe(ctx: click.Context, request: _Request) -> ClinkrExit[_Result]:
    del ctx
    if request.mode == "raise-failure":
        raise ClinkrFailure(error_type="bad_mode", message="boom")
    if request.mode == "ensure":
        Ensure.true(False, error_type="precondition", message="nope")
    return ClinkrExit.ok(_Result(value="found"))


def _make_group() -> ClinkrGroup:
    return ClinkrGroup(name="probes", operations=[_run_probe])


def _runtime_obj() -> object:
    return build_clinkr_context_object(lambda: object())


def test_human_dispatcher_converts_raised_failure_to_exit_two() -> None:
    result = CliRunner().invoke(_make_group(), ["probe", "raise-failure"], obj=_runtime_obj())

    assert result.exit_code == 2
    assert result.stdout == ""
    assert "error: boom" in result.stderr


def test_human_dispatcher_converts_ensure_failure_to_exit_two() -> None:
    result = CliRunner().invoke(_make_group(), ["probe", "ensure"], obj=_runtime_obj())

    assert result.exit_code == 2
    assert "error: nope" in result.stderr


def test_machine_dispatcher_converts_raised_failure_to_envelope() -> None:
    result = CliRunner().invoke(
        _make_group(),
        ["probe", "raise-failure", "--format", "json"],
        obj=_runtime_obj(),
    )

    assert result.exit_code == 2
    assert json.loads(result.output) == {
        "exit_code": 2,
        "error_type": "bad_mode",
        "message": "boom",
    }


def test_machine_dispatcher_converts_ensure_failure_to_envelope() -> None:
    result = CliRunner().invoke(
        _make_group(),
        ["probe", "ensure", "--format", "json"],
        obj=_runtime_obj(),
    )

    assert result.exit_code == 2
    assert json.loads(result.output) == {
        "exit_code": 2,
        "error_type": "precondition",
        "message": "nope",
    }
