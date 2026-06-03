from __future__ import annotations

import json

import pytest
from click.testing import CliRunner

from asdl_core.clinkr.context import build_clinkr_context_object
from asdl_slots.repo_context import NoRepoSentinel
from asdl_tools.cli.cli import build_cli
from asdl_tools.cli.plugins import PluginEntryPointSource
from asdl_tools.cmux.gateway import CmuxCommandFailure
from asdl_tools.cmux.testing import FakeCmuxGateway
from asdl_tools.exec.context import AsdlExecContext


class FakePluginEntryPoint:
    def __init__(self, *, name: str, value: str) -> None:
        self.name = name
        self.value = value


class FakePluginEntryPointSource(PluginEntryPointSource):
    def __init__(self, *, entry_points: tuple[FakePluginEntryPoint, ...]) -> None:
        self._entry_points = entry_points

    def get_entry_points(self) -> tuple[FakePluginEntryPoint, ...]:
        return self._entry_points


def _entry_point_source(*entry_points: FakePluginEntryPoint) -> FakePluginEntryPointSource:
    return FakePluginEntryPointSource(entry_points=entry_points)


def test_cli_help():
    runner = CliRunner()
    result = runner.invoke(build_cli(source=_entry_point_source()), ["--help"])
    assert result.exit_code == 0
    assert "asdl CLI" in result.output


def test_cli_version():
    runner = CliRunner()
    result = runner.invoke(build_cli(source=_entry_point_source()), ["--version"])
    assert result.exit_code == 0
    assert "version" in result.output.lower()


def test_root_exec_group_is_hidden_but_invocable() -> None:
    runner = CliRunner()
    cli = build_cli(source=_entry_point_source())

    help_result = runner.invoke(cli, ["--help"])
    assert help_result.exit_code == 0
    assert "exec" not in help_result.output

    exec_help = runner.invoke(cli, ["exec", "--help"])
    assert exec_help.exit_code == 0
    assert "Commands for use by asdl-tools skills." in exec_help.output
    assert "cmux-workspace-summary" in exec_help.output


def test_cmux_workspace_summary_exec_applies_generated_fields() -> None:
    runner = CliRunner()
    fake_cmux = FakeCmuxGateway()
    ctx = AsdlExecContext(cmux=fake_cmux)

    result = runner.invoke(
        build_cli(source=_entry_point_source()),
        [
            "exec",
            "cmux-workspace-summary",
            "--workspace",
            "workspace:16",
            "--title",
            "Ship cmux summary command",
            "--goal",
            "Add a project-local Pi command that labels this cmux workspace.",
            "--current-state",
            "Extension and skill are in place.",
            "--next-action",
            "Reload Pi and smoke-test the slash command.",
            "--status",
            "cmd ready",
            "--format",
            "json",
        ],
        obj=build_clinkr_context_object(lambda: ctx),
        catch_exceptions=False,
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["exit_code"] == 0
    assert payload["data"] == {
        "success": True,
        "workspace": "workspace:16",
        "title": "Ship cmux summary command",
        "status": "cmd ready",
        "description": (
            "Goal: Add a project-local Pi command that labels this cmux workspace.\n"
            "State: Extension and skill are in place.\n"
            "Next: Reload Pi and smoke-test the slash command."
        ),
        "status_key": "pi-summary",
        "error": None,
    }
    assert fake_cmux.renamed_workspaces == [("workspace:16", "Ship cmux summary command")]
    assert fake_cmux.workspace_descriptions == [
        (
            "workspace:16",
            "Goal: Add a project-local Pi command that labels this cmux workspace.\n"
            "State: Extension and skill are in place.\n"
            "Next: Reload Pi and smoke-test the slash command.",
        )
    ]
    status_records = [
        (status.workspace, status.key, status.value, status.icon, status.color, status.priority)
        for status in fake_cmux.statuses
    ]
    assert status_records == [("workspace:16", "pi-summary", "cmd ready", "sparkle", "#7c3aed", 80)]


def test_cmux_workspace_summary_exec_falls_back_to_cmux_env() -> None:
    runner = CliRunner()
    fake_cmux = FakeCmuxGateway()
    ctx = AsdlExecContext(cmux=fake_cmux)

    result = runner.invoke(
        build_cli(source=_entry_point_source()),
        [
            "exec",
            "cmux-workspace-summary",
            "--title",
            "Env workspace",
            "--goal",
            "Use env workspace.",
            "--current-state",
            "Fields generated.",
            "--next-action",
            "Apply command.",
            "--status",
            "ready",
            "--format",
            "json",
        ],
        env={"CMUX_WORKSPACE_ID": "workspace:env", "CMUX_TAB_ID": "workspace:tab"},
        obj=build_clinkr_context_object(lambda: ctx),
        catch_exceptions=False,
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["data"]["workspace"] == "workspace:env"
    assert fake_cmux.renamed_workspaces == [("workspace:env", "Env workspace")]


def test_cmux_workspace_summary_exec_reports_missing_workspace() -> None:
    runner = CliRunner()
    fake_cmux = FakeCmuxGateway()
    ctx = AsdlExecContext(cmux=fake_cmux)

    result = runner.invoke(
        build_cli(source=_entry_point_source()),
        [
            "exec",
            "cmux-workspace-summary",
            "--title",
            "No workspace",
            "--goal",
            "Need workspace.",
            "--current-state",
            "Env missing.",
            "--next-action",
            "Report error.",
            "--status",
            "blocked",
            "--format",
            "json",
        ],
        env={"CMUX_WORKSPACE_ID": "", "CMUX_TAB_ID": ""},
        obj=build_clinkr_context_object(lambda: ctx),
        catch_exceptions=False,
    )

    assert result.exit_code == 1
    payload = json.loads(result.output)
    assert payload["exit_code"] == 1
    assert payload["data"]["success"] is False
    assert payload["data"]["error"]["code"] == "missing_workspace"
    assert fake_cmux.renamed_workspaces == []


def test_cmux_workspace_summary_exec_reports_cmux_command_failure() -> None:
    runner = CliRunner()
    fake_cmux = FakeCmuxGateway(
        fail_next=CmuxCommandFailure(
            command=("cmux", "workspace", "rename", "workspace:16", "--title", "fail"),
            exit_code=2,
            stdout="",
            stderr="workspace not found",
        )
    )
    ctx = AsdlExecContext(cmux=fake_cmux)

    result = runner.invoke(
        build_cli(source=_entry_point_source()),
        [
            "exec",
            "cmux-workspace-summary",
            "--workspace",
            "workspace:16",
            "--title",
            "fail",
            "--goal",
            "Test failure.",
            "--current-state",
            "Fake fails.",
            "--next-action",
            "Report failure.",
            "--status",
            "blocked",
            "--format",
            "json",
        ],
        obj=build_clinkr_context_object(lambda: ctx),
        catch_exceptions=False,
    )

    assert result.exit_code == 1
    payload = json.loads(result.output)
    assert payload["data"]["success"] is False
    assert payload["data"]["error"]["code"] == "rename_workspace_failed"
    assert payload["data"]["error"]["command_failure"] == {
        "command": ["cmux", "workspace", "rename", "workspace:16", "--title", "fail"],
        "exit_code": 2,
        "stdout": "",
        "stderr": "workspace not found",
    }


def test_top_level_cli_installs_plugin_context_for_slot_commands(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    runner = CliRunner()
    slot_plugin = FakePluginEntryPoint(
        name="slots",
        value="asdl_slots.cli.plugin:build_slot_plugin",
    )
    monkeypatch.setattr(
        "asdl_slots.cli.plugin.build_slots_context",
        lambda: NoRepoSentinel(message="Not inside a git repository"),
    )
    cli = build_cli(source=_entry_point_source(slot_plugin))

    result = runner.invoke(cli, ["slot", "free", "--num", "1"])

    assert result.exit_code == 2
    assert "Not inside a git repository" in result.output
    assert "ClinkrContextObject" not in result.output
