from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Annotated

import click
from click.testing import CliRunner

from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.format_command import add_format_operation
from twerk_core.clinkr.group import ClinkrGroup
from twerk_core.clinkr.operation import clinkr_operation


@dataclass(frozen=True)
class ProbeRequest:
    name: Annotated[str, click.Argument(["name"])]


@dataclass(frozen=True)
class ProbeResult:
    name: str
    exists: bool
    absent_message: str | None = None

    def to_json_dict(self) -> dict[str, object]:
        return {"name": self.name, "exists": self.exists}


def _render_probe(result: ProbeResult) -> None:
    click.echo(f"found: {result.name}")


@clinkr_operation(name="probe", help="Probe.", human_renderer=_render_probe)
def _probe(ctx: click.Context, request: ProbeRequest) -> ClinkrExit[ProbeResult]:
    if request.name == "missing":
        return ClinkrExit.negative(
            ProbeResult(
                name=request.name,
                exists=False,
                absent_message=f"not found: {request.name}",
            ),
            exit_code=1,
        )
    if request.name == "boom":
        return ClinkrExit.fail(error_type="boom", message="it broke", exit_code=2)
    return ClinkrExit.ok(ProbeResult(name=request.name, exists=True))


def _make_group(*, legacy_alias: bool = True) -> ClinkrGroup:
    group = ClinkrGroup("test", help="Test group.")
    add_format_operation(group, _probe, add_legacy_json_alias=legacy_alias)
    return group


def test_text_mode_success() -> None:
    result = CliRunner().invoke(_make_group(), ["probe", "alice"])

    assert result.exit_code == 0
    assert result.output.strip() == "found: alice"


def test_text_mode_negative_uses_stderr_and_exit_code() -> None:
    result = CliRunner().invoke(_make_group(), ["probe", "missing"])

    assert result.exit_code == 1
    assert result.output.strip() == "not found: missing"


def test_json_mode_success_uses_direct_payload() -> None:
    result = CliRunner().invoke(_make_group(), ["probe", "alice", "--format", "json"])
    payload = json.loads(result.output)

    assert result.exit_code == 0
    assert payload == {"name": "alice", "exists": True}


def test_json_mode_negative_uses_direct_payload_and_negative_exit_code() -> None:
    result = CliRunner().invoke(_make_group(), ["probe", "missing", "--format", "json"])
    payload = json.loads(result.output)

    assert result.exit_code == 1
    assert payload == {"name": "missing", "exists": False}


def test_json_mode_failure_uses_direct_error_payload() -> None:
    result = CliRunner().invoke(_make_group(), ["probe", "boom", "--format", "json"])
    payload = json.loads(result.output)

    assert result.exit_code == 2
    assert payload == {
        "success": False,
        "error_type": "boom",
        "message": "it broke",
    }


def test_legacy_json_alias_preserves_success_envelope() -> None:
    result = CliRunner().invoke(
        _make_group(),
        ["json", "probe"],
        input='{"name": "missing"}',
    )
    payload = json.loads(result.output)

    assert result.exit_code == 0
    assert payload == {"success": True, "name": "missing", "exists": False}
