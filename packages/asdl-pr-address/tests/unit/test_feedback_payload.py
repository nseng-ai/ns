"""Tests for compact PR feedback payload manifest construction."""

import json

from asdl_core.gh.types import PRDiscussionComment, PRReview, PRReviewComment, PRReviewThread
from asdl_core.payloads.models import PayloadReference
from asdl_pr_address.cli.pr_address.feedback_payload import build_get_feedback_payload_manifest


def _payload_reference() -> PayloadReference:
    return PayloadReference(
        payload_path="/tmp/asdl/sessions/session1/payloads/20260603t123456z-0001-probe.raw.json",
        session_id="session1",
        descriptor="probe",
        role="raw",
        created_at_utc="2026-06-03T12:34:56Z",
        sequence=1,
        payload_bytes=17,
        content_type="application/json",
        extension="json",
    )


def test_get_feedback_payload_manifest_counts_and_locators_without_body_text() -> None:
    review_body = "REVIEW_SENTINEL_BODY"
    thread_body = "THREAD_SENTINEL_BODY"
    discussion_body = "DISCUSSION_SENTINEL_BODY"

    manifest = build_get_feedback_payload_manifest(
        payload_reference=_payload_reference(),
        pr_number=42,
        reviews=(
            PRReview(
                id="PRR_1",
                author="reviewer",
                body=review_body,
                state="CHANGES_REQUESTED",
                submitted_at="2026-05-23T00:00:00Z",
            ),
        ),
        review_threads=(
            PRReviewThread(
                id="PRRT_1",
                path="file.py",
                line=10,
                start_line=8,
                is_resolved=False,
                is_outdated=False,
                comments=(
                    PRReviewComment(
                        id=7,
                        body=thread_body,
                        author="reviewer",
                        path="file.py",
                        line=10,
                        start_line=8,
                        created_at="2026-05-23T00:00:00Z",
                    ),
                ),
            ),
        ),
        discussion_comments=(
            PRDiscussionComment(
                id=11,
                body=discussion_body,
                author="author",
                url="https://example.com/comment/11",
            ),
        ),
    )

    payload = manifest.model_dump(mode="json")
    serialized = json.dumps(payload)
    assert review_body not in serialized
    assert thread_body not in serialized
    assert discussion_body not in serialized
    assert payload["counts"] == {
        "reviews": 1,
        "review_threads": 1,
        "unresolved_review_threads": 1,
        "resolved_review_threads": 0,
        "thread_comments": 1,
        "discussion_comments": 1,
    }
    assert payload["reviews"][0]["body_locator"]["json_pointer"] == "/data/reviews/0/body"
    assert payload["reviews"][0]["body_locator"]["body_chars"] == len(review_body)
    assert payload["review_threads"][0]["item_pointer"] == "/data/review_threads/0"
    assert payload["review_threads"][0]["comments"][0]["body_locator"] == {
        "body_chars": len(thread_body),
        "json_pointer": "/data/review_threads/0/comments/0/body",
        "item_pointer": "/data/review_threads/0/comments/0",
        "domain": {
            "kind": "review_thread_comment",
            "review_id": None,
            "thread_id": "PRRT_1",
            "comment_id": 7,
            "discussion_comment_id": None,
            "comment_index": 0,
            "path": "file.py",
            "line": 10,
            "start_line": 8,
            "is_resolved": False,
            "is_outdated": False,
            "author": "reviewer",
        },
    }
    assert payload["discussion_comments"][0]["body_locator"]["json_pointer"] == (
        "/data/discussion_comments/0/body"
    )
