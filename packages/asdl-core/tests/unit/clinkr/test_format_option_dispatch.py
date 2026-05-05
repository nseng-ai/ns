from __future__ import annotations

import json
from typing import Annotated, Literal

import click
from click.testing import CliRunner

from asdl_core.clinkr.context import build_clinkr_context_object, is_machine_mode
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation

# -- fixtures: exit-style operation -----------------------------------------


class ProbeRequest(ClinkrModel):
    mode: Annotated[str, click.Argument(["mode"], type=click.STRING)]


class ProbeResult(ClinkrModel):
    value: str


@clinkr_operation(name="probe", help="Exit-style probe.")
def run_probe(ctx: click.Context, request: ProbeRequest) -> ClinkrExit[ProbeResult]:
    del ctx
    if request.mode == "ok":
        return ClinkrExit.ok(ProbeResult(value="found"))
    if request.mode == "negative":
        raise ClinkrExit.negative(ProbeResult(value="partial"), message="nothing here")
    raise ClinkrExit.failure(error_type="bad_mode", message="boom")


# -- fixture: operation that sees is_machine_mode ---------------------------


class ModeRequest(ClinkrModel):
    pass


class ModeResult(ClinkrModel):
    machine_mode: bool


@clinkr_operation(name="mode", help="Report machine-mode flag.")
def run_mode(ctx: click.Context, request: ModeRequest) -> ClinkrExit[ModeResult]:
    del request
    return ClinkrExit.ok(ModeResult(machine_mode=is_machine_mode(ctx)))


# -- fixture: operation that already declares --format ---------------------


class OutputFormatRequest(ClinkrModel):
    name: Annotated[str, click.Argument(["name"], type=click.STRING)]
    format: Annotated[
        Literal["findings", "text"],
        click.Option(
            ["--format"],
            type=click.Choice(["findings", "text"]),
            default="text",
        ),
    ] = "text"


class OutputFormatResult(ClinkrModel):
    summary: str


@clinkr_operation(name="review", help="Command with its own --format option.")
def run_review(ctx: click.Context, request: OutputFormatRequest) -> ClinkrExit[OutputFormatResult]:
    del ctx
    return ClinkrExit.ok(OutputFormatResult(summary=f"{request.name}:{request.format}"))


# -- fixture: operation that already declares --json-schema ----------------


class JsonSchemaOptionRequest(ClinkrModel):
    json_schema: str = ""


class JsonSchemaOptionResult(ClinkrModel):
    value: str


@clinkr_operation(name="schema-option", help="Command with its own --json-schema option.")
def run_schema_option(
    ctx: click.Context,
    request: JsonSchemaOptionRequest,
) -> ClinkrExit[JsonSchemaOptionResult]:
    del ctx
    return ClinkrExit.ok(JsonSchemaOptionResult(value=request.json_schema))


def _make_group() -> ClinkrGroup:
    return ClinkrGroup(
        name="probes",
        operations=[run_probe, run_mode, run_review, run_schema_option],
    )


def _runtime_obj() -> object:
    return build_clinkr_context_object(lambda: object())


# -- exit return style ------------------------------------------------------


def test_format_json_ok_emits_envelope() -> None:
    runner = CliRunner()
    result = runner.invoke(_make_group(), ["probe", "ok", "--format", "json"], obj=_runtime_obj())

    assert result.exit_code == 0
    assert json.loads(result.stdout) == {"exit_code": 0, "data": {"value": "found"}}


def test_format_json_negative_emits_envelope_and_exits_one() -> None:
    runner = CliRunner()
    result = runner.invoke(
        _make_group(),
        ["probe", "negative", "--format", "json"],
        obj=_runtime_obj(),
    )

    assert result.exit_code == 1
    assert json.loads(result.stdout) == {
        "exit_code": 1,
        "message": "nothing here",
        "data": {"value": "partial"},
    }


def test_format_json_failure_emits_envelope_and_exits_two() -> None:
    runner = CliRunner()
    result = runner.invoke(
        _make_group(),
        ["probe", "failure", "--format", "json"],
        obj=_runtime_obj(),
    )

    assert result.exit_code == 2
    assert json.loads(result.stdout) == {
        "exit_code": 2,
        "error_type": "bad_mode",
        "message": "boom",
    }


# -- json schema ------------------------------------------------------------


def test_json_schema_prints_schema_document_without_required_args() -> None:
    # Mirror Click's --help: --json-schema is eager and prints the schema even when
    # the command has unsatisfied required arguments.
    result = CliRunner().invoke(_make_group(), ["probe", "--json-schema"])

    assert result.exit_code == 0
    doc = json.loads(result.stdout)
    assert set(doc.keys()) == {"input_json_schema", "output_json_schema"}


# -- machine-mode signal ----------------------------------------------------


def test_is_machine_mode_true_for_format_json_dispatch() -> None:
    runner = CliRunner()
    result = runner.invoke(_make_group(), ["mode", "--format", "json"], obj=_runtime_obj())

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["data"]["machine_mode"] is True


def test_is_machine_mode_false_for_default_human_dispatch() -> None:
    # default_human_renderer serializes the Pydantic model as JSON; the False
    # branch must be distinguishable from the True branch.
    result = CliRunner().invoke(_make_group(), ["mode"], obj=_runtime_obj())

    assert result.exit_code == 0
    assert '"machine_mode": false' in result.stdout


def test_machine_mode_does_not_leak_when_context_object_is_reused() -> None:
    runner = CliRunner()
    obj = build_clinkr_context_object(lambda: object())

    json_result = runner.invoke(_make_group(), ["mode", "--format", "json"], obj=obj)
    human_result = runner.invoke(_make_group(), ["mode"], obj=obj)

    assert json_result.exit_code == 0
    assert human_result.exit_code == 0
    assert json.loads(json_result.stdout)["data"]["machine_mode"] is True
    assert '"machine_mode": false' in human_result.stdout


# -- collision avoidance ----------------------------------------------------


def test_existing_format_option_is_preserved() -> None:
    # When the request already declares --format, the framework must not
    # inject its own and must not break the existing semantics.
    result = CliRunner().invoke(
        _make_group(), ["review", "x", "--format", "findings"], obj=_runtime_obj()
    )

    assert result.exit_code == 0
    assert '"summary": "x:findings"' in result.stdout


def test_existing_format_option_still_gets_json_schema_injected() -> None:
    # --json-schema is always injected, even on commands that declare their own
    # --format option.
    result = CliRunner().invoke(_make_group(), ["review", "x", "--json-schema"])

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert set(payload) == {"input_json_schema", "output_json_schema"}


def test_existing_json_schema_option_is_preserved() -> None:
    result = CliRunner().invoke(
        _make_group(),
        ["schema-option", "--json-schema", "claim-plan/v1"],
        obj=_runtime_obj(),
    )

    assert result.exit_code == 0
    assert json.loads(result.stdout) == {"value": "claim-plan/v1"}
