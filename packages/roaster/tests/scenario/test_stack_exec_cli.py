from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest
from click.testing import CliRunner

from asdl_core.clinkr.context import ClinkrContextObject, build_clinkr_context_object
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.gh.pr_testing import FakePRGateway
from brmem.fake import FakeBranchMemoryGateway
from roaster.cli.main import build_cli
from roaster.context import RoasterCliContext
from roaster.gateways.local_diff.fake import FakeLocalDiffGateway
from roaster.gateways.review_catalog.fake import FakeReviewCatalogGateway
from roaster.harness.fake import FakeHarnessRuntime


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def _context(cwd: Path, branch_memory: FakeBranchMemoryGateway) -> ClinkrContextObject:
    ctx = RoasterCliContext(
        catalog=FakeReviewCatalogGateway(),
        diff=FakeLocalDiffGateway(),
        harness_runtime=FakeHarnessRuntime(),
        pr_gateway=FakePRGateway(),
        cwd=cwd,
        branch_memory=branch_memory,
    )
    return build_clinkr_context_object(lambda: ctx)


def _triage_payload(*, dependencies: list[str] | None = None) -> dict[str, object]:
    return {
        "summary": "Accepted one finding.",
        "findings": [
            {
                "id": "F1",
                "source_review": "dignified-python",
                "path": "app.py",
                "line": 1,
                "severity": "warning",
                "summary": "Avoid print",
                "status": "accepted",
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
                "dependencies": dependencies or [],
                "confidence": "high",
                "risk": "mechanical",
                "resolver_mandate": "Replace print with click.echo().",
                "validation_requirements": ["python -c 'import sys; sys.exit(0)'"],
                "expected_paths": ["app.py"],
            }
        ],
    }


def _record_triage(
    cli_group: ClinkrGroup,
    runner: CliRunner,
    context: ClinkrContextObject,
    payload: dict[str, object] | None = None,
) -> None:
    result = runner.invoke(
        cli_group,
        [
            "stack",
            "exec",
            "record-triage",
            "--impl-branch",
            "feature/impl",
            "--impl-branch-slug",
            "feature-impl",
            "--profile-slug",
            "full-review",
            "--run-slug",
            "run-1",
            "--target-pr",
            "47",
        ],
        input=json.dumps(payload or _triage_payload()),
        obj=context,
    )
    assert result.exit_code == 0, result.output


def test_stack_exec_group_is_hidden_from_stack_help(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["stack", "-h"])

    assert result.exit_code == 0
    assert "run" in result.output
    assert "exec" not in result.output


def test_stack_exec_help_lists_skill_first_commands(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["stack", "exec", "-h"])

    assert result.exit_code == 0
    assert "record-triage" in result.output
    assert "order-batches" in result.output
    assert "record-batch" in result.output
    assert "compute-branch-name" in result.output
    assert "render-dashboard" in result.output


def test_record_triage_persists_skill_namespace_manifest(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    branch_memory = FakeBranchMemoryGateway()
    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        [
            "stack",
            "exec",
            "record-triage",
            "--impl-branch",
            "feature/impl",
            "--impl-branch-slug",
            "feature-impl",
            "--profile-slug",
            "full-review",
            "--run-slug",
            "run-1",
        ],
        input=json.dumps(_triage_payload()),
        obj=_context(tmp_path, branch_memory),
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)
    assert data["namespace"] == "roaster-runs-skill"
    assert data["batch_slugs"] == ["avoid-print"]
    assert data["manifest_locator"]["namespace"] == "roaster-runs-skill"
    assert (
        branch_memory.get(
            "roaster-runs-skill",
            "runs/feature-impl/full-review/run-1/manifest.md",
            "feature/impl",
        )
        is not None
    )


def test_order_batches_reports_ordering_errors(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    branch_memory = FakeBranchMemoryGateway()
    runner = CliRunner()
    context = _context(tmp_path, branch_memory)
    _record_triage(
        cli_group,
        runner,
        context,
        _triage_payload(dependencies=["missing"]),
    )

    result = runner.invoke(
        cli_group,
        [
            "stack",
            "exec",
            "order-batches",
            "--impl-branch",
            "feature/impl",
            "--impl-branch-slug",
            "feature-impl",
            "--profile-slug",
            "full-review",
            "--run-slug",
            "run-1",
        ],
        obj=context,
    )

    assert result.exit_code == 1
    assert "unknown batch" in result.output


def test_compute_branch_name_returns_canonical_generated_branch(
    cli_group: ClinkrGroup,
) -> None:
    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        [
            "stack",
            "exec",
            "compute-branch-name",
            "--impl-branch-slug",
            "feature-impl",
            "--run-slug",
            "run-1",
            "--batch-slug",
            "avoid-print",
        ],
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)
    assert data["branch_name"] == "feature-impl/roaster/run-1/avoid-print"


def test_record_batch_persists_completed_batch_after_gate_pass(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    _init_git_repo(tmp_path)
    branch_memory = FakeBranchMemoryGateway()
    runner = CliRunner()
    context = _context(tmp_path, branch_memory)
    _record_triage(cli_group, runner, context)
    (tmp_path / "app.py").write_text("print('goodbye')\n", encoding="utf-8")

    result = runner.invoke(
        cli_group,
        [
            "stack",
            "exec",
            "record-batch",
            "avoid-print",
            "--impl-branch",
            "feature/impl",
            "--impl-branch-slug",
            "feature-impl",
            "--profile-slug",
            "full-review",
            "--run-slug",
            "run-1",
            "--generated-branch-name",
            "feature-impl/roaster/run-1/avoid-print",
        ],
        input=json.dumps(
            {
                "status": "completed",
                "summary": "Resolved print usage.",
                "files_changed": ["app.py"],
                "safety": {"destructive": False, "security_sensitive": False},
            }
        ),
        obj=context,
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)
    assert data["status"] == "completed"
    assert data["should_halt"] is False
    assert data["gate"]["passed"] is True
    manifest = branch_memory.get(
        "roaster-runs-skill",
        "runs/feature-impl/full-review/run-1/manifest.md",
        "feature/impl",
    )
    assert manifest is not None
    assert "status: completed" in manifest
    assert "expected_paths:" in manifest


def test_render_dashboard_prints_markdown_from_skill_manifest(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    branch_memory = FakeBranchMemoryGateway()
    runner = CliRunner()
    context = _context(tmp_path, branch_memory)
    _record_triage(cli_group, runner, context)

    result = runner.invoke(
        cli_group,
        [
            "stack",
            "exec",
            "render-dashboard",
            "--impl-branch",
            "feature/impl",
            "--impl-branch-slug",
            "feature-impl",
            "--profile-slug",
            "full-review",
            "--run-slug",
            "run-1",
        ],
        obj=context,
    )

    assert result.exit_code == 0, result.output
    assert "## roaster stack · full-review" in result.output
    assert "Branch Memory `roaster-runs-skill`" in result.output
    assert "`avoid-print`" in result.output


def _init_git_repo(path: Path) -> None:
    (path / "app.py").write_text("print('hello')\n", encoding="utf-8")
    subprocess.run(["git", "init"], cwd=path, check=True, capture_output=True, text=True)
    subprocess.run(["git", "add", "app.py"], cwd=path, check=True, capture_output=True, text=True)
    subprocess.run(
        [
            "git",
            "-c",
            "user.email=test@example.com",
            "-c",
            "user.name=Test User",
            "commit",
            "-m",
            "initial",
        ],
        cwd=path,
        check=True,
        capture_output=True,
        text=True,
    )
