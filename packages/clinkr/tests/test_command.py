from __future__ import annotations

import json
from dataclasses import dataclass

import click
from click.testing import CliRunner

from clinkr.command import ClinkrCommandError, machine_command


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
    def greet(*, request: GreetingRequest) -> GreetingResult:
        punctuation = "!" if request.excited else "."
        return GreetingResult(message=f"hello {request.name}{punctuation}")

    return greet


def test_machine_command_reads_request_from_stdin() -> None:
    runner = CliRunner()
    result = runner.invoke(_make_greeting_command(), [], input='{"name":"alice","excited":true}')

    assert result.exit_code == 0
    data = json.loads(result.output)
    assert data == {"success": True, "message": "hello alice!"}


def test_machine_command_rejects_unknown_fields() -> None:
    runner = CliRunner()
    result = runner.invoke(_make_greeting_command(), [], input='{"name":"alice","bogus":true}')

    assert result.exit_code == 1
    data = json.loads(result.output)
    assert data["success"] is False
    assert data["error_type"] == "invalid_request"
    assert "Unknown field: bogus" in data["message"]


def test_machine_command_emits_structured_error_results() -> None:
    @dataclass(frozen=True)
    class EmptyRequest:
        pass

    @machine_command(request_type=EmptyRequest, output_types=(GreetingResult,))
    @click.command("fail")
    def fail(*, request: EmptyRequest) -> ClinkrCommandError:
        del request
        return ClinkrCommandError(error_type="boom", message="it broke")

    runner = CliRunner()
    result = runner.invoke(fail, [], input="")

    assert result.exit_code == 1
    data = json.loads(result.output)
    assert data == {"success": False, "error_type": "boom", "message": "it broke"}


def test_machine_command_schema_mode() -> None:
    runner = CliRunner()
    result = runner.invoke(_make_greeting_command(), ["--schema"])

    assert result.exit_code == 0
    data = json.loads(result.output)
    assert data["input_schema"]["required"] == ["name"]
    assert "message" in data["output_schema"]["properties"]
    assert data["error_schema"]["properties"]["success"]["const"] is False
