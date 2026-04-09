from __future__ import annotations

import pytest
from click.testing import CliRunner

from clinkr.group import ClinkrGroup, discover_group
from twerk_objectives.gateway import ObjectiveIssueSummary
from twerk_objectives.testing import FakeObjectivesGitHub


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return discover_group("twerk_objectives.cli.objective")


def _make_fake(
    objectives: tuple[ObjectiveIssueSummary, ...] = (),
) -> dict[str, FakeObjectivesGitHub]:
    return {"objectives_gateway": FakeObjectivesGitHub(objectives=objectives)}


SAMPLE_OBJECTIVES = (
    ObjectiveIssueSummary(
        number=34,
        title="Explore using pluggy",
        state="open",
        updated_at="2026-04-08T12:00:00Z",
    ),
    ObjectiveIssueSummary(
        number=24,
        title="Port pr-address from erk to twerk",
        state="open",
        updated_at="2026-04-08T08:00:00Z",
    ),
    ObjectiveIssueSummary(
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
    result = runner.invoke(cli_group, ["list"], obj=_make_fake(SAMPLE_OBJECTIVES))
    assert result.exit_code == 0
    assert "#34" in result.output
    assert "Explore using pluggy" in result.output
    assert "#24" in result.output
    assert "Port pr-address from erk to twerk" in result.output
    # closed objective should not appear in default (open) listing
    assert "#13" not in result.output


def test_objective_list_state_all(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["list", "--state", "all"], obj=_make_fake(SAMPLE_OBJECTIVES))
    assert result.exit_code == 0
    assert "#34" in result.output
    assert "#24" in result.output
    assert "#13" in result.output


def test_objective_list_state_closed(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["list", "--state", "closed"],
        obj=_make_fake(SAMPLE_OBJECTIVES),
    )
    assert result.exit_code == 0
    assert "#13" in result.output
    assert "#34" not in result.output


def test_objective_ls_alias(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["ls"], obj=_make_fake(SAMPLE_OBJECTIVES))
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
        obj=_make_fake(SAMPLE_OBJECTIVES),
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
