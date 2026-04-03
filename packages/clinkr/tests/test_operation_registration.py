from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Annotated

import click
from click.testing import CliRunner

from clinkr.group import ClinkrGroup
from clinkr.machine_command import MachineCommandError


@dataclass(frozen=True)
class GreetRequest:
    name: str
    excited: bool = False


@dataclass(frozen=True)
class GreetResult:
    message: str

    def to_json_dict(self) -> dict[str, str]:
        return {"message": self.message}


def _greet(request: GreetRequest) -> GreetResult | MachineCommandError:
    punctuation = "!" if request.excited else "."
    return GreetResult(message=f"hello {request.name}{punctuation}")


def _make_group() -> ClinkrGroup:
    group = ClinkrGroup("test", help="Test group.")
    group.register_operation(
        "greet",
        operation=_greet,
        request_type=GreetRequest,
        result_types=(GreetResult,),
        help="Greet someone.",
        aliases=("hi",),
    )
    return group


def test_human_command_exists() -> None:
    group = _make_group()
    assert "greet" in group.commands


def test_json_command_exists() -> None:
    group = _make_group()
    assert "greet" in group.json_group.commands


def test_human_command_invocation() -> None:
    runner = CliRunner()
    result = runner.invoke(_make_group(), ["greet", "alice"])
    assert result.exit_code == 0
    data = json.loads(result.output)
    assert data["message"] == "hello alice."


def test_human_command_with_flag() -> None:
    runner = CliRunner()
    result = runner.invoke(_make_group(), ["greet", "alice", "--excited"])
    assert result.exit_code == 0
    data = json.loads(result.output)
    assert data["message"] == "hello alice!"


def test_json_command_invocation() -> None:
    runner = CliRunner()
    result = runner.invoke(
        _make_group(),
        ["json", "greet"],
        input='{"name": "bob", "excited": true}',
    )
    assert result.exit_code == 0
    data = json.loads(result.output)
    assert data["success"] is True
    assert data["message"] == "hello bob!"


def test_json_command_schema() -> None:
    runner = CliRunner()
    result = runner.invoke(_make_group(), ["json", "greet", "--schema"])
    assert result.exit_code == 0
    data = json.loads(result.output)
    assert "input_schema" in data
    assert "output_schema" in data
    assert "name" in data["input_schema"]["properties"]


def test_alias_works() -> None:
    runner = CliRunner()
    result = runner.invoke(_make_group(), ["hi", "alice"])
    assert result.exit_code == 0
    data = json.loads(result.output)
    assert data["message"] == "hello alice."


def test_custom_renderer() -> None:
    def custom_renderer(result: GreetResult) -> None:
        click.echo(f"CUSTOM: {result.message}")

    group = ClinkrGroup("test", help="Test.")
    group.register_operation(
        "greet",
        operation=_greet,
        request_type=GreetRequest,
        result_types=(GreetResult,),
        human_renderer=custom_renderer,
    )

    runner = CliRunner()
    result = runner.invoke(group, ["greet", "alice"])
    assert result.exit_code == 0
    assert result.output.strip() == "CUSTOM: hello alice."


def test_error_handling_human() -> None:
    def failing_op(request: GreetRequest) -> GreetResult | MachineCommandError:
        return MachineCommandError(error_type="boom", message="it broke")

    group = ClinkrGroup("test", help="Test.")
    group.register_operation(
        "fail",
        operation=failing_op,
        request_type=GreetRequest,
        result_types=(GreetResult,),
    )

    runner = CliRunner()
    result = runner.invoke(group, ["fail", "alice"])
    assert result.exit_code != 0
    assert "it broke" in result.output


def test_error_handling_json() -> None:
    def failing_op(request: GreetRequest) -> GreetResult | MachineCommandError:
        return MachineCommandError(error_type="boom", message="it broke")

    group = ClinkrGroup("test", help="Test.")
    group.register_operation(
        "fail",
        operation=failing_op,
        request_type=GreetRequest,
        result_types=(GreetResult,),
    )

    runner = CliRunner()
    result = runner.invoke(group, ["json", "fail"], input='{"name": "alice"}')
    assert result.exit_code == 1
    data = json.loads(result.output)
    assert data["success"] is False
    assert data["error_type"] == "boom"


@dataclass(frozen=True)
class EmptyRequest:
    pass


@dataclass(frozen=True)
class EmptyResult:
    count: int

    def to_json_dict(self) -> dict[str, int]:
        return {"count": self.count}


def test_empty_request_no_args() -> None:
    """Operations with no-field request types work without CLI arguments."""

    def list_op(request: EmptyRequest) -> EmptyResult:
        return EmptyResult(count=0)

    group = ClinkrGroup("test", help="Test.")
    group.register_operation(
        "list",
        operation=list_op,
        request_type=EmptyRequest,
        result_types=(EmptyResult,),
    )

    runner = CliRunner()
    result = runner.invoke(group, ["list"])
    assert result.exit_code == 0
    data = json.loads(result.output)
    assert data["count"] == 0


def test_json_parity_enforced() -> None:
    """Every registered operation has both a human and json command."""
    group = _make_group()
    public_commands = {name for name in group.commands if name != "json"}
    assert public_commands <= set(group.json_group.commands)


def test_annotated_params() -> None:
    @dataclass(frozen=True)
    class SearchRequest:
        query: Annotated[str, click.Argument(["query"])]
        limit: Annotated[int, click.Option(["--limit", "-n"])] = 10

    @dataclass(frozen=True)
    class SearchResult:
        results: tuple[str, ...]

        def to_json_dict(self) -> dict[str, list[str]]:
            return {"results": list(self.results)}

    def search_op(request: SearchRequest) -> SearchResult:
        return SearchResult(results=(f"found: {request.query}",) * request.limit)

    group = ClinkrGroup("test", help="Test.")
    group.register_operation(
        "search",
        operation=search_op,
        request_type=SearchRequest,
        result_types=(SearchResult,),
    )

    runner = CliRunner()
    result = runner.invoke(group, ["search", "hello", "--limit", "2"])
    assert result.exit_code == 0
    data = json.loads(result.output)
    assert len(data["results"]) == 2
