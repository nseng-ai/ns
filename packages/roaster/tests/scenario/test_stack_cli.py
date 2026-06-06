from __future__ import annotations

from pathlib import Path

import pytest
from click.testing import CliRunner

from asdl_core.clinkr.context import ClinkrContextObject, build_clinkr_context_object
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.gh.pr_testing import FakePRGateway
from roaster.cli.main import build_cli
from roaster.context import RoasterCliContext
from roaster.gateways.local_diff.fake import FakeLocalDiffGateway
from roaster.gateways.review_catalog.fake import FakeReviewCatalogGateway
from roaster.harness.fake import FakeHarnessRuntime


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def _context(cwd: Path) -> ClinkrContextObject:
    ctx = RoasterCliContext(
        catalog=FakeReviewCatalogGateway(),
        diff=FakeLocalDiffGateway(),
        harness_runtime=FakeHarnessRuntime(),
        pr_gateway=FakePRGateway(),
        cwd=cwd,
    )
    return build_clinkr_context_object(lambda: ctx)


def _write_profile(cwd: Path, slug: str, source: str = "Loose stack guidance.\n") -> Path:
    profile_path = cwd / ".roaster" / "profiles" / f"{slug}.md"
    profile_path.parent.mkdir(parents=True)
    profile_path.write_text(source, encoding="utf-8")
    return profile_path


def test_roaster_help_lists_visible_stack_group(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["-h"])

    assert result.exit_code == 0, result.output
    assert "stack" in result.output
    assert "Graphite" in result.output


def test_stack_help_mentions_graphite_and_run(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["stack", "-h"])

    assert result.exit_code == 0, result.output
    assert "Graphite" in result.output
    assert "gt" in result.output
    assert "run" in result.output


def test_stack_run_help_shapes_future_contract(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["stack", "run", "-h"])

    assert result.exit_code == 0, result.output
    assert "Graphite" in result.output
    for option in (
        "--target-branch",
        "--target-pr",
        "--reviewer",
        "--model",
        "--agent-model",
        "--harness",
        "--base-ref",
        "--dry-run",
        "--new-run",
        "--run-slug",
        "--triage-prompt",
        "--resolver-prompt",
    ):
        assert option in result.output


def test_stack_run_loads_loose_profile_and_renders_options(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    profile_path = _write_profile(
        tmp_path,
        "thermonuclear-stack",
        "# Profile\n\nRaw loose guidance.\n",
    )

    result = CliRunner().invoke(
        cli_group,
        [
            "stack",
            "run",
            "thermonuclear-stack",
            "--target-branch",
            "feature/target",
            "--target-pr",
            "123",
            "--reviewer",
            "dignified-python",
            "--reviewer",
            "pytest",
            "--model",
            "sonnet",
            "--agent-model",
            "opus",
            "--harness",
            "claude-code",
            "--base-ref",
            "master",
            "--dry-run",
            "--new-run",
            "--run-slug",
            "stack-run-1",
            "--triage-prompt",
            "triage guidance",
            "--resolver-prompt",
            "resolver guidance",
        ],
        obj=_context(tmp_path),
    )

    assert result.exit_code == 0, result.output
    assert "Roaster Graphite stack run" in result.output
    assert f"Profile: thermonuclear-stack ({profile_path})" in result.output
    assert "Profile markdown is loose guidance only" in result.output
    assert "roaster did not parse it deterministically" in result.output
    assert "no gt commands were run" in result.output
    assert "Dry run: yes" in result.output
    assert "New run: yes" in result.output
    assert "Target branch: feature/target" in result.output
    assert "Target PR: 123" in result.output
    assert "Base ref: master" in result.output
    assert "Reviewers: dignified-python, pytest" in result.output
    assert "Model: sonnet" in result.output
    assert "Agent model: opus" in result.output
    assert "Harness: claude-code" in result.output
    assert "Run slug: stack-run-1" in result.output
    assert "Triage prompt: triage guidance" in result.output
    assert "Resolver prompt: resolver guidance" in result.output


def test_stack_run_fails_for_missing_profile(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["stack", "run", "missing-profile"],
        obj=_context(tmp_path),
    )

    assert result.exit_code == 2
    assert "No roaster stack profile found for slug 'missing-profile'" in result.output
    assert ".roaster/profiles/missing-profile.md" in result.output


def test_stack_run_fails_for_invalid_profile_slug(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["stack", "run", "../secret"],
        obj=_context(tmp_path),
    )

    assert result.exit_code == 2
    assert "profile slug must be one safe path segment" in result.output
    assert "../secret" in result.output
