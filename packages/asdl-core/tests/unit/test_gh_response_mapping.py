"""Unit tests for GitHub response-to-domain conversion helpers."""

from __future__ import annotations

import json

from asdl_core.gh.response_mapping import (
    changed_files_from_rest_pages,
    discussion_comment_from_response,
    discussion_comments_from_rest_pages,
    load_paginated_array_output,
    pr_review_from_create_response,
    pr_summaries_from_list_response,
    pr_summary_from_view_response,
    reaction_from_response,
    review_comment_from_thread_reply_response,
    review_comments_from_rest_pages,
    review_thread_state_from_resolve_response,
    review_thread_state_from_unresolve_response,
    review_threads_from_graphql_response,
    reviews_from_rest_pages,
)
from asdl_core.gh.types import (
    PRChangedFile,
    PRDiscussionComment,
    PRReview,
    PRReviewComment,
    PRReviewThread,
    PRReviewThreadState,
    PRSummary,
    Reaction,
)


def _summary_response(
    *, body: str | None = "PR body", head_ref_oid: str | None = "abc123"
) -> dict[str, object]:
    return {
        "number": 47,
        "title": "Port pr-address skill",
        "url": "https://github.com/dagster-io/asdl/pull/47",
        "body": body,
        "headRefName": "feature",
        "headRefOid": head_ref_oid,
        "baseRefName": "master",
        "state": "OPEN",
    }


def _review_thread_payload(nodes: list[dict[str, object]]) -> dict[str, object]:
    return {"data": {"repository": {"pullRequest": {"reviewThreads": {"nodes": nodes}}}}}


def _raw_thread(
    *,
    thread_id: str | None = "PRRT_1",
    is_resolved: bool = False,
    author: dict[str, str] | None = None,
) -> dict[str, object]:
    return {
        "id": thread_id,
        "isResolved": is_resolved,
        "isOutdated": False,
        "path": "src/foo.py",
        "line": 32,
        "startLine": 27,
        "comments": {
            "nodes": [
                {
                    "databaseId": 1001,
                    "body": "looks off",
                    "author": author,
                    "path": "src/foo.py",
                    "line": 32,
                    "startLine": 27,
                    "createdAt": "2026-04-10T12:00:00Z",
                }
            ]
        },
    }


def test_load_paginated_array_output_empty_and_whitespace() -> None:
    assert load_paginated_array_output("") == []
    assert load_paginated_array_output("  \n\t") == []


def test_load_paginated_array_output_reads_adjacent_pages() -> None:
    stdout = '[{"id": 1}]  \n[{"id": 2}]'

    assert load_paginated_array_output(stdout) == [{"id": 1}, {"id": 2}]


def test_pr_summary_from_view_response_maps_optional_fields() -> None:
    summary = pr_summary_from_view_response(_summary_response(body=None, head_ref_oid=None))

    assert summary == PRSummary(
        number=47,
        title="Port pr-address skill",
        url="https://github.com/dagster-io/asdl/pull/47",
        head_ref_name="feature",
        base_ref_name="master",
        state="OPEN",
        body=None,
        head_ref_oid=None,
    )


def test_pr_summaries_from_list_response_maps_items() -> None:
    summaries = pr_summaries_from_list_response([_summary_response()])

    assert len(summaries) == 1
    assert summaries[0].number == 47
    assert summaries[0].head_ref_oid == "abc123"


def test_review_threads_from_graphql_response_filters_and_maps_nested_comments() -> None:
    payload = _review_thread_payload(
        [
            _raw_thread(thread_id=None),
            _raw_thread(thread_id="PRRT_resolved", is_resolved=True, author={"login": "octo"}),
            _raw_thread(thread_id="PRRT_open", author=None),
        ]
    )

    threads = review_threads_from_graphql_response(payload, include_resolved=False)

    assert threads == (
        PRReviewThread(
            id="PRRT_open",
            path="src/foo.py",
            line=32,
            start_line=27,
            is_resolved=False,
            is_outdated=False,
            comments=(
                PRReviewComment(
                    id=1001,
                    body="looks off",
                    author="",
                    path="src/foo.py",
                    line=32,
                    start_line=27,
                    created_at="2026-04-10T12:00:00Z",
                ),
            ),
        ),
    )


def test_review_threads_from_graphql_response_includes_resolved_when_requested() -> None:
    payload = _review_thread_payload([_raw_thread(thread_id="PRRT_resolved", is_resolved=True)])

    threads = review_threads_from_graphql_response(payload, include_resolved=True)

    assert len(threads) == 1
    assert threads[0].id == "PRRT_resolved"
    assert threads[0].is_resolved is True


def test_reviews_from_rest_pages_filters_actionable_states_and_maps_deleted_user() -> None:
    stdout = json.dumps(
        [
            {
                "node_id": "PRR_approved",
                "user": {"login": "reviewer"},
                "body": "approved",
                "state": "APPROVED",
                "submitted_at": "2026-05-23T00:00:00Z",
            },
            {
                "node_id": "PRR_changes",
                "user": None,
                "body": "fix it",
                "state": "CHANGES_REQUESTED",
                "submitted_at": "2026-05-23T00:01:00Z",
            },
            {
                "node_id": "PRR_pending",
                "user": {"login": "reviewer"},
                "body": "pending",
                "state": "PENDING",
                "submitted_at": "2026-05-23T00:02:00Z",
            },
            {
                "node_id": "PRR_dismissed",
                "user": {"login": "reviewer"},
                "body": "dismissed",
                "state": "DISMISSED",
                "submitted_at": "2026-05-23T00:03:00Z",
            },
        ]
    )

    reviews = reviews_from_rest_pages(stdout)

    assert reviews == (
        PRReview(
            id="PRR_approved",
            author="reviewer",
            body="approved",
            state="APPROVED",
            submitted_at="2026-05-23T00:00:00Z",
        ),
        PRReview(
            id="PRR_changes",
            author="",
            body="fix it",
            state="CHANGES_REQUESTED",
            submitted_at="2026-05-23T00:01:00Z",
        ),
    )


def test_changed_files_from_rest_pages_handles_missing_patch() -> None:
    stdout = json.dumps(
        [
            {"filename": "app.py", "status": "modified", "patch": "@@"},
            {"filename": "image.png", "status": "added"},
        ]
    )

    assert changed_files_from_rest_pages(stdout) == (
        PRChangedFile(path="app.py", status="modified", patch="@@"),
        PRChangedFile(path="image.png", status="added", patch=None),
    )


def test_review_comments_from_rest_pages_maps_rest_fields() -> None:
    stdout = json.dumps(
        [
            {
                "id": 301,
                "body": "inline",
                "user": None,
                "path": "app.py",
                "line": 7,
                "start_line": 5,
                "created_at": "2026-05-23T00:00:00Z",
            }
        ]
    )

    assert review_comments_from_rest_pages(stdout) == (
        PRReviewComment(
            id=301,
            body="inline",
            author="",
            path="app.py",
            line=7,
            start_line=5,
            created_at="2026-05-23T00:00:00Z",
        ),
    )


def test_discussion_comments_from_rest_pages_maps_issue_comments() -> None:
    stdout = json.dumps(
        [
            {
                "id": 101,
                "body": "First comment",
                "user": {"login": "alice"},
                "html_url": "https://github.com/dagster-io/asdl/pull/47#issuecomment-101",
            },
            {
                "id": 202,
                "body": "Ghost comment",
                "user": None,
                "html_url": "https://github.com/dagster-io/asdl/pull/47#issuecomment-202",
            },
        ]
    )

    assert discussion_comments_from_rest_pages(stdout) == (
        PRDiscussionComment(
            id=101,
            body="First comment",
            author="alice",
            url="https://github.com/dagster-io/asdl/pull/47#issuecomment-101",
        ),
        PRDiscussionComment(
            id=202,
            body="Ghost comment",
            author="",
            url="https://github.com/dagster-io/asdl/pull/47#issuecomment-202",
        ),
    )


def test_review_thread_state_response_mappers() -> None:
    resolved_payload = {
        "data": {"resolveReviewThread": {"thread": {"id": "PRRT_1", "isResolved": True}}}
    }
    unresolved_payload = {
        "data": {"unresolveReviewThread": {"thread": {"id": "PRRT_1", "isResolved": False}}}
    }

    assert review_thread_state_from_resolve_response(resolved_payload) == PRReviewThreadState(
        thread_id="PRRT_1", is_resolved=True
    )
    assert review_thread_state_from_unresolve_response(unresolved_payload) == PRReviewThreadState(
        thread_id="PRRT_1", is_resolved=False
    )


def test_review_comment_from_thread_reply_response_maps_graphql_comment() -> None:
    payload = {
        "data": {
            "addPullRequestReviewThreadReply": {
                "comment": {
                    "databaseId": 456,
                    "body": "reply",
                    "author": {"login": "bot"},
                    "path": "app.py",
                    "line": 9,
                    "startLine": None,
                    "createdAt": "2026-05-23T00:00:00Z",
                }
            }
        }
    }

    assert review_comment_from_thread_reply_response(payload) == PRReviewComment(
        id=456,
        body="reply",
        author="bot",
        path="app.py",
        line=9,
        start_line=None,
        created_at="2026-05-23T00:00:00Z",
    )


def test_pr_review_from_create_response_defaults_missing_optional_fields() -> None:
    review = {
        "node_id": "PRR_abc",
        "user": None,
        "state": "COMMENTED",
    }

    assert pr_review_from_create_response(review) == PRReview(
        id="PRR_abc",
        author="",
        state="COMMENTED",
        body="",
        submitted_at="",
    )


def test_discussion_comment_and_reaction_response_mappers() -> None:
    comment = discussion_comment_from_response(
        {
            "id": 5555,
            "body": "Addressed",
            "user": {"login": "schrockn"},
            "html_url": "https://github.com/dagster-io/asdl/pull/47#issuecomment-5555",
        }
    )
    reaction = reaction_from_response({"id": 99, "content": "+1"}, comment_id=5555)

    assert comment == PRDiscussionComment(
        id=5555,
        body="Addressed",
        author="schrockn",
        url="https://github.com/dagster-io/asdl/pull/47#issuecomment-5555",
    )
    assert reaction == Reaction(id=99, comment_id=5555, content="+1")
