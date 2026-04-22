from __future__ import annotations

import json
from dataclasses import dataclass

import click
from click.testing import CliRunner

from twerk_core.clinkr.command import machine_command
from twerk_core.clinkr.context import build_clinkr_context_object
from twerk_core.clinkr.exit import ClinkrExit


def _runtime_obj() -> object:
    return build_clinkr_context_object(lambda: object())


@dataclass(frozen=True)
class GreetingRequest:
    name: str
    excited: bool = False


@dataclass(frozen=True)
class GreetingResult:
    message: str


def _make_greeting_command() -> click.Command:
    @machine_command(
        request_type=GreetingRequest,
        output_types=(GreetingResult,),
    )
    @click.command("greet")
    def greet(*, request: GreetingRequest) -> ClinkrExit[GreetingResult]:
        punctuation = "!" if request.excited else "."
        return ClinkrExit.ok(GreetingResult(message=f"hello {request.name}{punctuation}"))

    return greet


def test_machine_command_reads_request_from_stdin() -> None:
    runner = CliRunner()
    result = runner.invoke(
        _make_greeting_command(),
        [],
        input='{"name":"alice","excited":true}',
        obj=_runtime_obj(),
    )

    assert result.exit_code == 0
    data = json.loads(result.output)
    assert data == {"exit_code": 0, "data": {"message": "hello alice!"}}


def test_machine_command_rejects_unknown_fields() -> None:
    runner = CliRunner()
    result = runner.invoke(
        _make_greeting_command(),
        [],
        input='{"name":"alice","bogus":true}',
        obj=_runtime_obj(),
    )

    assert result.exit_code == 2
    data = json.loads(result.output)
    assert data["exit_code"] == 2
    assert data["error_type"] == "invalid_request"
    assert "Unknown field: bogus" in data["message"]
    assert "Valid fields:" in data["message"]
    assert "name" in data["message"]
    assert "excited" in data["message"]


def test_machine_command_reports_missing_required_fields() -> None:
    runner = CliRunner()
    result = runner.invoke(_make_greeting_command(), [], input="{}", obj=_runtime_obj())

    assert result.exit_code == 2
    data = json.loads(result.output)
    assert data["exit_code"] == 2
    assert data["error_type"] == "invalid_request"
    assert "Missing required field: name" in data["message"]
    assert "Required fields:" in data["message"]
    assert "name" in data["message"]


def test_machine_command_emits_failure_envelope() -> None:
    @dataclass(frozen=True)
    class EmptyRequest:
        pass

    @machine_command(request_type=EmptyRequest, output_types=(GreetingResult,))
    @click.command("fail")
    def fail(*, request: EmptyRequest) -> ClinkrExit[GreetingResult]:
        del request
        return ClinkrExit.failure(error_type="boom", message="it broke")

    runner = CliRunner()
    result = runner.invoke(fail, [], input="", obj=_runtime_obj())

    assert result.exit_code == 2
    data = json.loads(result.output)
    assert data == {"exit_code": 2, "error_type": "boom", "message": "it broke"}


def test_machine_command_schema_mode() -> None:
    runner = CliRunner()
    result = runner.invoke(_make_greeting_command(), ["--schema"])

    assert result.exit_code == 0
    data = json.loads(result.output)
    assert data["input_schema"]["required"] == ["name"]
    assert "message" in data["output_schema"]["properties"]
    assert "error_schema" not in data
