from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime

from twerk_oneshot.branch_memory.contract import build_oneshot_branch_memory
from twerk_oneshot.gateways.execution.gateway import (
    ExecutionBackend,
    WorkflowDispatchRequest,
)
from twerk_oneshot.gateways.github_queue.gateway import (
    BranchCommitRequest,
    DraftPullRequestRequest,
    GitHubQueueGateway,
)

WORKFLOW_FILENAME = "oneshot.yml"
_NON_ALNUM = re.compile(r"[^a-z0-9]+")


@dataclass(frozen=True)
class QueueOneshotRequest:
    prompt: str


@dataclass(frozen=True)
class QueueOneshotResult:
    branch_name: str
    base_branch: str
    commit_sha: str
    pr_number: int
    pr_url: str
    run_url: str


def queue_oneshot(
    request: QueueOneshotRequest,
    *,
    queue_gateway: GitHubQueueGateway,
    execution_backend: ExecutionBackend,
    now: Callable[[], datetime],
) -> QueueOneshotResult:
    prompt = request.prompt.strip()
    if not prompt:
        raise ValueError("Prompt must not be empty.")

    timestamp = now().astimezone(UTC)
    context = queue_gateway.get_repository_context()
    branch_name = generate_branch_name(prompt, timestamp=timestamp)
    pr_title = build_pr_title(prompt)
    files = build_oneshot_branch_memory(prompt)
    commit_result = queue_gateway.create_branch_commit_and_push(
        BranchCommitRequest(
            branch_name=branch_name,
            base_branch=context.default_branch,
            commit_message="Queue oneshot request",
            files=files,
        )
    )
    pull_request = queue_gateway.create_draft_pull_request(
        DraftPullRequestRequest(
            branch_name=branch_name,
            base_branch=context.default_branch,
            title=pr_title,
            body=build_pr_body(),
        )
    )
    workflow_run = execution_backend.dispatch(
        WorkflowDispatchRequest(
            workflow_filename=WORKFLOW_FILENAME,
            ref=branch_name,
            inputs={
                "branch_name": branch_name,
                "pr_number": str(pull_request.number),
                "submitted_by": context.authenticated_user,
            },
        )
    )
    return QueueOneshotResult(
        branch_name=commit_result.branch_name,
        base_branch=context.default_branch,
        commit_sha=commit_result.commit_sha,
        pr_number=pull_request.number,
        pr_url=pull_request.url,
        run_url=workflow_run.url,
    )


def build_pr_body() -> str:
    return "Queued via `oneshot`.\n"


def build_pr_title(prompt: str) -> str:
    prefix = "One-shot: "
    clipped = prompt[:60].rstrip()
    if len(prompt) > 60:
        clipped = f"{clipped}..."
    return f"{prefix}{clipped}"


def generate_branch_name(prompt: str, *, timestamp: datetime) -> str:
    slug = _NON_ALNUM.sub("-", prompt.lower()).strip("-")
    if not slug:
        slug = "request"
    slug = slug[:32].rstrip("-")
    return f"oneshot-{slug}-{timestamp.strftime('%m%d-%H%M')}"
