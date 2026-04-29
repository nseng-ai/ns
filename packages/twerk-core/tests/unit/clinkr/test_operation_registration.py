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
class GreetRequest:
    name: str
    excited: bool = False


@dataclass(frozen=True)
class GreetResult(JsonSerializable):
    message: str

    def to_json_dict(self) -> dict[str, str]:
        return {"message": self.message}


@clinkr_operation(name="greet", help="Greet someone.", aliases=("hi",))
def _greet(ctx: click.Context, request: GreetRequest) -> ClinkrExit[GreetResult]:
    punctuation = "!" if request.excited else "."
    return ClinkrExit.ok(GreetResult(message=f"hello {request.name}{punctuation}"))


def _make_group() -> ClinkrGroup:
    return ClinkrGroup("test", help="Test group.", operations=[_greet])


def _runtime_obj() -> object:
    return build_clinkr_context_object(lambda: object())


def test_human_command_exists() -> None:
    group = _make_group()
    assert "greet" in group.commands


def test_human_command_invocation() -> None:
    runner = CliRunner()
    result = runner.invoke(_make_group(), ["greet", "alice"], obj=_runtime_obj())
    assert result.exit_code == 0
    data = json.loads(result.output)
    assert data["message"] == "hello alice."


def test_human_command_with_flag() -> None:
    runner = CliRunner()
    result = runner.invoke(_make_group(), ["greet", "alice", "--excited"], obj=_runtime_obj())
    assert result.exit_code == 0
    data = json.loads(result.output)
    assert data["message"] == "hello alice!"


def test_alias_works() -> None:
    runner = CliRunner()
    result = runner.invoke(_make_group(), ["hi", "alice"], obj=_runtime_obj())
    assert result.exit_code == 0
    data = json.loads(result.output)
    assert data["message"] == "hello alice."


def test_custom_renderer() -> None:
    def custom_renderer(result: GreetResult) -> None:
        click.echo(f"CUSTOM: {result.message}")

    @clinkr_operation(name="greet", help="Greet.", human_renderer=custom_renderer)
    def greet_custom(ctx: click.Context, request: GreetRequest) -> ClinkrExit[GreetResult]:
        punctuation = "!" if request.excited else "."
        return ClinkrExit.ok(GreetResult(message=f"hello {request.name}{punctuation}"))

    group = ClinkrGroup("test", help="Test.", operations=[greet_custom])

    runner = CliRunner()
    result = runner.invoke(group, ["greet", "alice"], obj=_runtime_obj())
    assert result.exit_code == 0
    assert result.output.strip() == "CUSTOM: hello alice."


def test_error_handling_human() -> None:
    @clinkr_operation(name="fail", help="Always fails.")
    def failing_op(ctx: click.Context, request: GreetRequest) -> ClinkrExit[GreetResult]:
        raise ClinkrExit.failure(error_type="boom", message="it broke")

    group = ClinkrGroup("test", help="Test.", operations=[failing_op])

    runner = CliRunner()
    result = runner.invoke(group, ["fail", "alice"], obj=_runtime_obj())
    assert result.exit_code == 2
    assert "error: it broke" in result.stderr


@dataclass(frozen=True)
class EmptyRequest:
    pass


@dataclass(frozen=True)
class EmptyResult(JsonSerializable):
    count: int

    def to_json_dict(self) -> dict[str, int]:
        return {"count": self.count}


def test_empty_request_no_args() -> None:
    """Operations with no-field request types work without CLI arguments."""

    @clinkr_operation(name="list", help="List.")
    def list_op(ctx: click.Context, request: EmptyRequest) -> ClinkrExit[EmptyResult]:
        return ClinkrExit.ok(EmptyResult(count=0))

    group = ClinkrGroup("test", help="Test.", operations=[list_op])

    runner = CliRunner()
    result = runner.invoke(group, ["list"], obj=_runtime_obj())
    assert result.exit_code == 0
    data = json.loads(result.output)
    assert data["count"] == 0


@dataclass(frozen=True)
class SearchRequest:
    query: Annotated[str, click.Argument(["query"])]
    limit: Annotated[int, click.Option(["--limit", "-n"])] = 10


@dataclass(frozen=True)
class SearchResult(JsonSerializable):
    results: tuple[str, ...]

    def to_json_dict(self) -> dict[str, list[str]]:
        return {"results": list(self.results)}


@clinkr_operation(name="search", help="Search.")
def _search_op(ctx: click.Context, request: SearchRequest) -> ClinkrExit[SearchResult]:
    return ClinkrExit.ok(SearchResult(results=(f"found: {request.query}",) * request.limit))


def test_annotated_params() -> None:
    group = ClinkrGroup("test", help="Test.", operations=[_search_op])

    runner = CliRunner()
    result = runner.invoke(group, ["search", "hello", "--limit", "2"], obj=_runtime_obj())
    assert result.exit_code == 0
    data = json.loads(result.output)
    assert len(data["results"]) == 2
