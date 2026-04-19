"""Scenario coverage for the clinkr ``exit_false_field`` dispatcher hook."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

import click
from click.testing import CliRunner

from twerk_core.clinkr.command import ClinkrCommandError
from twerk_core.clinkr.group import ClinkrGroup
from twerk_core.clinkr.operation import clinkr_operation


@dataclass(frozen=True)
class ProbeRequest:
    name: str


@dataclass(frozen=True)
class ProbeResult:
    name: str
    ok: bool
    absent_message: str | None = None

    def to_json_dict(self) -> dict[str, Any]:
        return {"name": self.name, "ok": self.ok}


def _render_probe(result: ProbeResult) -> None:
    click.echo(f"present: {result.name}")


@clinkr_operation(
    name="probe",
    help="Probe.",
    human_renderer=_render_probe,
    exit_false_field="ok",
)
def _probe(ctx: click.Context, request: ProbeRequest) -> ProbeResult | ClinkrCommandError:
    if request.name == "boom":
        return ClinkrCommandError(error_type="boom", message="explosion")
    if request.name == "missing":
        return ProbeResult(
            name=request.name,
            ok=False,
            absent_message=f"not found: {request.name}",
        )
    return ProbeResult(name=request.name, ok=True)


def _make_group() -> ClinkrGroup:
    return ClinkrGroup("test", help="Test.", operations=[_probe])


def _runner() -> CliRunner:
    return CliRunner()


def test_human_present_renders_and_exits_zero() -> None:
    result = _runner().invoke(_make_group(), ["probe", "alice"])

    assert result.exit_code == 0, result.stderr
    assert result.stdout.strip() == "present: alice"
    assert result.stderr == ""


def test_human_absent_emits_stderr_and_exits_one() -> None:
    result = _runner().invoke(_make_group(), ["probe", "missing"])

    assert result.exit_code == 1
    assert result.stdout == ""
    assert result.stderr.strip() == "not found: missing"


def test_human_command_error_exits_two() -> None:
    result = _runner().invoke(_make_group(), ["probe", "boom"])

    assert result.exit_code == 2
    assert result.stdout == ""
    assert "error: explosion" in result.stderr


def test_json_present_returns_success_true() -> None:
    result = CliRunner().invoke(
        _make_group(),
        ["json", "probe"],
        input=json.dumps({"name": "alice"}),
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload == {"success": True, "name": "alice", "ok": True}


def test_json_absent_still_returns_success_true_with_ok_false() -> None:
    result = CliRunner().invoke(
        _make_group(),
        ["json", "probe"],
        input=json.dumps({"name": "missing"}),
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload == {"success": True, "name": "missing", "ok": False}


def test_json_command_error_exits_one() -> None:
    result = CliRunner().invoke(
        _make_group(),
        ["json", "probe"],
        input=json.dumps({"name": "boom"}),
    )

    assert result.exit_code == 1
    payload = json.loads(result.output)
    assert payload["success"] is False
    assert payload["error_type"] == "boom"
