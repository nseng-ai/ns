from __future__ import annotations

import json
import subprocess

import pytest
from click.testing import CliRunner

from clinkr.group import ClinkrGroup, discover_group
from twerk_core.gh import real_issue_gateway
from twerk_core.gh.testing import FakeIssueGateway
from twerk_core.gh.types import Issue


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return discover_group("twerk_objectives.cli.objective")


def _make_fake(issues: tuple[Issue, ...] = ()) -> dict[str, object]:
    return {"gh_issue_gateway": FakeIssueGateway(issues=issues)}


SAMPLE_ISSUES = (
    Issue(
        number=34,
        title="Explore using pluggy",
        state="open",
        updated_at="2026-04-08T12:00:00Z",
    ),
    Issue(
        number=24,
        title="Port pr-address from erk to twerk",
        state="open",
        updated_at="2026-04-08T08:00:00Z",
    ),
    Issue(
        number=13,
        title="Set up dprint for consistent Markdown formatting",
        state="closed",
        updated_at="2026-04-04T10:00:00Z",
    ),
)


def test_objective_list_falls_back_to_real_gateway(
    cli_group: ClinkrGroup,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """End-to-end: `twerk objective list` with no gateway injected.

    When a real user runs `twerk objective list`, nothing populates
    `ctx.obj["gh_issue_gateway"]`, so `_gateway_access.get_gh_issue_gateway()`
    falls back to `RealIssueGateway()`. Every other test in this file
    short-circuits that fallback by injecting a `FakeIssueGateway` via
    `obj=...`, which is why the regression where `RealIssueGateway` was
    missing 8 abstract methods slipped past CI and only surfaced when a
    user ran the command:

        TypeError: Can't instantiate abstract class RealIssueGateway
        without an implementation for abstract methods ...

    This test walks the real fallback path with `gh` stubbed out — so we
    instantiate `RealIssueGateway`, call `.list()`, and render the result
    the same way the user does, without touching the network.
    """
    fake_gh_output = json.dumps(
        [
            {
                "number": 7,
                "title": "Stubbed objective",
                "state": "open",
                "updatedAt": "2026-04-08T12:00:00Z",
            }
        ]
    )

    def fake_run(
        cmd: list[str],
        **kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        assert cmd[:3] == ["gh", "issue", "list"]
        assert "--label" in cmd
        assert cmd[cmd.index("--label") + 1] == "twerk-objective"
        return subprocess.CompletedProcess(cmd, 0, stdout=fake_gh_output, stderr="")

    monkeypatch.setattr(real_issue_gateway.subprocess, "run", fake_run)

    runner = CliRunner()
    # Deliberately no obj= — force the production fallback to RealIssueGateway.
    result = runner.invoke(cli_group, ["list"])

    assert result.exit_code == 0, result.output
    assert "#7" in result.output
    assert "Stubbed objective" in result.output


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
        Issue(
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


# -- standalone CLI tests --


class TestStandaloneCli:
    @pytest.fixture()
    def standalone_group(self) -> ClinkrGroup:
        from twerk_objectives.cli.main import build_cli

        return build_cli()

    def test_version_option(self, standalone_group: ClinkrGroup) -> None:
        runner = CliRunner()
        result = runner.invoke(standalone_group, ["--version"])
        assert result.exit_code == 0
        assert "version" in result.output

    def test_help_short_flag(self, standalone_group: ClinkrGroup) -> None:
        runner = CliRunner()
        result = runner.invoke(standalone_group, ["-h"])
        assert result.exit_code == 0
        assert "Manage objectives." in result.output
        assert "--version" in result.output

    def test_subcommands_present(self, standalone_group: ClinkrGroup) -> None:
        runner = CliRunner()
        result = runner.invoke(standalone_group, ["-h"])
        assert result.exit_code == 0
        assert "list" in result.output
        assert "json" in result.output
