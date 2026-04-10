from __future__ import annotations

import pytest
from click.testing import CliRunner

from clinkr.group import ClinkrGroup, discover_group
from twerk_core.gh.testing import FakeGhIssueGateway
from twerk_core.gh.types import GhIssue


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return discover_group("twerk_objectives.cli.objective")


def _make_fake(issues: tuple[GhIssue, ...] = ()) -> dict[str, object]:
    return {"issue_gateway": FakeGhIssueGateway(issues=issues)}


SAMPLE_ISSUES = (
    GhIssue(
        number=34,
        title="Explore using pluggy",
        state="open",
        updated_at="2026-04-08T12:00:00Z",
    ),
    GhIssue(
        number=24,
        title="Port pr-address from erk to twerk",
        state="open",
        updated_at="2026-04-08T08:00:00Z",
    ),
    GhIssue(
        number=13,
        title="Set up dprint for consistent Markdown formatting",
        state="closed",
        updated_at="2026-04-04T10:00:00Z",
    ),
)


def test_objective_list_empty(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["list"], obj=_make_fake())
    assert result.exit_code == 0
    assert "No objectives found." in result.output


def test_objective_list_with_objectives(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["list"], obj=_make_fake(SAMPLE_ISSUES))
    assert result.exit_code == 0
    assert "#34" in result.output
    assert "Explore using pluggy" in result.output
    assert "#24" in result.output
    assert "Port pr-address from erk to twerk" in result.output
    # styled header from twerk-core's make_table()
    assert "Status" in result.output
    assert "Title" in result.output
    assert "Updated" in result.output
    # state label appears next to open objectives
    assert "open" in result.output
    # closed objective should not appear in default (open) listing
    assert "#13" not in result.output


def test_objective_list_state_all_renders_state_labels(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["list", "--state", "all"], obj=_make_fake(SAMPLE_ISSUES))
    assert result.exit_code == 0
    assert "#34" in result.output
    assert "#13" in result.output
    # both state labels should be present in --state all output
    assert "open" in result.output
    assert "closed" in result.output


def test_objective_list_long_title_ellipsizes(cli_group: ClinkrGroup) -> None:
    long_title = "A" * 200
    issues = (
        GhIssue(
            number=42,
            title=long_title,
            state="open",
            updated_at="2026-04-08T12:00:00Z",
        ),
    )
    runner = CliRunner()
    # Force a generous width so Rich ellipsizes the title (not the # / status columns)
    result = runner.invoke(
        cli_group,
        ["list"],
        obj=_make_fake(issues),
        env={"COLUMNS": "200"},
    )
    assert result.exit_code == 0
    assert "#42" in result.output
    # Rich should ellipsize a 200-char title with the … glyph
    assert "…" in result.output
    # row should still terminate with the rendered relative time
    assert "ago" in result.output


def test_objective_list_state_all(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["list", "--state", "all"], obj=_make_fake(SAMPLE_ISSUES))
    assert result.exit_code == 0
    assert "#34" in result.output
    assert "#24" in result.output
    assert "#13" in result.output


def test_objective_list_state_closed(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["list", "--state", "closed"],
        obj=_make_fake(SAMPLE_ISSUES),
    )
    assert result.exit_code == 0
    assert "#13" in result.output
    assert "#34" not in result.output


def test_objective_ls_alias(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["ls"], obj=_make_fake(SAMPLE_ISSUES))
    assert result.exit_code == 0
    assert "#34" in result.output


def test_objective_help(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["--help"])
    assert result.exit_code == 0
    assert "Usage: objective" in result.output
    assert "Manage objectives." in result.output
    assert "json" in result.output
    assert "list" in result.output


def test_objective_json_list(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["json", "list"],
        input="",
        obj=_make_fake(SAMPLE_ISSUES),
    )
    assert result.exit_code == 0
    assert '"success": true' in result.output
    assert '"count": 2' in result.output
    assert '"number": 34' in result.output


def test_objective_json_list_schema(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["json", "list", "--schema"])
    assert result.exit_code == 0
    assert '"input_schema"' in result.output
    assert '"output_schema"' in result.output


def test_objective_public_commands_have_json_counterparts(
    cli_group: ClinkrGroup,
) -> None:
    json_group = cli_group.commands["json"]
    public_commands = {name for name in cli_group.commands if name != "json"}

    assert public_commands <= set(json_group.commands)
