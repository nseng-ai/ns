from __future__ import annotations

import json
from datetime import UTC, datetime

import pytest
from click.testing import CliRunner

from twerk_core.clinkr.group import ClinkrGroup
from twerk_oneshot.cli.main import build_cli
from twerk_oneshot.gateways.execution.fake import FakeExecutionBackend
from twerk_oneshot.gateways.github_queue.fake import FakeGitHubQueueGateway


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def test_oneshot_help(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["-h"])

    assert result.exit_code == 0
    assert "Usage: oneshot" in result.output
    assert "Queue one-shot remote work." in result.output
    assert "--prompt" in result.output
    assert "--version" in result.output
    assert "json" not in result.output


def test_oneshot_version_option(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["--version"])

    assert result.exit_code == 0
    assert "version" in result.output


def test_oneshot_queues_prompt_with_fake_gateways(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    queue_gateway = FakeGitHubQueueGateway()
    execution_backend = FakeExecutionBackend()

    result = runner.invoke(
        cli_group,
        ["-p", "Add branch memory queueing"],
        obj={
            "oneshot_queue_gateway": queue_gateway,
            "oneshot_execution_backend": execution_backend,
            "oneshot_now": _fixed_now,
        },
    )

    assert result.exit_code == 0
    assert "Queued oneshot." in result.output
    assert "PR: https://github.com/dagster-io/twerk/pull/42" in result.output
    assert "Run: https://github.com/dagster-io/twerk/actions/runs/9001" in result.output

    branch_request = queue_gateway.branch_commit_requests[0]
    assert branch_request.branch_name == "oneshot-add-branch-memory-queueing-0413-2100"
    manifest = json.loads(branch_request.files[".twerk/branch-memory/manifest.json"])
    request = json.loads(branch_request.files[".twerk/branch-memory/oneshot/request.json"])
    assert manifest["entries"][0]["path"] == ".twerk/branch-memory/oneshot/prompt.md"
    assert request["backend_name"] == "github-actions"
    assert request["branch_name"] == branch_request.branch_name
    assert request["submitted_by"] == "schrockn"
    assert branch_request.files[".twerk/branch-memory/oneshot/prompt.md"] == (
        "Add branch memory queueing\n"
    )

    dispatch_request = execution_backend.dispatch_requests[0]
    assert dispatch_request.workflow_filename == "oneshot.yml"
    assert dispatch_request.inputs["pr_number"] == "42"


def _fixed_now() -> datetime:
    return datetime(2026, 4, 13, 21, 0, tzinfo=UTC)
