from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Annotated

import click
from click.testing import CliRunner

from asdl_core.clinkr.context import build_clinkr_context_object
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation


@dataclass(frozen=True)
class PydanticProbeRequest:
    value: Annotated[str, click.Argument(["value"], type=click.STRING)]


class PydanticProbeResult(ClinkrModel):
    value: str


@clinkr_operation(name="probe", help="Pydantic result probe.")
def run_pydantic_probe(
    ctx: click.Context,
    request: PydanticProbeRequest,
) -> ClinkrExit[PydanticProbeResult]:
    del ctx
    return ClinkrExit.ok(PydanticProbeResult(value=request.value))


def _make_group() -> ClinkrGroup:
    return ClinkrGroup(name="pydantic-probes", operations=[run_pydantic_probe])


def _runtime_obj() -> object:
    return build_clinkr_context_object(lambda: object())


def test_pydantic_result_serializes_into_machine_envelope() -> None:
    result = CliRunner().invoke(
        _make_group(),
        ["probe", "found", "--format", "json"],
        obj=_runtime_obj(),
    )

    assert result.exit_code == 0
    assert json.loads(result.stdout) == {"exit_code": 0, "data": {"value": "found"}}


def test_schema_can_be_generated_from_pydantic_result_model() -> None:
    result = CliRunner().invoke(_make_group(), ["probe", "--schema"])

    assert result.exit_code == 0
    doc = json.loads(result.stdout)
    assert doc["output_schema"]["properties"] == {"value": {"title": "Value", "type": "string"}}
    assert doc["output_schema"]["required"] == ["value"]


def test_default_human_renderer_supports_pydantic_result_model() -> None:
    result = CliRunner().invoke(_make_group(), ["probe", "found"], obj=_runtime_obj())

    assert result.exit_code == 0
    assert json.loads(result.stdout) == {"value": "found"}
