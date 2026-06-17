from __future__ import annotations

import json
from pathlib import Path

import pytest
from click.testing import CliRunner

from asdl_core.clinkr.context import build_clinkr_context_object
from asdl_core.gh.pr_testing import FakePRGateway
from asdl_core.gh.types import PRReviewComment, PRReviewThread
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
        self.call_count = 0

    def get_entry_points(self) -> tuple[FakePluginEntryPoint, ...]:
        self.call_count += 1
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


def test_cli_runtime_does_not_discover_plugins():
    runner = CliRunner()
    source = _entry_point_source(FakePluginEntryPoint(name="bad", value="missing.module:build"))
    result = runner.invoke(build_cli(source=source), ["--runtime"])
    assert result.exit_code == 0
    assert result.output == "runtime: python\nentry_point: asdl_tools.cli.cli:main\n"
    assert source.call_count == 0


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
    assert "resolve-prompt" in exec_help.output
    assert "gh" in exec_help.output

    gh_help = runner.invoke(cli, ["exec", "gh", "--help"])
    assert gh_help.exit_code == 0
    assert "GitHub primitives for skill/agent invocation." in gh_help.output
    assert "review-threads" in gh_help.output
    assert "resolve-review-threads" in gh_help.output


def test_resolve_prompt_exec_reads_repo_prompt(tmp_path: Path) -> None:
    prompt_path = tmp_path / ".asdl" / "prompts" / "example.md"
    prompt_path.parent.mkdir(parents=True)
    prompt_path.write_text("repo prompt\n\n", encoding="utf-8")

    result = CliRunner().invoke(
        build_cli(source=_entry_point_source()),
        [
            "exec",
            "resolve-prompt",
            "example",
            "--repo-root",
            str(tmp_path),
            "--format",
            "json",
        ],
        catch_exceptions=False,
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["exit_code"] == 0
    assert payload["data"]["name"] == "example"
    assert payload["data"]["content"] == "repo prompt\n\n"
    assert payload["data"]["provenance"] == {
        "source": "repo",
        "repo_prompt_path": str(prompt_path),
        "prompt_path": str(prompt_path),
        "default_name": None,
    }


def test_resolve_prompt_exec_uses_plans_write_default(tmp_path: Path) -> None:
    result = CliRunner().invoke(
        build_cli(source=_entry_point_source()),
        [
            "exec",
            "resolve-prompt",
            "plans-write",
            "--repo-root",
            str(tmp_path),
            "--format",
            "json",
        ],
        catch_exceptions=False,
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["data"]["name"] == "plans-write"
    assert payload["data"]["provenance"]["source"] == "embedded_default"
    assert payload["data"]["content"].startswith("Plan audience and context contract:")
    assert "write_saved_plan_file" in payload["data"]["content"]


def test_resolve_prompt_exec_rejects_unsafe_name(tmp_path: Path) -> None:
    result = CliRunner().invoke(
        build_cli(source=_entry_point_source()),
        [
            "exec",
            "resolve-prompt",
            "nested/prompt",
            "--repo-root",
            str(tmp_path),
            "--format",
            "json",
        ],
    )

    assert result.exit_code != 0
    assert "prompt_name_invalid" in result.output
    assert "Prompt name must match safe segment pattern" in result.output


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
            "--description",
            "Goal: Add a project-local Pi command that labels this cmux workspace.",
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
        "description": "Goal: Add a project-local Pi command that labels this cmux workspace.",
        "status_key": "pi-summary",
        "error": None,
    }
    assert fake_cmux.renamed_workspaces == [("workspace:16", "Ship cmux summary command")]
    assert fake_cmux.workspace_descriptions == [
        (
            "workspace:16",
            "Goal: Add a project-local Pi command that labels this cmux workspace.",
        )
    ]
    assert fake_cmux.cleared_statuses == [("workspace:16", "pi-summary")]


def test_cmux_workspace_summary_exec_accepts_description() -> None:
    runner = CliRunner()
    fake_cmux = FakeCmuxGateway()
    ctx = AsdlExecContext(cmux=fake_cmux)
    description = "Goal: Use one command."

    result = runner.invoke(
        build_cli(source=_entry_point_source()),
        [
            "exec",
            "cmux-workspace-summary",
            "--workspace",
            "workspace:16",
            "--title",
            "Single command summary",
            "--description",
            description,
            "--format",
            "json",
        ],
        obj=build_clinkr_context_object(lambda: ctx),
        catch_exceptions=False,
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["exit_code"] == 0
    assert payload["data"]["description"] == description
    assert fake_cmux.workspace_descriptions == [("workspace:16", description)]


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
            "--description",
            "Goal: Use env workspace.",
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
            "--description",
            "Goal: Need workspace.",
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


def test_cmux_workspace_summary_exec_requires_description() -> None:
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
            "Missing description",
            "--format",
            "json",
        ],
        obj=build_clinkr_context_object(lambda: ctx),
        catch_exceptions=False,
    )

    assert result.exit_code == 1
    payload = json.loads(result.output)
    assert payload["data"]["success"] is False
    assert payload["data"]["error"]["code"] == "missing_description"
    assert fake_cmux.renamed_workspaces == []
    assert fake_cmux.workspace_descriptions == []
    assert fake_cmux.cleared_statuses == []


def test_gh_review_threads_exec_filters_threads_and_serializes_comments() -> None:
    thread = PRReviewThread(
        id="PRRT_open",
        path="src/app.ts",
        line=12,
        start_line=None,
        is_resolved=False,
        is_outdated=True,
        comments=(
            PRReviewComment(
                id=101,
                body="Please fix",
                author="github-actions",
                path="src/app.ts",
                line=12,
                start_line=None,
                created_at="2026-06-16T00:00:00Z",
            ),
        ),
    )
    fake_pr = FakePRGateway(review_threads={1700: [thread]})
    ctx = AsdlExecContext(cmux=FakeCmuxGateway(), pr_gateway=lambda repo: fake_pr)

    result = CliRunner().invoke(
        build_cli(source=_entry_point_source()),
        [
            "exec",
            "gh",
            "review-threads",
            "1700",
            "--thread-id",
            "PRRT_open",
            "--format",
            "json",
        ],
        obj=build_clinkr_context_object(lambda: ctx),
        catch_exceptions=False,
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["data"] == {
        "pr_number": 1700,
        "include_resolved": False,
        "requested_thread_ids": ["PRRT_open"],
        "threads": [
            {
                "id": "PRRT_open",
                "path": "src/app.ts",
                "line": 12,
                "start_line": None,
                "is_resolved": False,
                "is_outdated": True,
                "comments": [
                    {
                        "id": 101,
                        "body": "Please fix",
                        "author": "github-actions",
                        "path": "src/app.ts",
                        "line": 12,
                        "start_line": None,
                        "created_at": "2026-06-16T00:00:00Z",
                    }
                ],
            }
        ],
    }


def test_gh_resolve_review_threads_exec_resolves_each_thread() -> None:
    fake_pr = FakePRGateway(
        review_threads={
            1700: [
                PRReviewThread(
                    id="PRRT_a",
                    path="a.ts",
                    line=1,
                    is_resolved=False,
                    is_outdated=False,
                    comments=(),
                ),
                PRReviewThread(
                    id="PRRT_b",
                    path="b.ts",
                    line=2,
                    is_resolved=False,
                    is_outdated=False,
                    comments=(),
                ),
            ]
        }
    )
    ctx = AsdlExecContext(cmux=FakeCmuxGateway(), pr_gateway=lambda repo: fake_pr)

    result = CliRunner().invoke(
        build_cli(source=_entry_point_source()),
        [
            "exec",
            "gh",
            "resolve-review-threads",
            "PRRT_a",
            "PRRT_b",
            "--format",
            "json",
        ],
        obj=build_clinkr_context_object(lambda: ctx),
        catch_exceptions=False,
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["data"] == {
        "states": [
            {"thread_id": "PRRT_a", "is_resolved": True},
            {"thread_id": "PRRT_b", "is_resolved": True},
        ]
    }
    assert fake_pr.resolved_thread_ids == ("PRRT_a", "PRRT_b")


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
            "--description",
            "Goal: Test failure.",
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
