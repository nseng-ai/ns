from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass(frozen=True)
class RepositoryContext:
    owner: str
    name: str
    url: str
    default_branch: str
    authenticated_user: str


@dataclass(frozen=True)
class BranchCommitRequest:
    branch_name: str
    base_branch: str
    commit_message: str
    files: dict[str, str]


@dataclass(frozen=True)
class BranchCommitResult:
    branch_name: str
    commit_sha: str


@dataclass(frozen=True)
class DraftPullRequestRequest:
    branch_name: str
    base_branch: str
    title: str
    body: str


@dataclass(frozen=True)
class PullRequestSummary:
    number: int
    url: str
    title: str
    head_ref_name: str
    base_ref_name: str


class GitHubQueueGateway(ABC):
    @abstractmethod
    def get_repository_context(self) -> RepositoryContext:
        """Resolve repository context for the current working directory."""

    @abstractmethod
    def create_branch_commit_and_push(self, request: BranchCommitRequest) -> BranchCommitResult:
        """Create a branch from the base branch, commit files, and push it."""

    @abstractmethod
    def create_draft_pull_request(
        self,
        request: DraftPullRequestRequest,
    ) -> PullRequestSummary:
        """Create a draft pull request for the queued oneshot branch."""
