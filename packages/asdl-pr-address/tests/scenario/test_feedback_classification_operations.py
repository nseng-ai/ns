"""Scenario tests for pr-address feedback classification exec operations."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from click.testing import CliRunner

from asdl_core.clinkr.context import build_clinkr_context_object
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.gh.pr_testing import FakePRGateway
from asdl_core.gh.types import PRDiscussionComment, PRReview, PRReviewComment, PRReviewThread
from asdl_core.git.testing import FakeGitGateway
from asdl_core.payloads.models import PayloadReference
from asdl_pr_address.cli.main import build_cli
from asdl_pr_address.cli.pr_address.context import PrAddressCliContext
from asdl_pr_address.cli.pr_address.feedback_payload import build_prepare_run_payload_manifest


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def _ctx(fake: FakePRGateway) -> PrAddressCliContext:
    return PrAddressCliContext(pr_gateway=fake, git_gateway=FakeGitGateway())


def _obj(context: object) -> object:
    return build_clinkr_context_object(lambda: context)


def _payload_env(tmp_path: Path, *, session_id: str = "session1") -> dict[str, str]:
    return {
        "ASDL_PAYLOAD_ROOT": str(tmp_path / "payload-root"),
        "ASDL_PAYLOAD_SESSION_ID": session_id,
    }


def _payload_reference(tmp_path: Path) -> PayloadReference:
    return PayloadReference(
        payload_path=str(tmp_path / "payload.raw.json"),
        session_id="session1",
        descriptor="test",
        role="raw",
        created_at_utc="2026-06-03T12:34:56Z",
        sequence=1,
        payload_bytes=17,
        content_type="application/json",
        extension="json",
    )


def _locator_ref(locator: dict) -> dict:
    return {
        "json_pointer": locator["json_pointer"],
        "item_pointer": locator["item_pointer"],
    }


def _complete_classification_packet(manifest: dict) -> dict:
    return {
        "schema_version": 1,
        "reviews": [
            {
                "review_id": review["id"],
                "disposition": "informational",
                "body_locator": _locator_ref(review["body_locator"]),
                "summary": "Top-level review was accounted for.",
                "informational_reason": "acknowledgement",
            }
            for review in manifest["reviews"]
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
                "summary": "Inline review thread requires a code change.",
                "action_summary": "Apply the requested inline review change.",
                "complexity": "local",
            }
            for thread in manifest["review_threads"]
            if not thread["is_resolved"]
        ],
        "discussion_comments": [
            {
                "comment_id": comment["comment_id"],
                "disposition": "actionable",
                "body_locator": _locator_ref(comment["body_locator"]),
                "summary": "Discussion comment requires a follow-up reply.",
                "action_summary": "Reply after addressing the request.",
                "complexity": "single_file",
                "needs_reply": True,
            }
            for comment in manifest["discussion_comments"]
        ],
    }


def _summary_thread(
    thread_id: str,
    *,
    is_resolved: bool = False,
    comment_id: int = 1,
    body: str = "Please update this helper before merging.",
) -> PRReviewThread:
    return PRReviewThread(
        id=thread_id,
        path="src/app.py",
        line=10,
        start_line=8,
        is_resolved=is_resolved,
        is_outdated=False,
        comments=(
            PRReviewComment(
                id=comment_id,
                body=body,
                author="reviewer",
                path="src/app.py",
                line=10,
                start_line=8,
                created_at="2026-05-23T00:00:00Z",
            ),
        ),
    )


def _feedback_fake() -> FakePRGateway:
    return FakePRGateway(
        reviews={
            42: [
                PRReview(
                    id="PRR_1",
                    author="reviewer",
                    body="Please account for this review.",
                    state="CHANGES_REQUESTED",
                    submitted_at="2025-01-01T00:00:00Z",
                )
            ]
        },
        review_threads={42: [_summary_thread("PRRT_1", comment_id=7)]},
        discussion_comments={
            42: [
                PRDiscussionComment(
                    id=11,
                    author="reviewer",
                    body="Please reply when fixed.",
                    url="https://example.com/11",
                )
            ]
        },
    )


def test_classification_template_command_builds_template_from_get_feedback_manifest(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    fake = _feedback_fake()
    runner = CliRunner()
    get_result = runner.invoke(
        cli_group,
        ["exec", "get-feedback", "42", "--format", "json"],
        obj=_obj(_ctx(fake)),
        env=_payload_env(tmp_path),
    )
    assert get_result.exit_code == 0, get_result.output
    manifest = json.loads(get_result.output)["data"]

    template_result = runner.invoke(
        cli_group,
        ["exec", "classification-template", "--format", "json"],
        obj=_obj(_ctx(fake)),
        input=json.dumps(manifest),
    )

    assert template_result.exit_code == 0, template_result.output
    output = json.loads(template_result.output)
    data = output["data"]
    assert data["counts"] == {
        "reviews": 1,
        "review_threads": 1,
        "thread_comments": 1,
        "discussion_comments": 1,
        "resolved_review_threads_omitted": 0,
    }
    assert data["classification_template"]["reviews"][0]["review_id"] == "PRR_1"
    assert data["classification_template"]["reviews"][0]["disposition"] == (
        "<fill: actionable|informational>"
    )
    assert data["classification_template"]["review_threads"][0]["thread_id"] == "PRRT_1"
    assert data["classification_template"]["review_threads"][0]["covered_comments"] == [
        {
            "comment_id": 7,
            "body_locator": {
                "json_pointer": "/data/review_threads/0/comments/0/body",
                "item_pointer": "/data/review_threads/0/comments/0",
            },
        }
    ]
    assert data["classification_template"]["discussion_comments"][0]["comment_id"] == 11


def test_classification_template_command_accepts_manifest_json_option(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    manifest = build_prepare_run_payload_manifest(
        payload_reference=_payload_reference(tmp_path),
        found=False,
        current_branch="feature",
        returncode=1,
        error="no PR found",
    ).model_dump(mode="json")

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "classification-template",
            "--manifest-json",
            json.dumps(manifest),
            "--format",
            "json",
        ],
        obj=_obj(_ctx(FakePRGateway())),
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["manifest_kind"] == "prepare_run"
    assert data["pr_number"] is None
    assert data["counts"]["reviews"] == 0
    assert data["classification_template"] == {
        "schema_version": 1,
        "reviews": [],
        "review_threads": [],
        "discussion_comments": [],
    }


def test_classification_template_command_accepts_manifest_file(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    fake = _feedback_fake()
    get_result = CliRunner().invoke(
        cli_group,
        ["exec", "get-feedback", "42", "--format", "json"],
        obj=_obj(_ctx(fake)),
        env=_payload_env(tmp_path),
    )
    assert get_result.exit_code == 0, get_result.output
    manifest = json.loads(get_result.output)["data"]
    manifest_path = tmp_path / "manifest.json"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "classification-template",
            "--manifest-file",
            str(manifest_path),
            "--format",
            "json",
        ],
        obj=_obj(_ctx(fake)),
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["counts"]["reviews"] == 1


def test_classification_template_command_rejects_invalid_json(
    cli_group: ClinkrGroup,
) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["exec", "classification-template", "--format", "json"],
        obj=_obj(_ctx(FakePRGateway())),
        input="{",
    )

    assert result.exit_code == 2, result.output
    output = json.loads(result.output)
    assert output["error_type"] == "invalid_json"


def test_validate_feedback_classification_command_accepts_complete_get_feedback_packet(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    fake = FakePRGateway(
        reviews={
            42: [
                PRReview(
                    id="PRR_1",
                    author="reviewer",
                    body="Please account for this review.",
                    state="CHANGES_REQUESTED",
                    submitted_at="2025-01-01T00:00:00Z",
                )
            ]
        },
        review_threads={
            42: [
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
                            body="Add focused tests here.",
                            author="reviewer",
                            path="file.py",
                            line=10,
                            start_line=8,
                            created_at="2025-01-01T00:00:00Z",
                        ),
                    ),
                )
            ]
        },
        discussion_comments={
            42: [
                PRDiscussionComment(
                    id=11,
                    author="reviewer",
                    body="Please reply when fixed.",
                    url="https://example.com/11",
                )
            ]
        },
    )
    runner = CliRunner()
    get_result = runner.invoke(
        cli_group,
        ["exec", "get-feedback", "42", "--format", "json"],
        obj=_obj(_ctx(fake)),
        env=_payload_env(tmp_path),
    )
    assert get_result.exit_code == 0, get_result.output
    manifest = json.loads(get_result.output)["data"]
    packet = _complete_classification_packet(manifest)

    validate_result = runner.invoke(
        cli_group,
        ["exec", "validate-feedback-classification", "--format", "json"],
        obj=_obj(_ctx(fake)),
        input=json.dumps({"manifest": manifest, "classification": packet}),
    )

    assert validate_result.exit_code == 0, validate_result.output
    output = json.loads(validate_result.output)
    assert output["exit_code"] == 0
    assert output["data"]["valid"] is True
    assert output["data"]["counts"]["thread_comments_covered"] == 1


def test_validate_feedback_classification_command_accepts_split_json_options(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    fake = _feedback_fake()
    runner = CliRunner()
    get_result = runner.invoke(
        cli_group,
        ["exec", "get-feedback", "42", "--format", "json"],
        obj=_obj(_ctx(fake)),
        env=_payload_env(tmp_path),
    )
    assert get_result.exit_code == 0, get_result.output
    manifest = json.loads(get_result.output)["data"]
    packet = _complete_classification_packet(manifest)

    validate_result = runner.invoke(
        cli_group,
        [
            "exec",
            "validate-feedback-classification",
            "--manifest-json",
            json.dumps(manifest),
            "--classification-json",
            json.dumps(packet),
            "--format",
            "json",
        ],
        obj=_obj(_ctx(fake)),
    )

    assert validate_result.exit_code == 0, validate_result.output
    output = json.loads(validate_result.output)
    assert output["data"]["valid"] is True


def test_validate_feedback_classification_command_split_inputs_ignore_stdin(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    manifest = build_prepare_run_payload_manifest(
        payload_reference=_payload_reference(tmp_path),
        found=False,
        current_branch="feature",
        returncode=1,
        error="no PR found",
    ).model_dump(mode="json")
    packet = {"schema_version": 1, "reviews": [], "review_threads": [], "discussion_comments": []}

    validate_result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "validate-feedback-classification",
            "--manifest-json",
            json.dumps(manifest),
            "--classification-json",
            json.dumps(packet),
            "--format",
            "json",
        ],
        obj=_obj(_ctx(FakePRGateway())),
        input="this stdin content is ignored in split mode",
    )

    assert validate_result.exit_code == 0, validate_result.output
    output = json.loads(validate_result.output)
    assert output["data"]["valid"] is True


def test_validate_feedback_classification_command_accepts_split_files(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    fake = _feedback_fake()
    runner = CliRunner()
    get_result = runner.invoke(
        cli_group,
        ["exec", "get-feedback", "42", "--format", "json"],
        obj=_obj(_ctx(fake)),
        env=_payload_env(tmp_path),
    )
    assert get_result.exit_code == 0, get_result.output
    manifest = json.loads(get_result.output)["data"]
    packet = _complete_classification_packet(manifest)
    manifest_path = tmp_path / "manifest.json"
    classification_path = tmp_path / "classification.json"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    classification_path.write_text(json.dumps(packet), encoding="utf-8")

    validate_result = runner.invoke(
        cli_group,
        [
            "exec",
            "validate-feedback-classification",
            "--manifest-file",
            str(manifest_path),
            "--classification-file",
            str(classification_path),
            "--format",
            "json",
        ],
        obj=_obj(_ctx(fake)),
    )

    assert validate_result.exit_code == 0, validate_result.output
    output = json.loads(validate_result.output)
    assert output["data"]["valid"] is True


def test_validate_feedback_classification_command_rejects_mixed_wrapper_and_split_inputs(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    manifest = build_prepare_run_payload_manifest(
        payload_reference=_payload_reference(tmp_path),
        found=False,
        current_branch="feature",
        returncode=1,
        error="no PR found",
    ).model_dump(mode="json")
    packet = {"schema_version": 1, "reviews": [], "review_threads": [], "discussion_comments": []}

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "validate-feedback-classification",
            "--payload-json",
            json.dumps({"manifest": manifest, "classification": packet}),
            "--manifest-json",
            json.dumps(manifest),
            "--classification-json",
            json.dumps(packet),
            "--format",
            "json",
        ],
        obj=_obj(_ctx(FakePRGateway())),
    )

    assert result.exit_code == 2, result.output
    output = json.loads(result.output)
    assert output["error_type"] == "invalid_request"


def test_validate_feedback_classification_command_rejects_missing_split_counterpart(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    manifest = build_prepare_run_payload_manifest(
        payload_reference=_payload_reference(tmp_path),
        found=False,
        current_branch="feature",
        returncode=1,
        error="no PR found",
    ).model_dump(mode="json")

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "validate-feedback-classification",
            "--manifest-json",
            json.dumps(manifest),
            "--format",
            "json",
        ],
        obj=_obj(_ctx(FakePRGateway())),
    )

    assert result.exit_code == 2, result.output
    output = json.loads(result.output)
    assert output["error_type"] == "invalid_request"


def test_validate_feedback_classification_command_returns_negative_for_incomplete_packet(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    fake = FakePRGateway(
        review_threads={
            42: [
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
                            body="Add focused tests here.",
                            author="reviewer",
                            path="file.py",
                            line=10,
                            start_line=8,
                            created_at="2025-01-01T00:00:00Z",
                        ),
                    ),
                )
            ]
        }
    )
    runner = CliRunner()
    get_result = runner.invoke(
        cli_group,
        ["exec", "get-feedback", "42", "--format", "json"],
        obj=_obj(_ctx(fake)),
        env=_payload_env(tmp_path),
    )
    assert get_result.exit_code == 0, get_result.output
    manifest = json.loads(get_result.output)["data"]
    packet = _complete_classification_packet(manifest)
    packet["review_threads"] = []

    validate_result = runner.invoke(
        cli_group,
        ["exec", "validate-feedback-classification", "--format", "json"],
        obj=_obj(_ctx(fake)),
        input=json.dumps({"manifest": manifest, "classification": packet}),
    )

    assert validate_result.exit_code == 1, validate_result.output
    output = json.loads(validate_result.output)
    assert output["exit_code"] == 1
    assert output["data"]["valid"] is False
    assert "missing_thread" in {error["code"] for error in output["data"]["errors"]}


def test_validate_feedback_classification_command_rejects_invalid_json(
    cli_group: ClinkrGroup,
) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["exec", "validate-feedback-classification", "--format", "json"],
        obj=_obj(_ctx(FakePRGateway())),
        input="{",
    )

    assert result.exit_code == 2, result.output
    output = json.loads(result.output)
    assert output["exit_code"] == 2
    assert output["error_type"] == "invalid_json"


def _manifest_review(manifest: dict, review_id: str) -> dict:
    for review in manifest["reviews"]:
        if review["id"] == review_id:
            return review
    raise AssertionError(f"Missing manifest review {review_id}")


def _manifest_thread(manifest: dict, thread_id: str) -> dict:
    for thread in manifest["review_threads"]:
        if thread["thread_id"] == thread_id:
            return thread
    raise AssertionError(f"Missing manifest thread {thread_id}")


def _manifest_discussion_comment(manifest: dict, comment_id: int) -> dict:
    for comment in manifest["discussion_comments"]:
        if comment["comment_id"] == comment_id:
            return comment
    raise AssertionError(f"Missing manifest discussion comment {comment_id}")


def _classified_review(
    manifest: dict,
    review_id: str,
    *,
    complexity: str,
    pre_existing: bool = False,
) -> dict:
    review = _manifest_review(manifest, review_id)
    return {
        "review_id": review_id,
        "disposition": "actionable",
        "body_locator": _locator_ref(review["body_locator"]),
        "summary": f"Review {review_id} requires action.",
        "action_summary": f"Address review {review_id}.",
        "complexity": complexity,
        "pre_existing": pre_existing,
    }


def _classified_thread(
    manifest: dict,
    thread_id: str,
    *,
    complexity: str,
    pre_existing: bool = False,
) -> dict:
    thread = _manifest_thread(manifest, thread_id)
    return {
        "thread_id": thread_id,
        "disposition": "actionable",
        "thread_item_pointer": thread["item_pointer"],
        "covered_comments": [
            {
                "comment_id": comment["id"],
                "body_locator": _locator_ref(comment["body_locator"]),
            }
            for comment in thread["comments"]
        ],
        "summary": f"Thread {thread_id} requires action.",
        "action_summary": f"Address thread {thread_id}.",
        "complexity": complexity,
        "pre_existing": pre_existing,
    }


def _classified_discussion_comment(
    manifest: dict,
    comment_id: int,
    *,
    complexity: str,
    needs_reply: bool = False,
) -> dict:
    comment = _manifest_discussion_comment(manifest, comment_id)
    return {
        "comment_id": comment_id,
        "disposition": "actionable",
        "body_locator": _locator_ref(comment["body_locator"]),
        "summary": f"Discussion comment {comment_id} requires action.",
        "action_summary": f"Address discussion comment {comment_id}.",
        "complexity": complexity,
        "needs_reply": needs_reply,
    }


def test_plan_feedback_builds_ordered_batches_from_valid_classification(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    review_body = "PLAN_REVIEW_SENTINEL cross-cutting request"
    second_review_body = "PLAN_SECOND_REVIEW_SENTINEL complex request"
    first_thread_body = "PLAN_THREAD_ONE_SENTINEL pre-existing request"
    second_thread_body = "PLAN_THREAD_TWO_SENTINEL single-file request"
    discussion_body = "PLAN_DISCUSSION_SENTINEL local reply request"
    fake = FakePRGateway(
        reviews={
            42: [
                PRReview(
                    id="PRR_1",
                    author="reviewer",
                    body=review_body,
                    state="CHANGES_REQUESTED",
                    submitted_at="2025-01-01T00:00:00Z",
                ),
                PRReview(
                    id="PRR_2",
                    author="reviewer-two",
                    body=second_review_body,
                    state="COMMENTED",
                    submitted_at="2025-01-02T00:00:00Z",
                ),
            ]
        },
        review_threads={
            42: [
                _summary_thread("PRRT_1", comment_id=7, body=first_thread_body),
                _summary_thread("PRRT_2", comment_id=8, body=second_thread_body),
            ]
        },
        discussion_comments={
            42: [
                PRDiscussionComment(
                    id=11,
                    author="reviewer",
                    body=discussion_body,
                    url="https://example.com/11",
                )
            ]
        },
    )
    get_result = CliRunner().invoke(
        cli_group,
        ["exec", "get-feedback", "42", "--format", "json"],
        obj=_obj(_ctx(fake)),
        env=_payload_env(tmp_path),
    )
    assert get_result.exit_code == 0, get_result.output
    manifest = json.loads(get_result.output)["data"]
    packet = {
        "schema_version": 1,
        "reviews": [
            _classified_review(manifest, "PRR_2", complexity="complex"),
            _classified_review(manifest, "PRR_1", complexity="cross_cutting"),
        ],
        "review_threads": [
            _classified_thread(manifest, "PRRT_2", complexity="single_file"),
            _classified_thread(
                manifest,
                "PRRT_1",
                complexity="pre_existing",
                pre_existing=True,
            ),
        ],
        "discussion_comments": [
            _classified_discussion_comment(
                manifest,
                11,
                complexity="local",
                needs_reply=True,
            )
        ],
    }

    plan_result = CliRunner().invoke(
        cli_group,
        ["exec", "plan-feedback", "--format", "json"],
        obj=_obj(_ctx(fake)),
        input=json.dumps({"manifest": manifest, "classification": packet}),
    )

    assert plan_result.exit_code == 0, plan_result.output
    assert review_body not in plan_result.output
    assert second_review_body not in plan_result.output
    assert first_thread_body not in plan_result.output
    assert second_thread_body not in plan_result.output
    assert discussion_body not in plan_result.output
    output = json.loads(plan_result.output)
    data = output["data"]
    assert data["valid"] is True
    assert [batch["batch_id"] for batch in data["batches"]] == [
        "pre_existing",
        "local",
        "single_file",
        "cross_cutting",
        "complex",
    ]
    assert [batch["approval_required"] for batch in data["batches"]] == [
        False,
        False,
        False,
        True,
        True,
    ]
    pre_existing_item = data["batches"][0]["items"][0]
    assert pre_existing_item["source_kind"] == "review_thread"
    assert pre_existing_item["thread_id"] == "PRRT_1"
    assert pre_existing_item["covered_comment_ids"] == [7]
    assert pre_existing_item["path"] == "src/app.py"
    assert pre_existing_item["line"] == 10
    assert pre_existing_item["body_locator"]["json_pointer"] == (
        "/data/review_threads/0/comments/0/body"
    )
    local_item = data["batches"][1]["items"][0]
    assert local_item["source_kind"] == "discussion_comment"
    assert local_item["discussion_comment_id"] == 11
    assert local_item["needs_reply"] is True
    cross_cutting_item = data["batches"][3]["items"][0]
    assert cross_cutting_item["source_kind"] == "review"
    assert cross_cutting_item["review_id"] == "PRR_1"
    assert cross_cutting_item["body_locator"]["json_pointer"] == "/data/reviews/0/body"
    assert data["counts"]["actionable_items"] == 5
    assert data["counts"]["approval_required_batches"] == 2


def test_plan_feedback_accepts_payload_json_option(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    fake = FakePRGateway(review_threads={42: [_summary_thread("PRRT_1", comment_id=7)]})
    get_result = CliRunner().invoke(
        cli_group,
        ["exec", "get-feedback", "42", "--format", "json"],
        obj=_obj(_ctx(fake)),
        env=_payload_env(tmp_path),
    )
    assert get_result.exit_code == 0, get_result.output
    manifest = json.loads(get_result.output)["data"]
    packet = _complete_classification_packet(manifest)

    plan_result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "plan-feedback",
            "--payload-json",
            json.dumps({"manifest": manifest, "classification": packet}),
            "--format",
            "json",
        ],
        obj=_obj(_ctx(fake)),
    )

    assert plan_result.exit_code == 0, plan_result.output
    output = json.loads(plan_result.output)
    assert output["data"]["valid"] is True
    assert output["data"]["batches"][0]["batch_id"] == "local"


def test_plan_feedback_returns_negative_for_invalid_classification(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    fake = FakePRGateway(review_threads={42: [_summary_thread("PRRT_1", comment_id=7)]})
    get_result = CliRunner().invoke(
        cli_group,
        ["exec", "get-feedback", "42", "--format", "json"],
        obj=_obj(_ctx(fake)),
        env=_payload_env(tmp_path),
    )
    assert get_result.exit_code == 0, get_result.output
    manifest = json.loads(get_result.output)["data"]
    packet = _complete_classification_packet(manifest)
    packet["review_threads"] = []

    plan_result = CliRunner().invoke(
        cli_group,
        ["exec", "plan-feedback", "--format", "json"],
        obj=_obj(_ctx(fake)),
        input=json.dumps({"manifest": manifest, "classification": packet}),
    )

    assert plan_result.exit_code == 1, plan_result.output
    output = json.loads(plan_result.output)
    assert output["exit_code"] == 1
    assert output["message"] == "PR feedback classification failed validation; no plan produced."
    assert output["data"]["valid"] is False
    assert output["data"]["batches"] == []
    assert "missing_thread" in {error["code"] for error in output["data"]["validation"]["errors"]}


def test_plan_feedback_reports_informational_items_without_batches(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    fake = FakePRGateway(
        reviews={
            42: [
                PRReview(
                    id="PRR_1",
                    author="reviewer",
                    body="Informational review body.",
                    state="COMMENTED",
                    submitted_at="2025-01-01T00:00:00Z",
                )
            ]
        },
        review_threads={42: [_summary_thread("PRRT_1", comment_id=7)]},
        discussion_comments={
            42: [
                PRDiscussionComment(
                    id=11,
                    author="reviewer",
                    body="FYI only.",
                    url="https://example.com/11",
                )
            ]
        },
    )
    get_result = CliRunner().invoke(
        cli_group,
        ["exec", "get-feedback", "42", "--format", "json"],
        obj=_obj(_ctx(fake)),
        env=_payload_env(tmp_path),
    )
    assert get_result.exit_code == 0, get_result.output
    manifest = json.loads(get_result.output)["data"]
    review = _manifest_review(manifest, "PRR_1")
    thread = _manifest_thread(manifest, "PRRT_1")
    discussion = _manifest_discussion_comment(manifest, 11)
    packet = {
        "schema_version": 1,
        "reviews": [
            {
                "review_id": "PRR_1",
                "disposition": "informational",
                "body_locator": _locator_ref(review["body_locator"]),
                "summary": "Review is FYI.",
                "informational_reason": "fyi",
            }
        ],
        "review_threads": [
            {
                "thread_id": "PRRT_1",
                "disposition": "informational",
                "thread_item_pointer": thread["item_pointer"],
                "covered_comments": [
                    {
                        "comment_id": comment["id"],
                        "body_locator": _locator_ref(comment["body_locator"]),
                    }
                    for comment in thread["comments"]
                ],
                "summary": "Thread is FYI.",
                "informational_reason": "already_addressed",
            }
        ],
        "discussion_comments": [
            {
                "comment_id": 11,
                "disposition": "informational",
                "body_locator": _locator_ref(discussion["body_locator"]),
                "summary": "Discussion is FYI.",
                "informational_reason": "automation",
            }
        ],
    }

    plan_result = CliRunner().invoke(
        cli_group,
        ["exec", "plan-feedback", "--format", "json"],
        obj=_obj(_ctx(fake)),
        input=json.dumps({"manifest": manifest, "classification": packet}),
    )

    assert plan_result.exit_code == 0, plan_result.output
    output = json.loads(plan_result.output)
    data = output["data"]
    assert data["batches"] == []
    assert data["counts"]["informational_items"] == 3
    informational_by_kind = {item["source_kind"]: item for item in data["informational"]}
    assert informational_by_kind["review"]["user_decision_required"] is False
    assert informational_by_kind["discussion_comment"]["user_decision_required"] is False
    thread_item = informational_by_kind["review_thread"]
    assert thread_item["user_decision_required"] is True
    assert thread_item["allowed_decisions"] == ["act", "dismiss", "skip"]
    assert thread_item["covered_comment_ids"] == [7]


def test_plan_feedback_rejects_invalid_json(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["exec", "plan-feedback", "--format", "json"],
        obj=_obj(_ctx(FakePRGateway())),
        input="{",
    )

    assert result.exit_code == 2, result.output
    output = json.loads(result.output)
    assert output["exit_code"] == 2
    assert output["error_type"] == "invalid_json"


def test_plan_feedback_handles_prepare_run_found_false_manifest(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    fake = FakePRGateway()
    prepare_result = CliRunner().invoke(
        cli_group,
        ["exec", "prepare-run", "--format", "json"],
        obj=_obj(
            PrAddressCliContext(
                pr_gateway=fake,
                git_gateway=FakeGitGateway(current_branch_by_path={Path.cwd(): "feature"}),
            )
        ),
        env=_payload_env(tmp_path),
    )
    assert prepare_result.exit_code == 0, prepare_result.output
    manifest = json.loads(prepare_result.output)["data"]
    packet = {
        "schema_version": 1,
        "reviews": [],
        "review_threads": [],
        "discussion_comments": [],
    }

    plan_result = CliRunner().invoke(
        cli_group,
        ["exec", "plan-feedback", "--format", "json"],
        obj=_obj(_ctx(fake)),
        input=json.dumps({"manifest": manifest, "classification": packet}),
    )

    assert plan_result.exit_code == 0, plan_result.output
    output = json.loads(plan_result.output)
    data = output["data"]
    assert data["manifest_kind"] == "prepare_run"
    assert data["pr_number"] is None
    assert data["batches"] == []
    assert data["informational"] == []
    assert data["counts"]["actionable_items"] == 0
    assert data["warnings"] == ["prepare-run manifest has found=false; plan is empty."]
