"""Tests for PR feedback classification validation."""

from __future__ import annotations

from copy import deepcopy

from asdl_core.gh.types import PRDiscussionComment, PRReview, PRReviewComment, PRReviewThread
from asdl_core.payloads.models import PayloadReference
from asdl_pr_address.cli.pr_address.feedback_classification import (
    FILL_DISPOSITION_PLACEHOLDER,
    FeedbackClassificationValidationResult,
    ValidationErrorCode,
    build_feedback_classification_template,
    validate_feedback_classification,
)
from asdl_pr_address.cli.pr_address.feedback_payload import (
    build_get_feedback_payload_manifest,
    build_prepare_run_payload_manifest,
)


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


def _locator_ref(locator: dict) -> dict:
    return {
        "json_pointer": locator["json_pointer"],
        "item_pointer": locator["item_pointer"],
    }


def _complete_packet(manifest: dict) -> dict:
    review = manifest["reviews"][0]
    thread = manifest["review_threads"][0]
    discussion = manifest["discussion_comments"][0]
    return {
        "schema_version": 1,
        "reviews": [
            {
                "review_id": review["id"],
                "disposition": "informational",
                "body_locator": _locator_ref(review["body_locator"]),
                "summary": "The top-level review is acknowledged context.",
                "informational_reason": "acknowledgement",
            }
        ],
        "review_threads": [
            {
                "thread_id": thread["thread_id"],
                "disposition": "actionable",
                "thread_item_pointer": thread["item_pointer"],
                "covered_comments": [
                    {
                        "comment_id": comment["id"],
                        "body_locator": _locator_ref(comment["body_locator"]),
                    }
                    for comment in thread["comments"]
                ],
                "summary": "The inline thread requests a local implementation/test update.",
                "action_summary": "Update implementation and tests for the requested helper.",
                "complexity": "local",
            }
        ],
        "discussion_comments": [
            {
                "comment_id": discussion["comment_id"],
                "disposition": "actionable",
                "body_locator": _locator_ref(discussion["body_locator"]),
                "summary": "The discussion comment needs a reply.",
                "action_summary": "Reply after applying the requested change.",
                "complexity": "single_file",
                "needs_reply": True,
            }
        ],
    }


def _validate(manifest: dict, packet: dict) -> FeedbackClassificationValidationResult:
    return validate_feedback_classification(manifest=manifest, classification=packet)


def _filled_template_packet(manifest: dict, *, include_resolved: bool = False) -> dict:
    result = build_feedback_classification_template(manifest=manifest)
    packet = result.classification_template.model_dump(mode="json")
    packet["reviews"][0].update(
        {
            "disposition": "informational",
            "summary": "The top-level review is acknowledged context.",
            "informational_reason": "acknowledgement",
        }
    )
    packet["review_threads"][0].update(
        {
            "disposition": "actionable",
            "summary": "The inline thread requests a local implementation/test update.",
            "action_summary": "Update implementation and tests for the requested helper.",
            "complexity": "local",
        }
    )
    packet["discussion_comments"][0].update(
        {
            "disposition": "actionable",
            "summary": "The discussion comment needs a reply.",
            "action_summary": "Reply after applying the requested change.",
            "complexity": "single_file",
            "needs_reply": True,
        }
    )
    if include_resolved:
        assert "PRRT_RESOLVED" not in {thread["thread_id"] for thread in packet["review_threads"]}
    return packet


def _error_codes(result: FeedbackClassificationValidationResult) -> set[ValidationErrorCode]:
    return {error.code for error in result.errors}


def test_validate_feedback_classification_accepts_complete_packet() -> None:
    manifest = _manifest_payload()
    packet = _complete_packet(manifest)

    result = _validate(manifest, packet)

    assert result.valid is True
    assert result.errors == ()
    assert result.manifest_kind == "get_feedback"
    assert result.pr_number == 42
    assert result.counts.reviews_expected == 1
    assert result.counts.reviews_classified == 1
    assert result.counts.review_threads_expected == 1
    assert result.counts.review_threads_classified == 1
    assert result.counts.thread_comments_expected == 2
    assert result.counts.thread_comments_covered == 2
    assert result.counts.discussion_comments_expected == 1
    assert result.counts.discussion_comments_classified == 1


def test_validate_feedback_classification_accepts_empty_prepare_run_found_false_packet() -> None:
    manifest = build_prepare_run_payload_manifest(
        payload_reference=_payload_reference(),
        found=False,
        current_branch="feature",
        returncode=1,
        error="no PR found",
    ).model_dump(mode="json")

    result = _validate(
        manifest,
        {
            "schema_version": 1,
            "reviews": [],
            "review_threads": [],
            "discussion_comments": [],
        },
    )

    assert result.valid is True
    assert result.manifest_kind == "prepare_run"
    assert result.pr_number is None
    assert result.counts.reviews_expected == 0
    assert result.counts.review_threads_expected == 0
    assert result.counts.discussion_comments_expected == 0


def test_build_feedback_classification_template_prefills_deterministic_fields() -> None:
    manifest = _manifest_payload()

    result = build_feedback_classification_template(manifest=manifest)
    template = result.classification_template.model_dump(mode="json")

    assert result.manifest_kind == "get_feedback"
    assert result.pr_number == 42
    assert result.counts.model_dump(mode="json") == {
        "reviews": 1,
        "review_threads": 1,
        "resolved_review_threads_omitted": 0,
        "thread_comments": 2,
        "discussion_comments": 1,
    }
    assert template["reviews"][0] == {
        "review_id": "PRR_1",
        "disposition": FILL_DISPOSITION_PLACEHOLDER,
        "body_locator": _locator_ref(manifest["reviews"][0]["body_locator"]),
        "summary": "",
        "action_summary": None,
        "complexity": None,
        "pre_existing": False,
        "informational_reason": None,
    }
    assert template["review_threads"][0]["thread_id"] == "PRRT_1"
    assert template["review_threads"][0]["thread_item_pointer"] == "/data/review_threads/0"
    thread_comments = manifest["review_threads"][0]["comments"]
    assert template["review_threads"][0]["covered_comments"] == [
        {
            "comment_id": 101,
            "body_locator": _locator_ref(thread_comments[0]["body_locator"]),
        },
        {
            "comment_id": 102,
            "body_locator": _locator_ref(thread_comments[1]["body_locator"]),
        },
    ]
    assert template["discussion_comments"][0]["comment_id"] == 301
    template_json = str(template)
    assert "body_chars" not in template_json
    assert "domain" not in template_json
    assert "path" not in template_json
    assert "line" not in template_json
    assert "author" not in template_json


def test_filled_feedback_classification_template_validates() -> None:
    manifest = _manifest_payload()
    packet = _filled_template_packet(manifest)

    result = _validate(manifest, packet)

    assert result.valid is True
    assert result.errors == ()


def test_unfilled_feedback_classification_template_does_not_validate() -> None:
    manifest = _manifest_payload()
    template = build_feedback_classification_template(manifest=manifest).classification_template

    result = _validate(manifest, template.model_dump(mode="json"))

    assert result.valid is False
    assert "invalid_schema" in _error_codes(result)


def test_feedback_classification_template_omits_resolved_threads() -> None:
    manifest = _manifest_payload(include_resolved=True)
    packet = _filled_template_packet(manifest, include_resolved=True)

    result = _validate(manifest, packet)

    assert result.valid is True
    assert {thread["thread_id"] for thread in packet["review_threads"]} == {"PRRT_1"}
    assert (
        build_feedback_classification_template(
            manifest=manifest
        ).counts.resolved_review_threads_omitted
        == 1
    )


def test_validate_feedback_classification_reports_missing_items() -> None:
    manifest = _manifest_payload()
    packet = _complete_packet(manifest)
    packet["reviews"] = []
    packet["review_threads"] = []
    packet["discussion_comments"] = []

    result = _validate(manifest, packet)

    assert result.valid is False
    assert {"missing_review", "missing_thread", "missing_discussion_comment"}.issubset(
        _error_codes(result)
    )


def test_validate_feedback_classification_reports_duplicate_items() -> None:
    manifest = _manifest_payload()
    packet = _complete_packet(manifest)
    packet["reviews"].append(deepcopy(packet["reviews"][0]))
    packet["review_threads"].append(deepcopy(packet["review_threads"][0]))
    packet["review_threads"][0]["covered_comments"].append(
        deepcopy(packet["review_threads"][0]["covered_comments"][0])
    )
    packet["discussion_comments"].append(deepcopy(packet["discussion_comments"][0]))

    result = _validate(manifest, packet)

    assert result.valid is False
    assert {
        "duplicate_review",
        "duplicate_thread",
        "duplicate_thread_comment",
        "duplicate_discussion_comment",
    }.issubset(_error_codes(result))


def test_validate_feedback_classification_reports_unknown_items() -> None:
    manifest = _manifest_payload()
    packet = _complete_packet(manifest)
    packet["reviews"].append(
        {
            **deepcopy(packet["reviews"][0]),
            "review_id": "PRR_UNKNOWN",
        }
    )
    packet["review_threads"].append(
        {
            **deepcopy(packet["review_threads"][0]),
            "thread_id": "PRRT_UNKNOWN",
        }
    )
    packet["review_threads"][0]["covered_comments"].append(
        {
            **deepcopy(packet["review_threads"][0]["covered_comments"][0]),
            "comment_id": 999,
        }
    )
    packet["discussion_comments"].append(
        {
            **deepcopy(packet["discussion_comments"][0]),
            "comment_id": 999,
        }
    )

    result = _validate(manifest, packet)

    assert result.valid is False
    assert {
        "unknown_review",
        "unknown_thread",
        "unknown_thread_comment",
        "unknown_discussion_comment",
    }.issubset(_error_codes(result))


def test_validate_feedback_classification_rejects_invalid_locator_references() -> None:
    manifest = _manifest_payload()
    packet = _complete_packet(manifest)
    packet["reviews"][0]["body_locator"]["json_pointer"] = "/data/reviews/99/body"
    packet["review_threads"][0]["thread_item_pointer"] = "/data/review_threads/99"
    packet["review_threads"][0]["covered_comments"][0]["body_locator"]["item_pointer"] = (
        "/data/review_threads/0/comments/99"
    )
    packet["discussion_comments"][0]["body_locator"]["json_pointer"] = (
        "/data/discussion_comments/99/body"
    )

    result = _validate(manifest, packet)

    assert result.valid is False
    invalid_locator_errors = [error for error in result.errors if error.code == "invalid_locator"]
    assert len(invalid_locator_errors) == 4


def test_validate_feedback_classification_rejects_extra_locator_fields() -> None:
    manifest = _manifest_payload()
    packet = _complete_packet(manifest)
    packet["reviews"][0]["body_locator"]["body_chars"] = 42

    result = _validate(manifest, packet)

    assert result.valid is False
    assert "invalid_schema" in _error_codes(result)


def test_validate_feedback_classification_rejects_wrong_covered_comment_field_names() -> None:
    manifest = _manifest_payload()
    packet = _complete_packet(manifest)
    first_comment = packet["review_threads"][0]["covered_comments"][0]
    first_comment["id"] = first_comment.pop("comment_id")

    result = _validate(manifest, packet)

    assert result.valid is False
    assert "invalid_schema" in _error_codes(result)


def test_validate_feedback_classification_requires_all_thread_comments_covered() -> None:
    manifest = _manifest_payload()
    packet = _complete_packet(manifest)
    packet["review_threads"][0]["covered_comments"] = packet["review_threads"][0][
        "covered_comments"
    ][:1]

    result = _validate(manifest, packet)

    assert result.valid is False
    assert "missing_thread_comment" in _error_codes(result)


def test_validate_feedback_classification_rejects_resolved_thread_classification() -> None:
    manifest = _manifest_payload(include_resolved=True)
    packet = _complete_packet(manifest)
    resolved_thread = manifest["review_threads"][1]
    packet["review_threads"].append(
        {
            "thread_id": resolved_thread["thread_id"],
            "disposition": "informational",
            "thread_item_pointer": resolved_thread["item_pointer"],
            "covered_comments": [
                {
                    "comment_id": resolved_thread["comments"][0]["id"],
                    "body_locator": _locator_ref(resolved_thread["comments"][0]["body_locator"]),
                }
            ],
            "summary": "Resolved context.",
            "informational_reason": "resolved_reference",
        }
    )

    result = _validate(manifest, packet)

    assert result.valid is False
    assert "resolved_thread_classified" in _error_codes(result)


def test_validate_feedback_classification_rejects_invalid_action_and_informational_fields() -> None:
    manifest = _manifest_payload()
    packet = _complete_packet(manifest)
    packet["reviews"][0]["disposition"] = "actionable"
    packet["reviews"][0]["informational_reason"] = None
    packet["review_threads"][0]["disposition"] = "informational"
    packet["review_threads"][0]["informational_reason"] = "fyi"
    packet["discussion_comments"][0]["disposition"] = "informational"
    packet["discussion_comments"][0]["informational_reason"] = "question_only"

    result = _validate(manifest, packet)

    assert result.valid is False
    assert {"invalid_action_fields", "invalid_informational_fields"}.issubset(_error_codes(result))


def test_validate_feedback_classification_reports_invalid_enum_schema() -> None:
    manifest = _manifest_payload()
    packet = _complete_packet(manifest)
    packet["review_threads"][0]["complexity"] = "tiny"

    result = _validate(manifest, packet)

    assert result.valid is False
    assert "invalid_schema" in _error_codes(result)
