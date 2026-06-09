"""GitHub response-to-domain conversion helpers for the real PR gateway."""

from __future__ import annotations

import json
from typing import Any, cast

from asdl_core.gh.types import (
    PRChangedFile,
    PRDiscussionComment,
    PRReview,
    PRReviewComment,
    PRReviewState,
    PRReviewThread,
    PRReviewThreadState,
    PRState,
    PRSummary,
    Reaction,
)

_REVIEW_STATES_TO_INCLUDE = frozenset({"CHANGES_REQUESTED", "APPROVED", "COMMENTED"})


def load_paginated_array_output(stdout: str) -> list[dict[str, Any]]:
    """Parse ``gh api --paginate`` output for endpoints that return arrays."""
    decoder = json.JSONDecoder()
    items: list[dict[str, Any]] = []
    index = 0
    while index < len(stdout):
        while index < len(stdout) and stdout[index].isspace():
            index += 1
        if index >= len(stdout):
            break
        raw_page, index = decoder.raw_decode(stdout, index)
        page = cast(list[dict[str, Any]], raw_page)
        items.extend(page)
    return items


def pr_summary_from_view_response(data: dict[str, Any]) -> PRSummary:
    """Map a ``gh pr view --json`` response to a PR summary."""
    state: PRState = data["state"]
    return PRSummary(
        number=data["number"],
        title=data["title"],
        url=data["url"],
        head_ref_name=data["headRefName"],
        base_ref_name=data["baseRefName"],
        state=state,
        body=data.get("body"),
        head_ref_oid=data.get("headRefOid"),
    )


def pr_summaries_from_list_response(items: list[dict[str, Any]]) -> tuple[PRSummary, ...]:
    """Map a ``gh pr list --json`` response to PR summaries."""
    return tuple(pr_summary_from_view_response(item) for item in items)


def review_threads_from_graphql_response(
    payload: dict[str, Any], *, include_resolved: bool
) -> tuple[PRReviewThread, ...]:
    """Map a PR review-thread GraphQL response to domain review threads."""
    raw_threads = payload["data"]["repository"]["pullRequest"]["reviewThreads"]["nodes"]

    threads: list[PRReviewThread] = []
    for raw in raw_threads:
        if raw.get("id") is None:
            continue
        if not include_resolved and raw["isResolved"]:
            continue
        comments = tuple(
            _review_comment_from_graphql_response(comment) for comment in raw["comments"]["nodes"]
        )
        threads.append(
            PRReviewThread(
                id=raw["id"],
                path=raw["path"],
                line=raw.get("line"),
                start_line=raw.get("startLine"),
                is_resolved=raw["isResolved"],
                is_outdated=raw["isOutdated"],
                comments=comments,
            )
        )
    return tuple(threads)


def reviews_from_rest_pages(stdout: str) -> tuple[PRReview, ...]:
    """Map paginated REST review responses to PR reviews."""
    return tuple(
        PRReview(
            id=review["node_id"],
            author=_user_login(review.get("user")),
            body=review["body"],
            state=cast(PRReviewState, review["state"]),
            submitted_at=review["submitted_at"],
        )
        for review in load_paginated_array_output(stdout)
        if review["state"] in _REVIEW_STATES_TO_INCLUDE
    )


def changed_files_from_rest_pages(stdout: str) -> tuple[PRChangedFile, ...]:
    """Map paginated REST changed-file responses to changed-file domain objects."""
    return tuple(
        PRChangedFile(
            path=file["filename"],
            status=file["status"],
            patch=file.get("patch"),
        )
        for file in load_paginated_array_output(stdout)
    )


def review_comments_from_rest_pages(stdout: str) -> tuple[PRReviewComment, ...]:
    """Map paginated REST review-comment responses to review comments."""
    return tuple(
        PRReviewComment(
            id=comment["id"],
            body=comment["body"],
            author=_user_login(comment.get("user")),
            path=comment["path"],
            line=comment.get("line"),
            start_line=comment.get("start_line"),
            created_at=comment["created_at"],
        )
        for comment in load_paginated_array_output(stdout)
    )


def discussion_comments_from_rest_pages(stdout: str) -> tuple[PRDiscussionComment, ...]:
    """Map paginated REST issue-comment responses to PR discussion comments."""
    return tuple(
        discussion_comment_from_response(comment) for comment in load_paginated_array_output(stdout)
    )


def review_thread_state_from_resolve_response(payload: dict[str, Any]) -> PRReviewThreadState:
    """Map a resolveReviewThread GraphQL mutation response to thread state."""
    thread = payload["data"]["resolveReviewThread"]["thread"]
    return PRReviewThreadState(thread_id=thread["id"], is_resolved=thread["isResolved"])


def review_thread_state_from_unresolve_response(payload: dict[str, Any]) -> PRReviewThreadState:
    """Map an unresolveReviewThread GraphQL mutation response to thread state."""
    thread = payload["data"]["unresolveReviewThread"]["thread"]
    return PRReviewThreadState(thread_id=thread["id"], is_resolved=thread["isResolved"])


def review_comment_from_thread_reply_response(payload: dict[str, Any]) -> PRReviewComment:
    """Map an addPullRequestReviewThreadReply response to the created comment."""
    comment = payload["data"]["addPullRequestReviewThreadReply"]["comment"]
    return _review_comment_from_graphql_response(comment)


def pr_review_from_create_response(review: dict[str, Any]) -> PRReview:
    """Map a create-review REST response to a PR review."""
    return PRReview(
        id=review["node_id"],
        author=_user_login(review.get("user")),
        state=cast(PRReviewState, review["state"]),
        body=review.get("body") or "",
        submitted_at=review.get("submitted_at") or "",
    )


def discussion_comment_from_response(comment: dict[str, Any]) -> PRDiscussionComment:
    """Map a PR issue-comment REST response to a discussion comment."""
    return PRDiscussionComment(
        id=comment["id"],
        body=comment["body"],
        author=_user_login(comment.get("user")),
        url=comment["html_url"],
    )


def reaction_from_response(response: dict[str, Any], *, comment_id: int) -> Reaction:
    """Map a discussion-comment reaction response to a reaction."""
    return Reaction(id=response["id"], comment_id=comment_id, content=response["content"])


def _review_comment_from_graphql_response(comment: dict[str, Any]) -> PRReviewComment:
    return PRReviewComment(
        id=comment["databaseId"],
        body=comment["body"],
        author=_user_login(comment.get("author")),
        path=comment["path"],
        line=comment.get("line"),
        start_line=comment.get("startLine"),
        created_at=comment["createdAt"],
    )


def _user_login(user: object) -> str:
    if not isinstance(user, dict):
        return ""
    user_data = cast(dict[str, object], user)
    login = user_data.get("login")
    if not isinstance(login, str):
        return ""
    return login
