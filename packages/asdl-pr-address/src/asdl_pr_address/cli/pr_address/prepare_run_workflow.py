"""Prepare PR feedback for a pr-address run."""

from __future__ import annotations

from dataclasses import dataclass, replace
from pathlib import Path
from typing import TypeAlias

from asdl_core.gh.pr_gateway import PRGateway
from asdl_core.gh.types import (
    PRDiscussionComment,
    PRGatewayFailure,
    PRLookupMiss,
    PRReview,
    PRReviewThread,
    PRState,
)
from asdl_core.git.git_gateway import GitGateway
from asdl_core.git.types import DetachedHead, GitCommandFailure, RestructuredFile
from asdl_pr_address.cli.pr_address.feedback_snapshot import fetch_feedback_snapshot
from asdl_pr_address.cli.pr_address.reply_formatting import RESOLUTION_MARKER

RestructuredFiles: TypeAlias = tuple[RestructuredFile, ...]


@dataclass(frozen=True)
class PreparedPrAddressRun:
    current_branch: str
    number: int
    title: str
    url: str
    head_ref_name: str
    base_ref_name: str
    state: PRState
    reviews: tuple[PRReview, ...]
    review_threads: tuple[PRReviewThread, ...]
    discussion_comments: tuple[PRDiscussionComment, ...]
    reopened_thread_ids: tuple[str, ...]
    restructured_files: RestructuredFiles
    warnings: tuple[str, ...]


@dataclass(frozen=True)
class PrepareRunNoPr:
    current_branch: str
    error: str
    returncode: int


@dataclass(frozen=True)
class PrepareRunPrLookupFailed:
    current_branch: str
    failure: PRGatewayFailure


PrepareRunOutcome: TypeAlias = (
    PreparedPrAddressRun
    | PrepareRunNoPr
    | PrepareRunPrLookupFailed
    | GitCommandFailure
    | DetachedHead
)


def prepare_pr_address_run(
    pr_gateway: PRGateway,
    git_gateway: GitGateway,
    *,
    cwd: Path,
    include_all_threads: bool,
    include_empty_reviews: bool,
) -> PrepareRunOutcome:
    branch_result = git_gateway.get_current_branch(cwd)
    if isinstance(branch_result, GitCommandFailure):
        return branch_result
    if isinstance(branch_result, DetachedHead):
        return branch_result

    current_branch = branch_result
    pr = pr_gateway.get_pr_for_branch(current_branch)
    if isinstance(pr, PRGatewayFailure):
        return PrepareRunPrLookupFailed(current_branch=current_branch, failure=pr)
    if isinstance(pr, PRLookupMiss):
        return PrepareRunNoPr(
            current_branch=current_branch,
            error=pr.stderr,
            returncode=pr.returncode,
        )

    snapshot = fetch_feedback_snapshot(
        pr_gateway,
        pr_number=pr.number,
        include_resolved=True,
        include_empty_reviews=include_empty_reviews,
    )
    snapshot_threads = snapshot.review_threads

    warnings: list[str] = []
    reopened_thread_ids = _reopen_contested_threads(
        pr_gateway,
        snapshot_threads=snapshot_threads,
        warnings=warnings,
    )
    normalized_threads = _normalize_threads(
        snapshot_threads=snapshot_threads,
        include_all_threads=include_all_threads,
        reopened_thread_ids=reopened_thread_ids,
    )

    files_result = git_gateway.get_restructured_files(cwd, pr.base_ref_name)
    if isinstance(files_result, GitCommandFailure):
        warnings.append(files_result.message)
        restructured_files: RestructuredFiles = ()
    else:
        restructured_files = files_result

    return PreparedPrAddressRun(
        current_branch=current_branch,
        number=pr.number,
        title=pr.title,
        url=pr.url,
        head_ref_name=pr.head_ref_name,
        base_ref_name=pr.base_ref_name,
        state=pr.state,
        reviews=snapshot.reviews,
        review_threads=normalized_threads,
        discussion_comments=snapshot.discussion_comments,
        reopened_thread_ids=reopened_thread_ids,
        restructured_files=restructured_files,
        warnings=tuple(warnings),
    )


def _reopen_contested_threads(
    pr_gateway: PRGateway,
    *,
    snapshot_threads: tuple[PRReviewThread, ...],
    warnings: list[str],
) -> tuple[str, ...]:
    reopened_thread_ids: list[str] = []
    for thread_id in _contested_thread_ids(snapshot_threads):
        try:
            pr_gateway.unresolve_review_thread(thread_id)
        except Exception as exc:
            warnings.append(f"Failed to reopen contested thread {thread_id}: {exc}")
            continue
        reopened_thread_ids.append(thread_id)
    return tuple(reopened_thread_ids)


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
