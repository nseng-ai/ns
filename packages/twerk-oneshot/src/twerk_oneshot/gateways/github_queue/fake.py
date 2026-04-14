from __future__ import annotations

from collections.abc import Sequence

from twerk_oneshot.gateways.github_queue.gateway import (
    BranchCommitRequest,
    BranchCommitResult,
    DraftPullRequestRequest,
    GitHubQueueGateway,
    PullRequestSummary,
    RepositoryContext,
)

DEFAULT_COMMIT_RESULT = BranchCommitResult(
    branch_name="oneshot-fake-0413-1700",
    commit_sha="abc123def456",
)
DEFAULT_PULL_REQUEST = PullRequestSummary(
    number=42,
    url="https://github.com/dagster-io/twerk/pull/42",
    title="One-shot: Add oneshot queueing",
    head_ref_name="oneshot-fake-0413-1700",
    base_ref_name="master",
)


class FakeGitHubQueueGateway(GitHubQueueGateway):
    def __init__(
        self,
        *,
        repository_context: RepositoryContext | None = None,
        commit_result: BranchCommitResult = DEFAULT_COMMIT_RESULT,
        pull_request: PullRequestSummary = DEFAULT_PULL_REQUEST,
    ) -> None:
        self._repository_context = repository_context or RepositoryContext(
            owner="dagster-io",
            name="twerk",
            url="https://github.com/dagster-io/twerk",
            default_branch="master",
            authenticated_user="schrockn",
        )
        self._commit_result = commit_result
        self._pull_request = pull_request
        self._branch_commit_requests: list[BranchCommitRequest] = []
        self._pull_request_requests: list[DraftPullRequestRequest] = []

    @property
    def branch_commit_requests(self) -> Sequence[BranchCommitRequest]:
        return tuple(self._branch_commit_requests)

    @property
    def pull_request_requests(self) -> Sequence[DraftPullRequestRequest]:
        return tuple(self._pull_request_requests)

    def get_repository_context(self) -> RepositoryContext:
        return self._repository_context

    def create_branch_commit_and_push(self, request: BranchCommitRequest) -> BranchCommitResult:
        self._branch_commit_requests.append(request)
        return BranchCommitResult(
            branch_name=request.branch_name,
            commit_sha=self._commit_result.commit_sha,
        )

    def create_draft_pull_request(
        self,
        request: DraftPullRequestRequest,
    ) -> PullRequestSummary:
        self._pull_request_requests.append(request)
        return PullRequestSummary(
            number=self._pull_request.number,
            url=self._pull_request.url,
            title=request.title,
            head_ref_name=request.branch_name,
            base_ref_name=request.base_branch,
        )
