from __future__ import annotations

import json
from pathlib import Path

import click
from click.testing import CliRunner

from twerk.cli.plugins import PluginEntryPointSource, discover_plugins
from twerk_core.gh.testing import FakeIssueGateway
from twerk_reviewer.context import ReviewerCliContext
from twerk_reviewer.gateways.local_diff.fake import FakeLocalDiffGateway
from twerk_reviewer.gateways.review_definition.fake import FakeReviewDefinitionGateway
from twerk_reviewer.gateways.review_execution.fake import FakeReviewExecutionGateway
from twerk_reviewer.models import LocalDiff, ReviewExecutionResponse, ReviewFinding


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


def test_discover_plugins_skips_plugin_that_fails_to_load() -> None:
    parent = click.Group("test")
    ep = FakePluginEntryPoint(name="crasher", value="nonexistent.module.path")

    discover_plugins(parent, source=_entry_point_source(ep))

    assert len(parent.commands) == 0


def test_discover_plugins_no_plugins() -> None:
    parent = click.Group("test")

    discover_plugins(parent, source=_entry_point_source())

    assert len(parent.commands) == 0


def test_objective_plugin_integration() -> None:
    parent = click.Group("test")
    ep = FakePluginEntryPoint(name="objectives", value="twerk_objectives.cli.objective")

    discover_plugins(parent, source=_entry_point_source(ep))

    runner = CliRunner()
    obj = {"gh_issue_gateway": FakeIssueGateway()}

    result = runner.invoke(parent, ["objective", "list"], obj=obj)
    assert result.exit_code == 0
    assert "No objectives found." in result.output

    result = runner.invoke(parent, ["objective", "ls"], obj=obj)
    assert result.exit_code == 0
    assert "No objectives found." in result.output

    result = runner.invoke(parent, ["objective", "json", "list"], input="", obj=obj)
    assert result.exit_code == 0
    assert '"success": true' in result.output


def test_pr_address_plugin_integration() -> None:
    parent = click.Group("test")
    ep = FakePluginEntryPoint(name="pr_address", value="twerk_pr_address.cli.pr_address")

    discover_plugins(parent, source=_entry_point_source(ep))

    runner = CliRunner()
    obj = {"gh_issue_gateway": FakeIssueGateway()}

    # Plugin mounts at expected subgroup name with exec subcommand.
    result = runner.invoke(parent, ["pr-address", "--help"])
    assert result.exit_code == 0
    assert "exec" in result.output

    # A representative operation routes correctly through the plugin path.
    result = runner.invoke(parent, ["pr-address", "exec", "get-review-comments", "99"], obj=obj)
    assert result.exit_code == 0
    output = json.loads(result.output)
    assert output["count"] == 0


def test_reviewer_plugin_integration() -> None:
    parent = click.Group("test")
    ep = FakePluginEntryPoint(name="reviewer", value="twerk_reviewer.cli.reviewer")

    discover_plugins(parent, source=_entry_point_source(ep))

    runner = CliRunner()
    obj = ReviewerCliContext(
        review_definition=FakeReviewDefinitionGateway(
            sources_by_path={
                Path("standards/dignified-python.md"): (
                    "---\n"
                    "description: Review Python diffs for style violations.\n"
                    "---\n"
                    "\n"
                    "Flag concrete issues in the diff.\n"
                )
            }
        ),
        local_diff=FakeLocalDiffGateway(
            default_result=LocalDiff(
                base_ref="master",
                diff_text="diff --git a/app.py b/app.py\n+print('hello')\n",
            )
        ),
        review_execution=FakeReviewExecutionGateway(
            default_response=ReviewExecutionResponse(
                findings=(
                    ReviewFinding(
                        path="app.py",
                        line=1,
                        severity="warning",
                        summary="Avoid print in library code",
                        details="Use click.echo() or structured logging instead.",
                    ),
                )
            )
        ),
    )

    result = runner.invoke(
        parent,
        [
            "reviewer",
            "review-local",
            "standards/dignified-python.md",
            "--model",
            "gpt-5-mini",
        ],
        obj=obj,
    )
    assert result.exit_code == 0
    assert "dignified-python" in result.output

    result = runner.invoke(
        parent,
        ["reviewer", "json", "review-local"],
        input=json.dumps(
            {
                "review_path": "standards/dignified-python.md",
                "model": "gpt-5-mini",
            }
        ),
        obj=obj,
    )
    assert result.exit_code == 0
    output = json.loads(result.output)
    assert output["count"] == 1
    assert output["findings"][0]["path"] == "app.py"
