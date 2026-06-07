"""Tests for PR feedback classification template generation."""

from __future__ import annotations

from copy import deepcopy

import pytest

from asdl_core.gh.types import PRDiscussionComment, PRReview, PRReviewComment, PRReviewThread
from asdl_core.payloads.models import PayloadReference
from asdl_pr_address.cli.pr_address.feedback_classification_template import (
    FILL_DISPOSITION_PLACEHOLDER,
    FeedbackClassificationTemplateManifestError,
    build_feedback_classification_template,
)
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


def _manifest_payload(*, include_resolved: bool = False) -> dict:
    threads = [
        PRReviewThread(
            id="PRRT_1",
            path="pkg/module.py",
            line=20,
            start_line=18,
            is_resolved=False,
            is_outdated=False,
            comments=(
                PRReviewComment(
                    id=101,
                    body="Please split this branch.",
                    author="reviewer",
                    path="pkg/module.py",
                    line=20,
                    start_line=18,
                    created_at="2026-05-23T00:00:00Z",
                ),
                PRReviewComment(
                    id=102,
                    body="Also update the test coverage.",
                    author="reviewer",
                    path="pkg/module.py",
                    line=21,
                    start_line=18,
                    created_at="2026-05-23T00:01:00Z",
                ),
            ),
        )
    ]
    if include_resolved:
        threads.append(
            PRReviewThread(
                id="PRRT_RESOLVED",
                path="pkg/resolved.py",
                line=5,
                start_line=None,
                is_resolved=True,
                is_outdated=False,
                comments=(
                    PRReviewComment(
                        id=201,
                        body="Resolved reference.",
                        author="reviewer",
                        path="pkg/resolved.py",
                        line=5,
                        created_at="2026-05-23T00:02:00Z",
                    ),
                ),
            )
        )

    manifest = build_get_feedback_payload_manifest(
        payload_reference=_payload_reference(),
        pr_number=42,
        reviews=(
            PRReview(
                id="PRR_1",
                author="reviewer",
                body="Top-level review feedback.",
                state="CHANGES_REQUESTED",
                submitted_at="2026-05-23T00:00:00Z",
            ),
        ),
        review_threads=tuple(threads),
        discussion_comments=(
            PRDiscussionComment(
                id=301,
                body="Please respond to this discussion.",
                author="reviewer",
                url="https://example.com/comment/301",
            ),
        ),
    )
    return manifest.model_dump(mode="json")


def test_build_feedback_classification_template_prefills_deterministic_fields() -> None:
    manifest = _manifest_payload(include_resolved=True)

    result = build_feedback_classification_template(manifest=manifest)
    template = result.classification_template.model_dump(mode="json")

    assert result.manifest_kind == "get_feedback"
    assert result.pr_number == 42
    assert result.payload_path == _payload_reference().payload_path
    assert result.counts.reviews == 1
    assert result.counts.review_threads == 1
    assert result.counts.thread_comments == 2
    assert result.counts.discussion_comments == 1
    assert result.counts.resolved_review_threads_omitted == 1
    assert template["reviews"][0] == {
        "review_id": "PRR_1",
        "disposition": FILL_DISPOSITION_PLACEHOLDER,
        "body_locator": {
            "json_pointer": "/data/reviews/0/body",
            "item_pointer": "/data/reviews/0",
        },
        "summary": "",
        "action_summary": None,
        "complexity": None,
        "pre_existing": False,
        "informational_reason": None,
    }
    assert template["review_threads"][0]["thread_id"] == "PRRT_1"
    assert template["review_threads"][0]["thread_item_pointer"] == "/data/review_threads/0"
    assert template["review_threads"][0]["covered_comments"] == [
        {
            "comment_id": 101,
            "body_locator": {
                "json_pointer": "/data/review_threads/0/comments/0/body",
                "item_pointer": "/data/review_threads/0/comments/0",
            },
        },
        {
            "comment_id": 102,
            "body_locator": {
                "json_pointer": "/data/review_threads/0/comments/1/body",
                "item_pointer": "/data/review_threads/0/comments/1",
            },
        },
    ]
    assert template["discussion_comments"][0] == {
        "comment_id": 301,
        "disposition": FILL_DISPOSITION_PLACEHOLDER,
        "body_locator": {
            "json_pointer": "/data/discussion_comments/0/body",
            "item_pointer": "/data/discussion_comments/0",
        },
        "summary": "",
        "action_summary": None,
        "complexity": None,
        "needs_reply": False,
        "informational_reason": None,
    }
    serialized_template = result.classification_template.model_dump_json()
    for omitted_key in ("body_chars", "domain", "path", "line", "author"):
        assert omitted_key not in serialized_template


def test_feedback_classification_template_omits_resolved_threads() -> None:
    manifest = _manifest_payload(include_resolved=True)

    result = build_feedback_classification_template(manifest=manifest)

    assert [thread.thread_id for thread in result.classification_template.review_threads] == [
        "PRRT_1"
    ]
    assert result.counts.resolved_review_threads_omitted == 1


def test_feedback_classification_template_fails_closed_for_duplicate_manifest_ids() -> None:
    manifest = _manifest_payload()
    manifest["reviews"].append(deepcopy(manifest["reviews"][0]))

    with pytest.raises(FeedbackClassificationTemplateManifestError) as exc_info:
        build_feedback_classification_template(manifest=manifest)

    assert exc_info.value.errors[0].code == "invalid_schema"
    assert exc_info.value.errors[0].identifier == "PRR_1"
