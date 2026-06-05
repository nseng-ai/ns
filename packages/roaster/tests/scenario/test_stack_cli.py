from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
import yaml
from click.testing import CliRunner

from asdl_core.clinkr.context import ClinkrContextObject, build_clinkr_context_object
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.gh.pr_testing import FakePRGateway
from brmem.fake import FakeBranchMemoryGateway
from roaster.cli.main import build_cli
from roaster.context import RoasterCliContext
from roaster.gateways.agent_runner.fake import FakeAgentRunnerGateway
from roaster.gateways.agent_runner.gateway import AgentRunCompleted
from roaster.gateways.local_diff.fake import FakeLocalDiffGateway
from roaster.gateways.review_catalog.fake import FakeReviewCatalogGateway
from roaster.harness.fake import FakeHarnessRuntime
from roaster.models import FindingsReview, LocalDiff, ReviewExecutionResponse, ReviewFinding


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


PYTHON_REVIEW_SOURCE = (
    "---\n"
    "description: Review Python diffs.\n"
    "default_model: sonnet\n"
    "when_changed:\n"
    "  - '**/*.py'\n"
    "---\n"
    "\n"
    "Flag Python issues.\n"
)


def _context(cwd: Path) -> ClinkrContextObject:
    ctx = RoasterCliContext(
        catalog=FakeReviewCatalogGateway(
            review_sources_by_key={
                "dignified-python": PYTHON_REVIEW_SOURCE,
                "pytest": PYTHON_REVIEW_SOURCE,
            }
        ),
        diff=FakeLocalDiffGateway(
            default_diff=LocalDiff(
                base_ref="master",
                diff_text="diff --git a/app.py b/app.py\n+print('hello')\n",
                changed_paths=("app.py",),
            )
        ),
        harness_runtime=FakeHarnessRuntime(
            paths_by_binary={"claude": "/usr/local/bin/claude"},
            default_response=ReviewExecutionResponse(
                payload=FindingsReview(
                    findings=(
                        ReviewFinding(
                            path="app.py",
                            line=12,
                            severity="warning",
                            summary="Avoid print",
                            details="Use click.echo() instead.",
                        ),
                    )
                )
            ),
        ),
        pr_gateway=FakePRGateway(),
        cwd=cwd,
        branch_memory=FakeBranchMemoryGateway(),
        agent_runner=FakeAgentRunnerGateway(
            responses=(AgentRunCompleted(output_markdown=_valid_triage_output()),)
        ),
    )
    return build_clinkr_context_object(lambda: ctx)


def _valid_triage_output() -> str:
    data: dict[str, Any] = {
        "schema_version": "roaster.stack.triage.v1",
        "summary": "Accepted one finding.",
        "findings": [
            {
                "id": "F1",
                "source_review": "dignified-python",
                "path": "app.py",
                "line": 12,
                "severity": "warning",
                "summary": "Avoid print",
                "details": "Use click.echo() instead.",
                "status": "accepted",
                "rationale": "Concrete style issue.",
                "merged_into": None,
                "confidence": "high",
                "risk": "mechanical",
            }
        ],
        "batches": [
            {
                "slug": "avoid-print",
                "title": "Avoid print",
                "summary": "Replace print usage.",
                "finding_ids": ["F1"],
                "dependencies": [],
                "confidence": "high",
                "risk": "mechanical",
                "resolver_mandate": "Replace print with click.echo().",
                "validation_requirements": ["uv run pytest"],
            }
        ],
    }
    return f"---\n{yaml.safe_dump(data, sort_keys=False)}---\n## Explanation\n"


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
    assert "Roaster Graphite stack run (dry run)" in result.output
    assert f"Profile: thermonuclear-stack ({profile_path})" in result.output
    assert "Profile markdown is loose guidance only" in result.output
    assert "roaster did not parse it deterministically" in result.output
    assert "no gt commands were run" in result.output
    assert "Dry run: yes" in result.output
    assert "New run: yes" in result.output
    assert "Target branch: feature/target" in result.output
    assert "Target implementation branch slug: feature-target" in result.output
    assert "Target PR: 123" in result.output
    assert "Base ref: master" in result.output
    assert "Reviewers requested: dignified-python, pytest" in result.output
    assert "Reviewers run: 2" in result.output
    assert "Findings collected: 2" in result.output
    assert "Triage counts: accepted 1, rejected 0, superseded 0" in result.output
    assert "Model: sonnet" in result.output
    assert "Agent model: opus" in result.output
    assert "Harness: claude-code" in result.output
    assert "Run slug: stack-run-1" in result.output
    assert "Triage prompt: triage guidance" in result.output
    assert "Resolver prompt: resolver guidance" in result.output
    assert "- avoid-print: Avoid print" in result.output
    assert "Branch Memory `roaster-runs`" in result.output


def test_stack_run_without_dry_run_fails_before_mutating(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    _write_profile(tmp_path, "thermonuclear-stack")

    result = CliRunner().invoke(
        cli_group,
        [
            "stack",
            "run",
            "thermonuclear-stack",
            "--target-branch",
            "feature/target",
        ],
        obj=_context(tmp_path),
    )

    assert result.exit_code == 2
    assert "non-dry-run stack orchestration is not implemented yet" in result.output
    assert "pass --dry-run" in result.output


def test_stack_run_json_output_includes_dry_run_plan(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    _write_profile(tmp_path, "thermonuclear-stack")

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
            "--dry-run",
            "--run-slug",
            "stack-run-1",
            "--format",
            "json",
        ],
        obj=_context(tmp_path),
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    data = payload["data"]
    assert data["target_branch"] == "feature/target"
    assert data["profile_slug"] == "thermonuclear-stack"
    assert data["run_slug"] == "stack-run-1"
    assert data["reviewer_run_count"] == 1
    assert data["finding_count"] == 1
    assert data["accepted_count"] == 1
    assert data["batches"][0]["slug"] == "avoid-print"
    assert data["actions"][0]["mutating"] is False
    assert data["locators"][0]["kind"] == "index"
    assert data["branch_memory_puts"] == 0
    assert data["dashboard_mutations"] == 0
    assert data["graphite_commands_run"] == 0


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
