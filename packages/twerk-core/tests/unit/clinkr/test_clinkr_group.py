from __future__ import annotations

import json
from dataclasses import dataclass

import click
import pytest
from click.testing import CliRunner

from twerk_core.clinkr.group import ClinkrGroup, ClinkrGroupSpec, compile_group
from twerk_core.clinkr.operation import clinkr_operation


@dataclass(frozen=True)
class EmptyRequest:
    pass


@dataclass(frozen=True)
class MessageResult:
    message: str

    def to_json_dict(self) -> dict[str, str]:
        return {"message": self.message}


@clinkr_operation(name="hello", help="Say hello.", aliases=("hi",))
def run_hello(ctx: click.Context, request: EmptyRequest) -> MessageResult:
    return MessageResult(message="hello")


@clinkr_operation(name="bye", help="Say bye.")
def run_bye(ctx: click.Context, request: EmptyRequest) -> MessageResult:
    return MessageResult(message="bye")


def _make_group() -> ClinkrGroup:
    return compile_group(
        ClinkrGroupSpec(
            name="test",
            help="Test group.",
            operations=(run_hello, run_bye),
        )
    )


def test_json_subgroup_auto_provisioned() -> None:
    group = _make_group()
    assert "json" in group.commands
    assert isinstance(group.commands["json"], click.Group)


def test_json_subgroup_accessible_via_property() -> None:
    group = _make_group()
    assert group.json_group is group.commands["json"]


def test_cannot_add_command_named_json() -> None:
    group = _make_group()

    @click.command("json")
    def bad() -> None:
        pass

    with pytest.raises(ValueError, match="reserved subgroup"):
        group.add_command(bad)


def test_alias_resolution() -> None:
    runner = CliRunner()
    result = runner.invoke(_make_group(), ["hi"])
    payload = json.loads(result.output)

    assert result.exit_code == 0
    assert payload["message"] == "hello"


def test_canonical_name_still_works() -> None:
    runner = CliRunner()
    result = runner.invoke(_make_group(), ["hello"])
    payload = json.loads(result.output)

    assert result.exit_code == 0
    assert payload["message"] == "hello"


def test_help_shows_aliases() -> None:
    runner = CliRunner()
    result = runner.invoke(_make_group(), ["--help"])

    assert result.exit_code == 0
    assert "hello (hi)" in result.output


def test_json_listed_last_in_help() -> None:
    runner = CliRunner()
    result = runner.invoke(_make_group(), ["--help"])

    assert result.exit_code == 0
    lines = result.output.splitlines()
    command_lines = [
        line.strip() for line in lines if line.strip().startswith(("hello", "bye", "json"))
    ]
    assert command_lines[-1].startswith("json")
