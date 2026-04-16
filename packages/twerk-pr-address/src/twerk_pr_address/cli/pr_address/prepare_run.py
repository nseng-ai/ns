"""Prepare a pr-address run by resolving PR context and normalizing feedback."""

from __future__ import annotations

import dataclasses
from dataclasses import dataclass, field, replace
from typing import Any

import click

from twerk_core.clinkr.command import ClinkrCommandError
from twerk_core.clinkr.operation import clinkr_operation
from twerk_core.gh.types import (
    IssueComment,
    PRLookupError,
    PRReview,
    PRReviewThread,
    PRState,
    RestructuredFile,
)
from twerk_pr_address.cli.pr_address.gateway_access import get_gh_issue_gateway
from twerk_pr_address.cli.pr_address.local_git import (
    LocalGitError,
    get_current_branch,
    get_restructured_files,
)
from twerk_pr_address.cli.pr_address.reply_formatting import RESOLUTION_MARKER


@dataclass(frozen=True)
class PrepareRunRequest:
    include_all_threads: bool = False


@dataclass(frozen=True)
class PrepareRunResult:
    found: bool
    current_branch: str | None = None
    number: int | None = None
    title: str | None = None
    url: str | None = None
    head_ref_name: str | None = None
    base_ref_name: str | None = None
    state: PRState | None = None
    reviews: tuple[PRReview, ...] = field(default_factory=tuple)
    review_threads: tuple[PRReviewThread, ...] = field(default_factory=tuple)
    discussion_comments: tuple[IssueComment, ...] = field(default_factory=tuple)
    reopened_thread_ids: tuple[str, ...] = field(default_factory=tuple)
    restructured_files: tuple[RestructuredFile, ...] = field(default_factory=tuple)
    warnings: tuple[str, ...] = field(default_factory=tuple)
    error: str | None = None
    returncode: int | None = None

    def to_json_dict(self) -> dict[str, Any]:
        if not self.found:
            payload: dict[str, Any] = {
                "found": False,
                "current_branch": self.current_branch,
            }
            if self.error is not None:
                payload["error"] = self.error
            if self.returncode is not None:
                payload["returncode"] = self.returncode
            return payload

        return {
            "found": True,
            "current_branch": self.current_branch,
            "number": self.number,
            "title": self.title,
            "url": self.url,
            "head_ref_name": self.head_ref_name,
            "base_ref_name": self.base_ref_name,
            "state": self.state,
            "reviews": [dataclasses.asdict(review) for review in self.reviews],
            "review_threads": [dataclasses.asdict(thread) for thread in self.review_threads],
            "discussion_comments": [
                dataclasses.asdict(comment) for comment in self.discussion_comments
            ],
            "reopened_thread_ids": list(self.reopened_thread_ids),
            "restructured_files": [dataclasses.asdict(item) for item in self.restructured_files],
            "warnings": list(self.warnings),
        }


@clinkr_operation(
    name="prepare-run",
    help="Resolve PR context, reopen contested threads, and normalize feedback.",
)
def run_prepare_run(
    ctx: click.Context,
    request: PrepareRunRequest,
) -> PrepareRunResult | ClinkrCommandError:
    try:
        current_branch = get_current_branch()
    except LocalGitError as exc:
        return ClinkrCommandError(error_type="git_error", message=str(exc))

    if current_branch is None:
        return ClinkrCommandError(
            error_type="detached_head",
            message="Detached HEAD: prepare-run requires a checked-out branch.",
        )

    gateway = get_gh_issue_gateway(ctx)
    pr = gateway.get_pr_for_branch(current_branch)
    if isinstance(pr, PRLookupError):
        return PrepareRunResult(
            found=False,
            current_branch=current_branch,
            error=pr.stderr,
            returncode=pr.returncode,
        )

    reviews = gateway.get_reviews(pr.number)
    snapshot_threads = gateway.get_review_threads(pr.number, include_resolved=True)
    discussion_comments = gateway.get_discussion_comments(pr.number)

    warnings: list[str] = []
    reopened_thread_ids: list[str] = []
    for thread_id in _contested_thread_ids(snapshot_threads):
        try:
            gateway.unresolve_review_thread(thread_id)
        except Exception as exc:
            warnings.append(f"Failed to reopen contested thread {thread_id}: {exc}")
            continue
        reopened_thread_ids.append(thread_id)

    normalized_threads = _normalize_threads(
        snapshot_threads=snapshot_threads,
        include_all_threads=request.include_all_threads,
        reopened_thread_ids=tuple(reopened_thread_ids),
    )

    try:
        restructured_files = get_restructured_files(pr.base_ref_name)
    except LocalGitError as exc:
        warnings.append(str(exc))
        restructured_files = ()

    return PrepareRunResult(
        found=True,
        current_branch=current_branch,
        number=pr.number,
        title=pr.title,
        url=pr.url,
        head_ref_name=pr.head_ref_name,
        base_ref_name=pr.base_ref_name,
        state=pr.state,
        reviews=reviews,
        review_threads=normalized_threads,
        discussion_comments=discussion_comments,
        reopened_thread_ids=tuple(reopened_thread_ids),
        restructured_files=restructured_files,
        warnings=tuple(warnings),
    )


def _contested_thread_ids(review_threads: tuple[PRReviewThread, ...]) -> tuple[str, ...]:
    contested: list[str] = []
    for thread in review_threads:
        if not thread.is_resolved:
            continue
        marker_indexes = [
            index
            for index, comment in enumerate(thread.comments)
            if RESOLUTION_MARKER in comment.body
        ]
        if not marker_indexes:
            continue
        if marker_indexes[-1] < len(thread.comments) - 1:
            contested.append(thread.id)
    return tuple(contested)


def _normalize_threads(
    *,
    snapshot_threads: tuple[PRReviewThread, ...],
    include_all_threads: bool,
    reopened_thread_ids: tuple[str, ...],
) -> tuple[PRReviewThread, ...]:
    reopened = set(reopened_thread_ids)
    normalized: list[PRReviewThread] = []
    for thread in snapshot_threads:
        adjusted_thread = replace(thread, is_resolved=False) if thread.id in reopened else thread
        if include_all_threads or not adjusted_thread.is_resolved:
            normalized.append(adjusted_thread)
    return tuple(normalized)
