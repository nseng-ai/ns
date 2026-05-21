from __future__ import annotations

import json
from typing import Annotated

import click
from click.testing import CliRunner

from asdl_core.clinkr.context import build_clinkr_context_object
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation


class GreetRequest(ClinkrModel):
    name: str
    excited: bool = False


class GreetResult(ClinkrModel):
    message: str


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


class EmptyRequest(ClinkrModel):
    pass


class EmptyResult(ClinkrModel):
    count: int


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


class SearchRequest(ClinkrModel):
    query: Annotated[str, click.Argument(["query"])]
    limit: Annotated[int, click.Option(["--limit", "-n"])] = 10


class SearchResult(ClinkrModel):
    results: tuple[str, ...]


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


class InspectRequest(ClinkrModel):
    name: str
    count: int = 3
    dry_run: bool = False


class InspectResult(ClinkrModel):
    name: str
    count: int
    dry_run: bool


@clinkr_operation(name="inspect", help="Inspect inferred params.")
def _inspect_op(ctx: click.Context, request: InspectRequest) -> ClinkrExit[InspectResult]:
    del ctx
    return ClinkrExit.ok(
        InspectResult(name=request.name, count=request.count, dry_run=request.dry_run)
    )


def test_inferred_required_argument_and_defaulted_option() -> None:
    group = ClinkrGroup("test", help="Test.", operations=[_inspect_op])

    runner = CliRunner()
    result = runner.invoke(group, ["inspect", "alice", "--count", "5"], obj=_runtime_obj())

    assert result.exit_code == 0
    assert json.loads(result.output) == {"name": "alice", "count": 5, "dry_run": False}


def test_inferred_defaulted_option_uses_default() -> None:
    group = ClinkrGroup("test", help="Test.", operations=[_inspect_op])

    runner = CliRunner()
    result = runner.invoke(group, ["inspect", "alice"], obj=_runtime_obj())

    assert result.exit_code == 0
    assert json.loads(result.output) == {"name": "alice", "count": 3, "dry_run": False}


def test_inferred_bool_flag_maps_hyphenated_option_to_field_name() -> None:
    group = ClinkrGroup("test", help="Test.", operations=[_inspect_op])

    runner = CliRunner()
    result = runner.invoke(group, ["inspect", "alice", "--dry-run"], obj=_runtime_obj())

    assert result.exit_code == 0
    assert json.loads(result.output) == {"name": "alice", "count": 3, "dry_run": True}
