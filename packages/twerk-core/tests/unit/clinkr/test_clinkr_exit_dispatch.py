from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Annotated

import click
from click.testing import CliRunner

from twerk_core.clinkr.context import build_clinkr_context_object
from twerk_core.clinkr.dataclass_json import JsonSerializable
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.group import ClinkrGroup
from twerk_core.clinkr.operation import clinkr_operation


@dataclass(frozen=True)
class ProbeRequest:
    mode: Annotated[str, click.Argument(["mode"], type=click.STRING)]


@dataclass(frozen=True)
class ProbeResult(JsonSerializable):
    value: str


@clinkr_operation(name="probe", help="Exercise ClinkrExit dispatch.")
def run_probe(ctx: click.Context, request: ProbeRequest) -> ClinkrExit[ProbeResult]:
    del ctx
    if request.mode == "ok":
        return ClinkrExit.ok(ProbeResult(value="found"))
    if request.mode == "negative":
        raise ClinkrExit.negative(ProbeResult(value="partial"), message="nothing here")
    raise ClinkrExit.failure(error_type="bad_mode", message="boom")


def _make_group() -> ClinkrGroup:
    return ClinkrGroup(name="probes", operations=[run_probe])


def _runtime_obj() -> object:
    return build_clinkr_context_object(lambda: object())


# -- human mode --------------------------------------------------------------


def test_human_ok_exits_zero_and_renders_data() -> None:
    result = CliRunner().invoke(_make_group(), ["probe", "ok"], obj=_runtime_obj())

    assert result.exit_code == 0
    assert '"value": "found"' in result.stdout
    assert result.stderr == ""


def test_human_negative_exits_one_with_message_on_stderr() -> None:
    result = CliRunner().invoke(_make_group(), ["probe", "negative"], obj=_runtime_obj())

    assert result.exit_code == 1
    assert result.stdout == ""
    assert "nothing here" in result.stderr


def test_human_failure_exits_two_with_error_prefix_on_stderr() -> None:
    result = CliRunner().invoke(_make_group(), ["probe", "failure"], obj=_runtime_obj())

    assert result.exit_code == 2
    assert result.stdout == ""
    assert "error: boom" in result.stderr


# -- machine mode ------------------------------------------------------------


def test_machine_ok_exits_zero_and_emits_data_envelope() -> None:
    runner = CliRunner()
    result = runner.invoke(
        _make_group(),
        ["probe", "ok", "--format", "json"],
        obj=_runtime_obj(),
    )

    assert result.exit_code == 0
    assert json.loads(result.output) == {
        "exit_code": 0,
        "data": {"value": "found"},
    }


def test_machine_negative_exits_one_and_emits_message_envelope() -> None:
    runner = CliRunner()
    result = runner.invoke(
        _make_group(),
        ["probe", "negative", "--format", "json"],
        obj=_runtime_obj(),
    )

    assert result.exit_code == 1
    assert json.loads(result.output) == {
        "exit_code": 1,
        "message": "nothing here",
        "data": {"value": "partial"},
    }


def test_machine_failure_exits_two_and_emits_error_envelope() -> None:
    runner = CliRunner()
    result = runner.invoke(
        _make_group(),
        ["probe", "failure", "--format", "json"],
        obj=_runtime_obj(),
    )

    assert result.exit_code == 2
    assert json.loads(result.output) == {
        "exit_code": 2,
        "error_type": "bad_mode",
        "message": "boom",
    }
