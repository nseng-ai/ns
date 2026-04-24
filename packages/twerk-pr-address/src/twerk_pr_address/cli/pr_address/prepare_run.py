"""Prepare a pr-address run by resolving PR context and normalizing feedback."""

from __future__ import annotations

import dataclasses
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Any

import click

from twerk_core.clinkr.exit import ClinkrExit
from twerk_core.clinkr.operation import clinkr_operation
from twerk_core.gh.types import (
    CheckRunAnnotation,
    IssueComment,
    PRLookupError,
    PRReview,
    PRReviewThread,
    PRState,
)
from twerk_core.git.types import DetachedHead, GitCommandFailure, RestructuredFile
from twerk_pr_address.cli.pr_address.gateway_access import (
    get_check_runs_gateway,
    get_gh_issue_gateway,
    get_git_gateway,
)
from twerk_pr_address.cli.pr_address.reply_formatting import RESOLUTION_MARKER
from twerk_pr_address.cli.pr_address.review_filtering import filter_empty_reviews

# Prefix on the check-run ``name`` that identifies a reviewer-authored
# check run. Ingestion filters by this prefix so pr-address only picks up
# machine-generated reviewer annotations, not arbitrary third-party check
# runs (lint CI, type CI, etc.) that also attach to the same commit.
_REVIEWER_CHECK_NAME_PREFIX = "twerk-reviewer/"

RestructuredFiles = tuple[RestructuredFile, ...]


@dataclass(frozen=True)
class PrepareRunRequest:
    """Inputs to `prepare-run`.

    Attributes:
        include_all_threads: When True, include resolved reference threads in
            the normalized output. Default False returns only threads that
            still need classification (unresolved or reopened by this run).
        include_empty_reviews: When True, include PR-level reviews whose body
            is empty and whose state carries no request (`COMMENTED` /
            `APPROVED`). Default False drops them as noise; set True only when
            the caller wants to inspect the raw review stream.
    """

    include_all_threads: bool = False
    include_empty_reviews: bool = False


@dataclass(frozen=True)
class PrepareRunResult:
    """Normalized PR feedback snapshot for a single `pr-address` run.

    When `found` is False the current branch has no associated PR; all other
    fields except `current_branch`, `error`, and `returncode` are left at
    their defaults.

    Attributes:
        found: Whether a PR was resolved for the current branch.
        current_branch: The branch the helper was invoked on (None means
            detached HEAD, surfaced as a `ClinkrExit.failure` before this
            result is constructed).
        number: PR number on the host repository.
        title: PR title at the time of the snapshot.
        url: Web URL of the PR.
        head_ref_name: The PR's head branch — always equals `current_branch`
            for this flow.
        base_ref_name: The PR's base branch (e.g. "master"). Used by
            `get_restructured_files` to build the merge-base diff.
        state: PR lifecycle state (OPEN / CLOSED / MERGED).
        reviews: PR-level review submissions (the "Review changes" flow).
        review_threads: Normalized inline review threads. Contested threads
            previously resolved by `pr-address` are reopened and included
            here; resolved reference threads are included only when the
            request set `include_all_threads=True`.
        discussion_comments: Top-level PR discussion comments (not inline).
        reopened_thread_ids: Threads this run unresolved because a new
            comment landed after the pr-address resolution marker.
        restructured_files: Files renamed or copied between
            `origin/<base_ref_name>` and HEAD, detected via
            `git diff --name-status -M -C`. Used by the classifier to mark
            bot comments on moved code as `pre_existing`.
        check_run_annotations: Reviewer-generated line annotations attached
            to the PR's head SHA. Collected from all check runs whose name
            starts with ``twerk-reviewer/``. Empty when the reviewer hasn't
            run against the current head SHA yet — pr-address tolerates
            that gracefully (no-op for unaffected branches).
        warnings: Non-fatal issues encountered while preparing the run
            (e.g. `git diff` failed; failed to reopen a contested thread).
        error: stderr from `gh pr view` when `found` is False.
        returncode: exit code from `gh pr view` when `found` is False.
    """

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
    restructured_files: RestructuredFiles = field(default_factory=tuple)
    check_run_annotations: tuple[CheckRunAnnotation, ...] = field(default_factory=tuple)
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
            "check_run_annotations": [
                dataclasses.asdict(annotation) for annotation in self.check_run_annotations
            ],
            "warnings": list(self.warnings),
        }


@clinkr_operation(
    name="prepare-run",
    help="Resolve PR context, reopen contested threads, and normalize feedback.",
)
def run_prepare_run(
    ctx: click.Context,
    request: PrepareRunRequest,
) -> ClinkrExit[PrepareRunResult]:
    git_gateway = get_git_gateway(ctx)
    match git_gateway.get_current_branch(Path.cwd()):
        case GitCommandFailure() as failure:
            return ClinkrExit.failure(
                error_type="git_failed",
                message=failure.message,
            )
        case DetachedHead():
            return ClinkrExit.failure(
                error_type="detached_head",
                message="Detached HEAD: prepare-run requires a checked-out branch.",
            )
        case str() as current_branch:
            pass

    gateway = get_gh_issue_gateway(ctx)
    pr = gateway.get_pr_for_branch(current_branch)
    if isinstance(pr, PRLookupError):
        return ClinkrExit.ok(
            PrepareRunResult(
                found=False,
                current_branch=current_branch,
                error=pr.stderr,
                returncode=pr.returncode,
            )
        )

    raw_reviews = gateway.get_reviews(pr.number)
    reviews = raw_reviews if request.include_empty_reviews else filter_empty_reviews(raw_reviews)
    snapshot_threads = gateway.get_review_threads(pr.number, include_resolved=True)
    discussion_comments = gateway.get_discussion_comments(pr.number)
    check_runs_gateway = get_check_runs_gateway(ctx)
    check_run_annotations = _fetch_reviewer_annotations(check_runs_gateway, pr.head_sha)

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

    restructured_files: RestructuredFiles
    match git_gateway.get_restructured_files(Path.cwd(), pr.base_ref_name):
        case GitCommandFailure() as failure:
            warnings.append(failure.message)
            restructured_files = ()
        case tuple() as files:
            restructured_files = files

    return ClinkrExit.ok(
        PrepareRunResult(
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
            check_run_annotations=check_run_annotations,
            warnings=tuple(warnings),
        )
    )


def _fetch_reviewer_annotations(
    gateway: Any,
    head_sha: str,
) -> tuple[CheckRunAnnotation, ...]:
    """Return all reviewer-authored annotations on ``head_sha``.

    The set of review keys is discovered dynamically via ``list_check_runs``
    with the ``twerk-reviewer/`` prefix filter, so the helper naturally
    picks up check runs from every reviewer that has run against this
    commit.
    """
    check_runs = gateway.list_check_runs(
        head_sha,
        name_prefix=_REVIEWER_CHECK_NAME_PREFIX,
    )
    annotations: list[CheckRunAnnotation] = []
    for run in check_runs:
        annotations.extend(gateway.list_annotations(run.id))
    return tuple(annotations)


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
