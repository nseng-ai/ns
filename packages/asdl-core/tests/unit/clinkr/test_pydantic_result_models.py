from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Annotated, Literal, TypeAlias

import click
import pytest
from click.testing import CliRunner
from pydantic import Field

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


class UnionOkResult(ClinkrModel):
    status: Literal["ok"]
    value: str


class UnionBlockedResult(ClinkrModel):
    status: Literal["blocked"]
    reason: str


UnionProbeResult: TypeAlias = Annotated[
    UnionOkResult | UnionBlockedResult,
    Field(discriminator="status"),
]


class BadPlainResult:
    value: str


BadUnionProbeResult: TypeAlias = BadPlainResult | UnionOkResult


@clinkr_operation(name="probe", help="Pydantic result probe.")
def run_pydantic_probe(
    ctx: click.Context,
    request: PydanticProbeRequest,
) -> ClinkrExit[PydanticProbeResult]:
    del ctx
    return ClinkrExit.ok(PydanticProbeResult(value=request.value))


@clinkr_operation(name="union", help="Pydantic union result probe.")
def run_union_probe(
    ctx: click.Context,
    request: PydanticProbeRequest,
) -> ClinkrExit[UnionProbeResult]:
    del ctx
    if request.value == "blocked":
        return ClinkrExit.ok(UnionBlockedResult(status="blocked", reason="not ready"))
    return ClinkrExit.ok(UnionOkResult(status="ok", value=request.value))


def _make_group() -> ClinkrGroup:
    return ClinkrGroup(
        name="pydantic-probes",
        operations=[run_pydantic_probe, run_union_probe],
    )


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


def test_discriminated_union_output_schema_uses_type_adapter() -> None:
    result = CliRunner().invoke(_make_group(), ["union", "--schema"])

    assert result.exit_code == 0
    doc = json.loads(result.stdout)
    assert doc["output_schema"]["discriminator"]["propertyName"] == "status"
    assert len(doc["output_schema"]["oneOf"]) == 2


def test_discriminated_union_serializes_into_machine_envelope() -> None:
    result = CliRunner().invoke(
        _make_group(),
        ["union", "blocked", "--format", "json"],
        obj=_runtime_obj(),
    )

    assert result.exit_code == 0
    assert json.loads(result.stdout) == {
        "exit_code": 0,
        "data": {"status": "blocked", "reason": "not ready"},
    }


def test_operation_registration_rejects_non_pydantic_union_result_shape() -> None:
    with pytest.raises(TypeError, match="must be Pydantic-compatible"):

        @clinkr_operation(name="bad-union")
        def bad_union(
            ctx: click.Context,
            request: PydanticProbeRequest,
        ) -> ClinkrExit[BadUnionProbeResult]:
            del ctx, request
            return ClinkrExit.ok(UnionOkResult(status="ok", value="x"))
