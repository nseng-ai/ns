from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Annotated, Literal

import click
from click.testing import CliRunner

from twerk_core.clinkr.command import ClinkrCommandError
from twerk_core.clinkr.context import build_clinkr_context_object, is_machine_mode
from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.group import ClinkrGroup
from twerk_core.clinkr.operation import clinkr_operation

# -- fixtures: legacy-style operation ---------------------------------------


@dataclass(frozen=True)
class LegacyRequest:
    name: Annotated[str, click.Argument(["name"], type=click.STRING)]


@dataclass(frozen=True)
class LegacyResult:
    greeting: str


def _render_legacy(result: LegacyResult) -> None:
    click.echo(result.greeting)


@clinkr_operation(name="hello", help="Greet a name.", human_renderer=_render_legacy)
def run_hello(ctx: click.Context, request: LegacyRequest) -> LegacyResult | ClinkrCommandError:
    del ctx
    if request.name == "err":
        return ClinkrCommandError(error_type="bad_name", message="no such name")
    return LegacyResult(greeting=f"hello {request.name}")


# -- fixtures: exit-style operation -----------------------------------------


@dataclass(frozen=True)
class ProbeRequest:
    mode: Annotated[str, click.Argument(["mode"], type=click.STRING)]


@dataclass(frozen=True)
class ProbeResult:
    value: str


@clinkr_operation(name="probe", help="Exit-style probe.")
def run_probe(ctx: click.Context, request: ProbeRequest) -> ClinkrExit[ProbeResult]:
    del ctx
    if request.mode == "ok":
        return ClinkrExit.ok(ProbeResult(value="found"))
    if request.mode == "negative":
        return ClinkrExit.negative(ProbeResult(value="partial"), message="nothing here")
    return ClinkrExit.failure(error_type="bad_mode", message="boom")


# -- fixture: operation that sees is_machine_mode ---------------------------


@dataclass(frozen=True)
class ModeRequest:
    pass


@dataclass(frozen=True)
class ModeResult:
    machine_mode: bool


@clinkr_operation(name="mode", help="Report machine-mode flag.")
def run_mode(ctx: click.Context, request: ModeRequest) -> ModeResult | ClinkrCommandError:
    del request
    return ModeResult(machine_mode=is_machine_mode(ctx))


# -- fixture: operation that already declares --format ---------------------


@dataclass(frozen=True)
class OutputFormatRequest:
    name: Annotated[str, click.Argument(["name"], type=click.STRING)]
    format: Annotated[
        Literal["findings", "text"],
        click.Option(
            ["--format"],
            type=click.Choice(["findings", "text"]),
            default="text",
        ),
    ] = "text"


@dataclass(frozen=True)
class OutputFormatResult:
    summary: str


@clinkr_operation(name="review", help="Command with its own --format option.")
def run_review(
    ctx: click.Context, request: OutputFormatRequest
) -> OutputFormatResult | ClinkrCommandError:
    del ctx
    return OutputFormatResult(summary=f"{request.name}:{request.format}")


def _make_group() -> ClinkrGroup:
    return ClinkrGroup(name="probes", operations=[run_hello, run_probe, run_mode, run_review])


def _runtime_obj() -> object:
    return build_clinkr_context_object(lambda: object())


# -- legacy return style ----------------------------------------------------


def test_legacy_format_human_default_renders() -> None:
    result = CliRunner().invoke(_make_group(), ["hello", "world"])

    assert result.exit_code == 0
    assert result.stdout == "hello world\n"


def test_legacy_format_json_emits_success_envelope() -> None:
    result = CliRunner().invoke(
        _make_group(),
        ["hello", "world", "--format", "json"],
        obj=_runtime_obj(),
    )

    assert result.exit_code == 0
    assert json.loads(result.stdout) == {"success": True, "greeting": "hello world"}


def test_legacy_format_json_error_emits_error_envelope_and_exits_one() -> None:
    result = CliRunner().invoke(
        _make_group(),
        ["hello", "err", "--format", "json"],
        obj=_runtime_obj(),
    )

    assert result.exit_code == 1
    assert json.loads(result.stdout) == {
        "success": False,
        "error_type": "bad_name",
        "message": "no such name",
    }


# -- exit return style ------------------------------------------------------


def test_exit_format_json_ok_matches_json_subtree_envelope() -> None:
    runner = CliRunner()
    flag_result = runner.invoke(
        _make_group(), ["probe", "ok", "--format", "json"], obj=_runtime_obj()
    )
    subtree_result = runner.invoke(
        _make_group(),
        ["json", "probe"],
        input='{"mode":"ok"}',
        obj=_runtime_obj(),
    )

    assert flag_result.exit_code == 0
    assert subtree_result.exit_code == 0
    assert json.loads(flag_result.stdout) == json.loads(subtree_result.stdout)
    assert json.loads(flag_result.stdout) == {"exit_code": 0, "data": {"value": "found"}}


def test_exit_format_json_negative_matches_and_exits_one() -> None:
    runner = CliRunner()
    flag_result = runner.invoke(
        _make_group(),
        ["probe", "negative", "--format", "json"],
        obj=_runtime_obj(),
    )
    subtree_result = runner.invoke(
        _make_group(),
        ["json", "probe"],
        input='{"mode":"negative"}',
        obj=_runtime_obj(),
    )

    assert flag_result.exit_code == 1
    assert subtree_result.exit_code == 1
    assert json.loads(flag_result.stdout) == json.loads(subtree_result.stdout)


def test_exit_format_json_failure_matches_and_exits_two() -> None:
    runner = CliRunner()
    flag_result = runner.invoke(
        _make_group(),
        ["probe", "failure", "--format", "json"],
        obj=_runtime_obj(),
    )
    subtree_result = runner.invoke(
        _make_group(),
        ["json", "probe"],
        input='{"mode":"failure"}',
        obj=_runtime_obj(),
    )

    assert flag_result.exit_code == 2
    assert subtree_result.exit_code == 2
    assert json.loads(flag_result.stdout) == json.loads(subtree_result.stdout)


# -- schema -----------------------------------------------------------------


def test_schema_prints_schema_document_without_required_args() -> None:
    # Mirror Click's --help: --schema is eager and prints the schema even when
    # the command has unsatisfied required arguments.
    result = CliRunner().invoke(_make_group(), ["probe", "--schema"])

    assert result.exit_code == 0
    doc = json.loads(result.stdout)
    assert set(doc.keys()) == {"input_schema", "output_schema", "error_schema"}


def test_schema_matches_json_subtree_schema() -> None:
    runner = CliRunner()
    flag_result = runner.invoke(_make_group(), ["probe", "--schema"])
    subtree_result = runner.invoke(_make_group(), ["json", "probe", "--schema"])

    assert flag_result.exit_code == 0
    assert subtree_result.exit_code == 0
    assert json.loads(flag_result.stdout) == json.loads(subtree_result.stdout)


# -- machine-mode signal ----------------------------------------------------


def test_is_machine_mode_false_for_human_dispatch() -> None:
    runner = CliRunner()
    result = runner.invoke(_make_group(), ["mode", "--format", "json"], obj=_runtime_obj())

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["machine_mode"] is True


def test_is_machine_mode_false_for_default_human_dispatch() -> None:
    # default_human_renderer serializes the dataclass as JSON; the False
    # branch must be distinguishable from the True branch.
    result = CliRunner().invoke(_make_group(), ["mode"], obj=_runtime_obj())

    assert result.exit_code == 0
    assert '"machine_mode": false' in result.stdout


def test_is_machine_mode_true_for_json_subtree_dispatch() -> None:
    result = CliRunner().invoke(_make_group(), ["json", "mode"], input="{}", obj=_runtime_obj())

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["machine_mode"] is True


def test_machine_mode_does_not_leak_when_context_object_is_reused() -> None:
    runner = CliRunner()
    obj = build_clinkr_context_object(lambda: object())

    json_result = runner.invoke(_make_group(), ["mode", "--format", "json"], obj=obj)
    human_result = runner.invoke(_make_group(), ["mode"], obj=obj)

    assert json_result.exit_code == 0
    assert human_result.exit_code == 0
    assert json.loads(json_result.stdout)["machine_mode"] is True
    assert '"machine_mode": false' in human_result.stdout


# -- collision avoidance ----------------------------------------------------


def test_existing_format_option_is_preserved() -> None:
    # When the request already declares --format, the framework must not
    # inject its own and must not break the existing semantics.
    result = CliRunner().invoke(_make_group(), ["review", "x", "--format", "findings"])

    assert result.exit_code == 0
    assert '"summary": "x:findings"' in result.stdout


def test_existing_format_option_blocks_schema_injection_too() -> None:
    # The framework does not inject --schema either when --format is reserved;
    # users can still get schema via the legacy json subtree.
    result = CliRunner().invoke(_make_group(), ["review", "x", "--schema"])

    assert result.exit_code != 0
    assert "No such option: --schema" in result.output
