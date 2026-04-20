from __future__ import annotations

import json
import subprocess
from collections.abc import Callable

import pytest
from click.testing import CliRunner

from twerk_core.clinkr.group import ClinkrGroup
from twerk_core.gh.testing import FakeIssueGateway
from twerk_core.gh.types import Issue
from twerk_objectives.cli.main import build_cli
from twerk_objectives.cli.objective.context import ObjectivesCliContext


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def _make_fake(
    issues: tuple[Issue, ...] = (),
    *,
    raise_on: dict[str, BaseException] | None = None,
) -> Callable[[], ObjectivesCliContext]:
    ctx = ObjectivesCliContext(
        gh_issue_gateway=FakeIssueGateway(issues=issues, raise_on=raise_on),
    )
    return lambda: ctx


SAMPLE_ISSUES = (
    Issue(
        number=34,
        title="Explore using pluggy",
        state="open",
        updated_at="2026-04-08T12:00:00Z",
        url="https://github.com/org/repo/issues/34",
    ),
    Issue(
        number=24,
        title="Port pr-address from erk to twerk",
        state="open",
        updated_at="2026-04-08T08:00:00Z",
        url="https://github.com/org/repo/issues/24",
    ),
    Issue(
        number=13,
        title="Set up dprint for consistent Markdown formatting",
        state="closed",
        updated_at="2026-04-04T10:00:00Z",
        url="https://github.com/org/repo/issues/13",
    ),
)


def _json_output(result_output: str) -> dict[str, object]:
    return json.loads(result_output)


def test_objective_help(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["-h"])

    assert result.exit_code == 0
    assert "Usage: objective" in result.output
    assert "Manage objectives." in result.output
    assert "--version" in result.output
    assert "list" in result.output
    assert "json" in result.output


def test_objective_version_option(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["--version"])

    assert result.exit_code == 0
    assert "version" in result.output


def test_objective_list_help(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["list", "-h"])

    assert result.exit_code == 0
    assert "Usage: objective list" in result.output
    assert "List objectives." in result.output
    assert "--state" in result.output


def test_objective_json_help(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["json", "-h"])

    assert result.exit_code == 0
    assert "Usage: objective json" in result.output
    assert "Machine-readable command variants." in result.output
    assert "list" in result.output


def test_objective_json_list_help(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["json", "list", "-h"])

    assert result.exit_code == 0
    assert "Usage: objective json list" in result.output
    assert "List objectives. (JSON)" in result.output
    assert "--schema" in result.output


def test_objective_list_empty(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["list"], obj=_make_fake())

    assert result.exit_code == 0
    assert "No objectives found." in result.output


def test_objective_list_default_shows_open_objectives_only(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["list"], obj=_make_fake(SAMPLE_ISSUES))

    assert result.exit_code == 0
    assert "#34" in result.output
    assert "Explore using pluggy" in result.output
    assert "#24" in result.output
    assert "Port pr-address from erk to twerk" in result.output
    assert "Status" in result.output
    assert "Title" in result.output
    assert "Updated" in result.output
    assert "open" in result.output
    assert "#13" not in result.output
    assert "closed" not in result.output


def test_objective_list_state_closed(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["list", "--state", "closed"], obj=_make_fake(SAMPLE_ISSUES))

    assert result.exit_code == 0
    assert "#13" in result.output
    assert "closed" in result.output
    assert "#34" not in result.output
    assert "#24" not in result.output


def test_objective_list_state_all(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["list", "--state", "all"], obj=_make_fake(SAMPLE_ISSUES))

    assert result.exit_code == 0
    assert "#34" in result.output
    assert "#24" in result.output
    assert "#13" in result.output
    assert "open" in result.output
    assert "closed" in result.output


def test_objective_ls_alias_matches_list(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    list_result = runner.invoke(cli_group, ["list"], obj=_make_fake(SAMPLE_ISSUES))
    alias_result = runner.invoke(cli_group, ["ls"], obj=_make_fake(SAMPLE_ISSUES))

    assert list_result.exit_code == 0
    assert alias_result.exit_code == 0
    assert alias_result.output == list_result.output


def test_objective_list_long_title_ellipsizes(cli_group: ClinkrGroup) -> None:
    long_title = "A" * 200
    issues = (
        Issue(
            number=42,
            title=long_title,
            state="open",
            updated_at="2026-04-08T12:00:00Z",
            url="https://github.com/org/repo/issues/42",
        ),
    )
    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["list"],
        obj=_make_fake(issues),
        env={"COLUMNS": "200"},
    )

    assert result.exit_code == 0
    assert "#42" in result.output
    assert "…" in result.output
    assert "ago" in result.output


def test_objective_list_reports_gh_failure(cli_group: ClinkrGroup) -> None:
    failure = subprocess.CalledProcessError(1, "gh issue list", stderr="boom stderr")
    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["list"],
        obj=_make_fake(raise_on={"list": failure}),
    )

    assert result.exit_code == 1
    assert "Failed to list objectives: boom stderr" in result.output


def test_objective_json_list_empty(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["json", "list"], input="", obj=_make_fake())
    payload = _json_output(result.output)

    assert result.exit_code == 0
    assert payload == {"objectives": [], "count": 0, "success": True}


def test_objective_json_list_default_shows_open_objectives_only(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["json", "list"], input="", obj=_make_fake(SAMPLE_ISSUES))
    payload = _json_output(result.output)

    assert result.exit_code == 0
    assert payload["success"] is True
    assert payload["count"] == 2
    assert payload["objectives"] == [
        {
            "number": 34,
            "title": "Explore using pluggy",
            "state": "open",
            "updated_at": "2026-04-08T12:00:00Z",
            "url": "https://github.com/org/repo/issues/34",
        },
        {
            "number": 24,
            "title": "Port pr-address from erk to twerk",
            "state": "open",
            "updated_at": "2026-04-08T08:00:00Z",
            "url": "https://github.com/org/repo/issues/24",
        },
    ]


def test_objective_json_list_rejects_state_option(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["json", "list", "--state", "all"], input="")

    assert result.exit_code == 2
    assert "No such option: --state" in result.output


def test_objective_json_list_reports_gh_failure(cli_group: ClinkrGroup) -> None:
    failure = subprocess.CalledProcessError(1, "gh issue list", stderr="boom stderr")
    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["json", "list"],
        obj=_make_fake(raise_on={"list": failure}),
    )
    payload = _json_output(result.output)

    assert result.exit_code == 1
    assert payload == {
        "success": False,
        "error_type": "gh_cli_failure",
        "message": "Failed to list objectives: boom stderr",
    }


def test_objective_json_list_schema(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["json", "list", "--schema"])
    payload = _json_output(result.output)

    assert result.exit_code == 0
    assert set(payload) == {"input_schema", "output_schema", "error_schema"}


def test_objective_public_commands_have_json_counterparts(cli_group: ClinkrGroup) -> None:
    json_group = cli_group.commands["json"]
    public_commands = {name for name in cli_group.commands if name != "json"}

    assert public_commands <= set(json_group.commands)
