from __future__ import annotations

from twerk_oneshot.gateways.execution.fake import FakeExecutionBackend
from twerk_oneshot.gateways.execution.gateway import WorkflowDispatchRequest
from twerk_oneshot.gateways.github_queue.fake import FakeGitHubQueueGateway
from twerk_oneshot.gateways.github_queue.gateway import (
    BranchCommitRequest,
    DraftPullRequestRequest,
)


def test_fake_github_queue_gateway_tracks_requests() -> None:
    gateway = FakeGitHubQueueGateway()

    commit_result = gateway.create_branch_commit_and_push(
        BranchCommitRequest(
            branch_name="oneshot-add-tests-0413-2100",
            base_branch="master",
            commit_message="Queue oneshot request",
            files={"a.txt": "hello\n"},
        )
    )
    pull_request = gateway.create_draft_pull_request(
        DraftPullRequestRequest(
            branch_name="oneshot-add-tests-0413-2100",
            base_branch="master",
            title="One-shot: Add tests",
            body="Queued via `oneshot`.",
        )
    )

    assert commit_result.branch_name == "oneshot-add-tests-0413-2100"
    assert gateway.branch_commit_requests[0].files["a.txt"] == "hello\n"
    assert pull_request.number == 42
    assert gateway.pull_request_requests[0].title == "One-shot: Add tests"


def test_fake_execution_backend_tracks_dispatch_requests() -> None:
    backend = FakeExecutionBackend()

    workflow_run = backend.dispatch(
        WorkflowDispatchRequest(
            workflow_filename="oneshot.yml",
            ref="oneshot-add-tests-0413-2100",
            inputs={"branch_name": "oneshot-add-tests-0413-2100"},
        )
    )

    assert workflow_run.url.endswith("/9001")
    assert backend.dispatch_requests[0].workflow_filename == "oneshot.yml"
