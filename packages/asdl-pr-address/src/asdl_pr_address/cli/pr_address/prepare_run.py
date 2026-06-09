"""Prepare a pr-address run by resolving PR context and normalizing feedback."""

from __future__ import annotations

import dataclasses
from pathlib import Path
from typing import Annotated, Any, Literal

import click
from pydantic import model_serializer

from asdl_core.clinkr.context import load_typed_context
from asdl_core.clinkr.exit import ClinkrExit
from asdl_core.clinkr.failure import ClinkrFailure
from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.operation import clinkr_operation
from asdl_core.gh.types import (
    PRDiscussionComment,
    PRGatewayFailure,
    PRReview,
    PRReviewThread,
    PRState,
)
from asdl_core.git.types import DetachedHead, GitCommandFailure, RestructuredFile
from asdl_core.payloads.clinkr import open_clinkr_payload_store, write_clinkr_raw_payload_artifact
from asdl_core.payloads.store import PayloadStore
from asdl_pr_address.cli.pr_address.context import PrAddressCliContext
from asdl_pr_address.cli.pr_address.feedback_payload import (
    PayloadMode,
    PrepareRunPayloadManifest,
    build_prepare_run_payload_manifest,
)
from asdl_pr_address.cli.pr_address.prepare_run_workflow import (
    PreparedPrAddressRun,
    PrepareRunNoPr,
    PrepareRunPrLookupFailed,
    prepare_pr_address_run,
)

RestructuredFiles = tuple[RestructuredFile, ...]


def _gateway_failure_message(prefix: str, failure: PRGatewayFailure) -> str:
    detail = failure.stderr or failure.stdout or f"exit code {failure.returncode}"
    return f"{prefix}: {detail}"


class PrepareRunRequest(ClinkrModel):
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
    payload_mode: Annotated[
        PayloadMode,
        click.Option(
            ["--payload-mode"],
            type=click.Choice(["inline", "payload"]),
            default="payload",
        ),
    ] = "payload"
    payload_session_id: Annotated[
        str | None,
        click.Option(["--payload-session-id"], type=click.STRING),
    ] = None


class PrepareRunInlineResult(ClinkrModel):
    """Normalized PR feedback snapshot for a single `pr-address` run.

    When `found` is False the current branch has no associated PR; all other
    fields except `current_branch`, `error`, and `returncode` are left at
    their defaults.

    Attributes:
        found: Whether a PR was resolved for the current branch.
        current_branch: The branch the helper was invoked on (None means
            detached HEAD, surfaced as a `ClinkrFailure` before this
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
        warnings: Non-fatal issues encountered while preparing the run
            (e.g. `git diff` failed; failed to reopen a contested thread).
        error: stderr from `gh pr view` when `found` is False.
        returncode: exit code from `gh pr view` when `found` is False.
    """

    payload_mode: Literal["inline"] = "inline"
    found: bool
    current_branch: str | None = None
    number: int | None = None
    title: str | None = None
    url: str | None = None
    head_ref_name: str | None = None
    base_ref_name: str | None = None
    state: PRState | None = None
    reviews: tuple[PRReview, ...] = ()
    review_threads: tuple[PRReviewThread, ...] = ()
    discussion_comments: tuple[PRDiscussionComment, ...] = ()
    reopened_thread_ids: tuple[str, ...] = ()
    restructured_files: RestructuredFiles = ()
    warnings: tuple[str, ...] = ()
    error: str | None = None
    returncode: int | None = None

    @model_serializer
    def serialize_model(self) -> dict[str, Any]:
        if not self.found:
            payload: dict[str, Any] = {
                "payload_mode": self.payload_mode,
                "found": False,
                "current_branch": self.current_branch,
            }
            if self.error is not None:
                payload["error"] = self.error
            if self.returncode is not None:
                payload["returncode"] = self.returncode
            return payload

        return {
            "payload_mode": self.payload_mode,
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
) -> ClinkrExit[PrepareRunInlineResult | PrepareRunPayloadManifest]:
    store: PayloadStore | None = None
    if request.payload_mode == "payload":
        store = open_clinkr_payload_store(request.payload_session_id)

    pr_address_context = load_typed_context(ctx, PrAddressCliContext)
    outcome = prepare_pr_address_run(
        pr_address_context.pr_gateway,
        pr_address_context.git_gateway,
        cwd=Path.cwd(),
        include_all_threads=request.include_all_threads,
        include_empty_reviews=request.include_empty_reviews,
    )

    match outcome:
        case GitCommandFailure() as failure:
            raise ClinkrFailure(error_type="git_failed", message=failure.message)
        case DetachedHead():
            raise ClinkrFailure(
                error_type="detached_head",
                message="Detached HEAD: prepare-run requires a checked-out branch.",
            )
        case PrepareRunPrLookupFailed() as failure:
            raise ClinkrFailure(
                error_type="pr_gateway_failure",
                message=_gateway_failure_message(
                    f"Failed to look up PR for current branch {failure.current_branch!r}",
                    failure.failure,
                ),
            )
        case PrepareRunNoPr() as no_pr:
            inline_result = PrepareRunInlineResult(
                found=False,
                current_branch=no_pr.current_branch,
                error=no_pr.error,
                returncode=no_pr.returncode,
            )
        case PreparedPrAddressRun() as prepared:
            inline_result = PrepareRunInlineResult(
                found=True,
                current_branch=prepared.current_branch,
                number=prepared.number,
                title=prepared.title,
                url=prepared.url,
                head_ref_name=prepared.head_ref_name,
                base_ref_name=prepared.base_ref_name,
                state=prepared.state,
                reviews=prepared.reviews,
                review_threads=prepared.review_threads,
                discussion_comments=prepared.discussion_comments,
                reopened_thread_ids=prepared.reopened_thread_ids,
                restructured_files=prepared.restructured_files,
                warnings=prepared.warnings,
            )
    return _prepare_run_exit_for_payload_mode(
        inline_result=inline_result,
        payload_mode=request.payload_mode,
        store=store,
    )


def _prepare_run_exit_for_payload_mode(
    *,
    inline_result: PrepareRunInlineResult,
    payload_mode: PayloadMode,
    store: PayloadStore | None,
) -> ClinkrExit[PrepareRunInlineResult | PrepareRunPayloadManifest]:
    if payload_mode == "inline":
        return ClinkrExit.ok(inline_result)

    if store is None:
        raise AssertionError("payload artifact store must be opened before writing raw payload")

    descriptor = "pr-address-prepare-run-no-pr"
    if inline_result.found and inline_result.number is not None:
        descriptor = f"pr-address-prepare-run-pr-{inline_result.number}"
    raw_reference = write_clinkr_raw_payload_artifact(
        store=store,
        descriptor=descriptor,
        result=ClinkrExit.ok(inline_result),
    )
    return ClinkrExit.ok(
        build_prepare_run_payload_manifest(
            payload_reference=raw_reference,
            found=inline_result.found,
            current_branch=inline_result.current_branch,
            number=inline_result.number,
            title=inline_result.title,
            url=inline_result.url,
            head_ref_name=inline_result.head_ref_name,
            base_ref_name=inline_result.base_ref_name,
            state=inline_result.state,
            reviews=inline_result.reviews,
            review_threads=inline_result.review_threads,
            discussion_comments=inline_result.discussion_comments,
            reopened_thread_ids=inline_result.reopened_thread_ids,
            restructured_files=inline_result.restructured_files,
            warnings=inline_result.warnings,
            error=inline_result.error,
            returncode=inline_result.returncode,
        )
    )
