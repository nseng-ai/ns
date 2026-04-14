from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest

from twerk_oneshot.gateways.execution.gateway import WorkflowDispatchRequest
from twerk_oneshot.gateways.execution.real import RealExecutionBackend
from twerk_oneshot.gateways.github_queue.gateway import (
    BranchCommitRequest,
    DraftPullRequestRequest,
)
from twerk_oneshot.gateways.github_queue.real import RealGitHubQueueGateway


def test_real_github_queue_gateway_get_repository_context(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repo_root = tmp_path / "repo"
    repo_root.mkdir()

    def fake_run(
        command: list[str],
        **kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        if command[:4] == ["gh", "repo", "view", "--json"]:
            stdout = json.dumps(
                {
                    "owner": {"login": "dagster-io"},
                    "name": "twerk",
                    "url": "https://github.com/dagster-io/twerk",
                    "defaultBranchRef": {"name": "master"},
                }
            )
            return subprocess.CompletedProcess(command, 0, stdout=stdout, stderr="")
        if command[:3] == ["gh", "api", "user"]:
            return subprocess.CompletedProcess(command, 0, stdout="schrockn\n", stderr="")
        raise AssertionError(f"unexpected command: {command!r}")

    monkeypatch.setattr("twerk_oneshot.gateways.github_queue.real.subprocess.run", fake_run)

    context = RealGitHubQueueGateway(repo_root=repo_root).get_repository_context()

    assert context.default_branch == "master"
    assert context.authenticated_user == "schrockn"


def test_real_github_queue_gateway_create_branch_commit_and_push(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repo_root = tmp_path / "repo"
    repo_root.mkdir()
    written_files: dict[str, str] = {}
    commands: list[tuple[list[str], Path]] = []

    def fake_run(
        command: list[str],
        **kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        cwd = Path(kwargs["cwd"])
        commands.append((command, cwd))
        if command[:2] == ["git", "add"]:
            for path in command[2:]:
                written_files[path] = (cwd / path).read_text(encoding="utf-8")
            return subprocess.CompletedProcess(command, 0, stdout="", stderr="")
        if command[:3] == ["git", "rev-parse", "HEAD"]:
            return subprocess.CompletedProcess(command, 0, stdout="abc123def456\n", stderr="")
        return subprocess.CompletedProcess(command, 0, stdout="", stderr="")

    monkeypatch.setattr("twerk_oneshot.gateways.github_queue.real.subprocess.run", fake_run)

    gateway = RealGitHubQueueGateway(repo_root=repo_root, temp_root=tmp_path)
    result = gateway.create_branch_commit_and_push(
        BranchCommitRequest(
            branch_name="oneshot-add-tests-0413-2100",
            base_branch="master",
            commit_message="Queue oneshot request",
            files={
                ".twerk/branch-memory/manifest.json": "{}\n",
                ".twerk/branch-memory/oneshot/prompt.md": "hello\n",
            },
        )
    )

    assert result.commit_sha == "abc123def456"
    assert written_files[".twerk/branch-memory/oneshot/prompt.md"] == "hello\n"
    assert commands[0][0] == ["git", "fetch", "origin", "master"]
    assert commands[-1][0][:4] == ["git", "worktree", "remove", "--force"]


def test_real_github_queue_gateway_create_draft_pull_request(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repo_root = tmp_path / "repo"
    repo_root.mkdir()

    def fake_run(
        command: list[str],
        **kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        if command[:3] == ["gh", "pr", "create"]:
            return subprocess.CompletedProcess(
                command,
                0,
                stdout="https://github.com/dagster-io/twerk/pull/42\n",
                stderr="",
            )
        if command[:3] == ["gh", "pr", "view"]:
            stdout = json.dumps(
                {
                    "number": 42,
                    "url": "https://github.com/dagster-io/twerk/pull/42",
                    "title": "One-shot: Add tests",
                    "headRefName": "oneshot-add-tests-0413-2100",
                    "baseRefName": "master",
                }
            )
            return subprocess.CompletedProcess(command, 0, stdout=stdout, stderr="")
        raise AssertionError(f"unexpected command: {command!r}")

    monkeypatch.setattr("twerk_oneshot.gateways.github_queue.real.subprocess.run", fake_run)

    pull_request = RealGitHubQueueGateway(repo_root=repo_root).create_draft_pull_request(
        DraftPullRequestRequest(
            branch_name="oneshot-add-tests-0413-2100",
            base_branch="master",
            title="One-shot: Add tests",
            body="Queued via `oneshot`.",
        )
    )

    assert pull_request.number == 42
    assert pull_request.head_ref_name == "oneshot-add-tests-0413-2100"


def test_real_execution_backend_uses_workflow_run_url(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repo_root = tmp_path / "repo"
    repo_root.mkdir()

    def fake_run(
        command: list[str],
        **kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        if command[:3] == ["gh", "workflow", "run"]:
            return subprocess.CompletedProcess(
                command,
                0,
                stdout=(
                    "Created workflow_dispatch event for oneshot.yml "
                    "at oneshot-add-tests-0413-2100\n"
                    "https://github.com/dagster-io/twerk/actions/runs/9001\n"
                ),
                stderr="",
            )
        raise AssertionError(f"unexpected command: {command!r}")

    monkeypatch.setattr("twerk_oneshot.gateways.execution.real.subprocess.run", fake_run)

    workflow_run = RealExecutionBackend(repo_root=repo_root).dispatch(
        WorkflowDispatchRequest(
            workflow_filename="oneshot.yml",
            ref="oneshot-add-tests-0413-2100",
            inputs={"branch_name": "oneshot-add-tests-0413-2100", "pr_number": "42"},
        )
    )

    assert workflow_run.url.endswith("/9001")


def test_real_execution_backend_falls_back_to_run_list(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repo_root = tmp_path / "repo"
    repo_root.mkdir()

    def fake_run(
        command: list[str],
        **kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        if command[:3] == ["gh", "workflow", "run"]:
            return subprocess.CompletedProcess(command, 0, stdout="", stderr="")
        if command[:3] == ["gh", "run", "list"]:
            return subprocess.CompletedProcess(
                command,
                0,
                stdout='[{"url":"https://github.com/dagster-io/twerk/actions/runs/9002"}]',
                stderr="",
            )
        raise AssertionError(f"unexpected command: {command!r}")

    monkeypatch.setattr("twerk_oneshot.gateways.execution.real.subprocess.run", fake_run)

    workflow_run = RealExecutionBackend(repo_root=repo_root).dispatch(
        WorkflowDispatchRequest(
            workflow_filename="oneshot.yml",
            ref="oneshot-add-tests-0413-2100",
            inputs={"branch_name": "oneshot-add-tests-0413-2100", "pr_number": "42"},
        )
    )

    assert workflow_run.url.endswith("/9002")
