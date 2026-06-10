"""Scenario tests for the standalone ``pr-address`` CLI.

Every exec operation is exercised through ``build_cli()`` — the top-level
standalone CLI entry point that users and skills invoke directly.
"""

import json
from pathlib import Path

import pytest
from click.testing import CliRunner

from asdl_core.clinkr.context import build_clinkr_context_object
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.gh.pr_testing import FakePRGateway
from asdl_core.gh.types import (
    PRDiscussionComment,
    PRGatewayFailure,
    PRLookupMiss,
    PRReview,
    PRReviewComment,
    PRReviewThread,
    PRSummary,
)
from asdl_core.git.testing import FakeGitGateway
from asdl_pr_address.cli.main import build_cli
from asdl_pr_address.cli.pr_address.context import PrAddressCliContext


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def _ctx(fake: FakePRGateway) -> PrAddressCliContext:
    return PrAddressCliContext(pr_gateway=fake, git_gateway=FakeGitGateway())


def _obj(context: object) -> object:
    return build_clinkr_context_object(lambda: context)


def _invoke(
    cli_group: ClinkrGroup,
    args: list[str],
    fake: FakePRGateway,
    *,
    env: dict[str, str | None] | None = None,
) -> tuple[int, dict]:
    runner = CliRunner()
    ctx = _ctx(fake)
    result = runner.invoke(cli_group, args, obj=_obj(ctx), env=env)
    output = json.loads(result.output) if result.output.strip() else {}
    return result.exit_code, output


def _invoke_json(
    cli_group: ClinkrGroup,
    args: list[str],
    fake: FakePRGateway,
    *,
    env: dict[str, str | None] | None = None,
    input: str | None = None,
) -> tuple[int, dict]:
    runner = CliRunner()
    ctx = _ctx(fake)
    result = runner.invoke(
        cli_group,
        ["exec", *args, "--format", "json"],
        obj=_obj(ctx),
        env=env,
        input=input,
    )
    output = json.loads(result.output) if result.output.strip() else {}
    return result.exit_code, output


def _payload_env(tmp_path: Path, *, session_id: str = "session1") -> dict[str, str]:
    return {
        "ASDL_PAYLOAD_ROOT": str(tmp_path / "payload-root"),
        "ASDL_PAYLOAD_SESSION_ID": session_id,
    }


def _read_raw_payload(data: dict) -> dict:
    return json.loads(Path(data["payload_reference"]["payload_path"]).read_text(encoding="utf-8"))


def _summary_pr(number: int = 42) -> PRSummary:
    return PRSummary(
        number=number,
        title="Add compact feedback",
        url=f"https://github.com/dagster-io/asdl/pull/{number}",
        head_ref_name="feature",
        base_ref_name="master",
        state="OPEN",
    )


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


# -- standalone CLI smoke tests --


def test_version_option(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["--version"])
    assert result.exit_code == 0
    assert "version" in result.output


def test_help_short_flag(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["-h"])
    assert result.exit_code == 0
    assert "PR review address operations." in result.output
    assert "--version" in result.output


def test_exec_group_is_hidden_from_top_level_help(cli_group: ClinkrGroup) -> None:
    runner = CliRunner()
    result = runner.invoke(cli_group, ["-h"])
    assert result.exit_code == 0
    assert "exec" not in result.output


# -- get-feedback --


def test_get_feedback_full_scenario(cli_group: ClinkrGroup) -> None:
    reviews = [
        PRReview(
            id="PRR_1",
            author="reviewer",
            body="Fix this",
            state="CHANGES_REQUESTED",
            submitted_at="2025-01-01T00:00:00Z",
        ),
        PRReview(
            id="PRR_2",
            author="reviewer",
            body="LGTM",
            state="APPROVED",
            submitted_at="2025-01-01T00:00:00Z",
        ),
    ]
    threads = [
        PRReviewThread(
            id="PRRT_1",
            path="file.py",
            line=10,
            is_resolved=False,
            is_outdated=False,
            comments=(
                PRReviewComment(
                    id=1,
                    body="Add tests",
                    author="reviewer",
                    path="file.py",
                    line=10,
                    created_at="2025-01-01T00:00:00Z",
                ),
            ),
        ),
    ]
    comments = [
        PRDiscussionComment(
            id=1,
            author="Graphite Automations",
            body="Stack info",
            url="https://example.com/1",
        ),
    ]
    fake = FakePRGateway(
        reviews={42: reviews},
        review_threads={42: threads},
        discussion_comments={42: comments},
    )

    exit_code, output = _invoke(
        cli_group,
        ["exec", "get-feedback", "42", "--payload-mode", "inline"],
        fake,
    )

    assert exit_code == 0
    assert output["payload_mode"] == "inline"
    assert output["pr_number"] == 42
    # All reviews pass through unfiltered — including APPROVED.
    assert len(output["reviews"]) == 2
    assert {r["id"] for r in output["reviews"]} == {"PRR_1", "PRR_2"}
    assert {r["state"] for r in output["reviews"]} == {"CHANGES_REQUESTED", "APPROVED"}
    # Threads pass through as full PRReviewThread records with nested comments.
    assert len(output["review_threads"]) == 1
    assert output["review_threads"][0]["id"] == "PRRT_1"
    assert output["review_threads"][0]["path"] == "file.py"
    assert len(output["review_threads"][0]["comments"]) == 1
    # Discussion comments pass through as full PRDiscussionComment records — including
    # bot/Graphite comments that used to be pre-classified as informational.
    assert len(output["discussion_comments"]) == 1
    assert output["discussion_comments"][0]["author"] == "Graphite Automations"
    assert output["discussion_comments"][0]["body"] == "Stack info"


def test_get_feedback_empty_pr(cli_group: ClinkrGroup) -> None:
    fake = FakePRGateway()

    exit_code, output = _invoke(
        cli_group,
        ["exec", "get-feedback", "99", "--payload-mode", "inline"],
        fake,
    )

    assert exit_code == 0
    assert output["payload_mode"] == "inline"
    assert output["pr_number"] == 99
    assert output["reviews"] == []
    assert output["review_threads"] == []
    assert output["discussion_comments"] == []


def test_get_feedback_inline_json_mode_succeeds_without_payload_session(
    cli_group: ClinkrGroup,
) -> None:
    fake = FakePRGateway()
    ctx = _ctx(fake)
    runner = CliRunner()
    result = runner.invoke(
        cli_group,
        ["exec", "get-feedback", "99", "--payload-mode", "inline", "--format", "json"],
        obj=_obj(ctx),
        env={"ASDL_PAYLOAD_SESSION_ID": None},
    )

    assert result.exit_code == 0
    output = json.loads(result.output)
    assert output["exit_code"] == 0
    assert output["data"]["payload_mode"] == "inline"
    assert output["data"]["pr_number"] == 99


def test_get_feedback_default_payload_json_mode_writes_raw_payload(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    review_body = "REVIEW_BODY_SENTINEL please fix the workflow"
    thread_body = "THREAD_BODY_SENTINEL add focused tests"
    discussion_body = "DISCUSSION_BODY_SENTINEL stack metadata"
    fake = FakePRGateway(
        reviews={
            42: [
                PRReview(
                    id="PRR_1",
                    author="reviewer",
                    body=review_body,
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
                            body=thread_body,
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
                    author="Graphite Automations",
                    body=discussion_body,
                    url="https://example.com/11",
                )
            ]
        },
    )
    result = CliRunner().invoke(
        cli_group,
        ["exec", "get-feedback", "42", "--format", "json"],
        obj=_obj(_ctx(fake)),
        env=_payload_env(tmp_path),
    )

    assert result.exit_code == 0, result.output
    assert review_body not in result.output
    assert thread_body not in result.output
    assert discussion_body not in result.output
    output = json.loads(result.output)
    assert output["exit_code"] == 0
    data = output["data"]
    assert data["payload_mode"] == "payload"
    assert data["pr_number"] == 42
    assert data["payload_reference"]["descriptor"] == "pr-address-get-feedback-pr-42"
    assert data["payload_reference"]["role"] == "raw"
    assert data["counts"] == {
        "reviews": 1,
        "review_threads": 1,
        "unresolved_review_threads": 1,
        "resolved_review_threads": 0,
        "thread_comments": 1,
        "discussion_comments": 1,
    }
    assert data["reviews"][0]["body_locator"] == {
        "body_chars": len(review_body),
        "json_pointer": "/data/reviews/0/body",
        "item_pointer": "/data/reviews/0",
        "domain": {
            "kind": "review",
            "review_id": "PRR_1",
            "thread_id": None,
            "comment_id": None,
            "discussion_comment_id": None,
            "comment_index": None,
            "path": None,
            "line": None,
            "start_line": None,
            "is_resolved": None,
            "is_outdated": None,
            "author": "reviewer",
        },
    }
    assert data["review_threads"][0]["comments"][0]["body_locator"]["json_pointer"] == (
        "/data/review_threads/0/comments/0/body"
    )
    assert data["review_threads"][0]["comments"][0]["body_locator"]["body_chars"] == len(
        thread_body
    )
    assert data["discussion_comments"][0]["body_locator"]["json_pointer"] == (
        "/data/discussion_comments/0/body"
    )
    assert data["discussion_comments"][0]["body_locator"]["body_chars"] == len(discussion_body)

    raw_payload = _read_raw_payload(data)
    assert raw_payload["exit_code"] == 0
    assert raw_payload["data"]["payload_mode"] == "inline"
    assert raw_payload["data"]["reviews"][0]["body"] == review_body
    assert raw_payload["data"]["review_threads"][0]["comments"][0]["body"] == thread_body
    assert raw_payload["data"]["discussion_comments"][0]["body"] == discussion_body


def test_get_feedback_default_payload_human_mode_omits_bodies(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    body = "HUMAN_MODE_BODY_SENTINEL"
    fake = FakePRGateway(
        reviews={
            42: [
                PRReview(
                    id="PRR_1",
                    author="reviewer",
                    body=body,
                    state="COMMENTED",
                    submitted_at="2025-01-01T00:00:00Z",
                )
            ]
        }
    )

    exit_code, output = _invoke(
        cli_group,
        ["exec", "get-feedback", "42"],
        fake,
        env=_payload_env(tmp_path),
    )

    assert exit_code == 0
    assert output["payload_mode"] == "payload"
    assert output["reviews"][0]["body_locator"]["body_chars"] == len(body)
    assert "body" not in output["reviews"][0]
    raw_payload = _read_raw_payload(output)
    assert raw_payload["data"]["reviews"][0]["body"] == body


def test_read_feedback_detail_reads_get_feedback_review_body(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    review_body = "READ_DETAIL_REVIEW_BODY_SENTINEL please fix the workflow"
    thread_body = "READ_DETAIL_THREAD_BODY_SENTINEL add focused tests"
    discussion_body = "READ_DETAIL_DISCUSSION_BODY_SENTINEL stack metadata"
    fake = FakePRGateway(
        reviews={
            42: [
                PRReview(
                    id="PRR_1",
                    author="reviewer",
                    body=review_body,
                    state="CHANGES_REQUESTED",
                    submitted_at="2025-01-01T00:00:00Z",
                )
            ]
        },
        review_threads={42: [_summary_thread("PRRT_1", body=thread_body)]},
        discussion_comments={
            42: [
                PRDiscussionComment(
                    id=11,
                    author="Graphite Automations",
                    body=discussion_body,
                    url="https://example.com/11",
                )
            ]
        },
    )

    get_exit, get_output = _invoke_json(
        cli_group,
        ["get-feedback", "42"],
        fake,
        env=_payload_env(tmp_path),
    )
    assert get_exit == 0
    manifest = get_output["data"]
    payload_path = manifest["payload_reference"]["payload_path"]
    json_pointer = manifest["reviews"][0]["body_locator"]["json_pointer"]

    detail_exit, detail_output = _invoke_json(
        cli_group,
        [
            "read-feedback-detail",
            "--payload-path",
            payload_path,
            "--json-pointer",
            json_pointer,
        ],
        FakePRGateway(),
    )

    assert detail_exit == 0
    detail = detail_output["data"]
    assert detail == {
        "payload_path": payload_path,
        "json_pointer": json_pointer,
        "detail_kind": "review_body",
        "value": review_body,
    }
    detail_json = json.dumps(detail_output)
    assert thread_body not in detail_json
    assert discussion_body not in detail_json


def test_read_feedback_detail_reads_get_feedback_thread_comment_item(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    thread_body = "READ_DETAIL_THREAD_COMMENT_ITEM_SENTINEL add focused tests"
    fake = FakePRGateway(review_threads={42: [_summary_thread("PRRT_1", body=thread_body)]})

    get_exit, get_output = _invoke_json(
        cli_group,
        ["get-feedback", "42"],
        fake,
        env=_payload_env(tmp_path),
    )
    assert get_exit == 0
    manifest = get_output["data"]
    payload_path = manifest["payload_reference"]["payload_path"]
    json_pointer = manifest["review_threads"][0]["comments"][0]["body_locator"]["item_pointer"]

    detail_exit, detail_output = _invoke_json(
        cli_group,
        [
            "read-feedback-detail",
            "--payload-path",
            payload_path,
            "--json-pointer",
            json_pointer,
        ],
        FakePRGateway(),
    )

    assert detail_exit == 0
    detail = detail_output["data"]
    assert detail["payload_path"] == payload_path
    assert detail["json_pointer"] == json_pointer
    assert detail["detail_kind"] == "thread_comment"
    assert detail["value"]["id"] == 1
    assert detail["value"]["author"] == "reviewer"
    assert detail["value"]["body"] == thread_body
    assert detail["value"]["path"] == "src/app.py"


def test_read_feedback_detail_rejects_broad_pointer(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    fake = FakePRGateway(review_threads={42: [_summary_thread("PRRT_1")]})
    get_exit, get_output = _invoke_json(
        cli_group,
        ["get-feedback", "42"],
        fake,
        env=_payload_env(tmp_path),
    )
    assert get_exit == 0

    detail_exit, detail_output = _invoke_json(
        cli_group,
        [
            "read-feedback-detail",
            "--payload-path",
            get_output["data"]["payload_reference"]["payload_path"],
            "--json-pointer",
            "/data",
        ],
        FakePRGateway(),
    )

    assert detail_exit == 2
    assert detail_output["exit_code"] == 2
    assert detail_output["error_type"] == "invalid_request"


def test_read_feedback_detail_rejects_missing_payload(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    missing_payload = (
        tmp_path
        / "payload-root"
        / "sessions"
        / "session1"
        / "payloads"
        / "20260603t123456z-0001-missing.raw.json"
    )

    detail_exit, detail_output = _invoke_json(
        cli_group,
        [
            "read-feedback-detail",
            "--payload-path",
            str(missing_payload),
            "--json-pointer",
            "/data/reviews/0/body",
        ],
        FakePRGateway(),
    )

    assert detail_exit == 2
    assert detail_output["exit_code"] == 2
    assert detail_output["error_type"] == "payload_lookup_failed"


def test_read_feedback_detail_rejects_non_raw_payload(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    payload_dir = tmp_path / "payload-root" / "sessions" / "session1" / "payloads"
    payload_dir.mkdir(parents=True)
    summary_path = payload_dir / "20260603t123456z-0001-probe.summary.json"
    summary_path.write_text(
        json.dumps({"exit_code": 0, "data": {"reviews": [{"body": "summary"}]}}),
        encoding="utf-8",
    )

    detail_exit, detail_output = _invoke_json(
        cli_group,
        [
            "read-feedback-detail",
            "--payload-path",
            str(summary_path),
            "--json-pointer",
            "/data/reviews/0/body",
        ],
        FakePRGateway(),
    )

    assert detail_exit == 2
    assert detail_output["exit_code"] == 2
    assert detail_output["error_type"] == "payload_lookup_failed"


def test_read_feedback_detail_rejects_failed_raw_envelope(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    payload_dir = tmp_path / "payload-root" / "sessions" / "session1" / "payloads"
    payload_dir.mkdir(parents=True)
    raw_path = payload_dir / "20260603t123456z-0001-probe.raw.json"
    raw_path.write_text(
        json.dumps({"exit_code": 2, "data": {"reviews": [{"body": "failed"}]}}),
        encoding="utf-8",
    )

    detail_exit, detail_output = _invoke_json(
        cli_group,
        [
            "read-feedback-detail",
            "--payload-path",
            str(raw_path),
            "--json-pointer",
            "/data/reviews/0/body",
        ],
        FakePRGateway(),
    )

    assert detail_exit == 2
    assert detail_output["exit_code"] == 2
    assert detail_output["error_type"] == "payload_lookup_failed"


def test_read_feedback_details_writes_summary_artifact_without_inline_bodies(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    review_body = "READ_DETAILS_REVIEW_BODY_SENTINEL please fix the workflow"
    thread_body = "READ_DETAILS_THREAD_BODY_SENTINEL add focused tests"
    discussion_body = "READ_DETAILS_DISCUSSION_BODY_SENTINEL stack metadata"
    fake = FakePRGateway(
        reviews={
            42: [
                PRReview(
                    id="PRR_1",
                    author="reviewer",
                    body=review_body,
                    state="CHANGES_REQUESTED",
                    submitted_at="2025-01-01T00:00:00Z",
                )
            ]
        },
        review_threads={42: [_summary_thread("PRRT_1", body=thread_body)]},
        discussion_comments={
            42: [
                PRDiscussionComment(
                    id=11,
                    author="Graphite Automations",
                    body=discussion_body,
                    url="https://example.com/11",
                )
            ]
        },
    )

    get_exit, get_output = _invoke_json(
        cli_group,
        ["get-feedback", "42"],
        fake,
        env=_payload_env(tmp_path),
    )
    assert get_exit == 0
    manifest = get_output["data"]
    payload_path = manifest["payload_reference"]["payload_path"]
    request = {
        "payload_path": payload_path,
        "json_pointers": [
            manifest["reviews"][0]["body_locator"]["json_pointer"],
            manifest["review_threads"][0]["comments"][0]["body_locator"]["json_pointer"],
            manifest["discussion_comments"][0]["body_locator"]["json_pointer"],
        ],
    }

    details_exit, details_output = _invoke_json(
        cli_group,
        ["read-feedback-details"],
        FakePRGateway(),
        input=json.dumps(request),
    )

    assert details_exit == 0
    details_json = json.dumps(details_output)
    assert review_body not in details_json
    assert thread_body not in details_json
    assert discussion_body not in details_json
    data = details_output["data"]
    assert data["payload_path"] == payload_path
    assert data["selected_payload_reference"]["role"] == "summary"
    assert (
        data["selected_payload_reference"]["descriptor"] == "pr-address-selected-feedback-details"
    )
    assert data["counts"] == {
        "requested": 3,
        "selected": 3,
        "body_values": 3,
        "item_values": 0,
    }
    assert data["details"] == [
        {
            "json_pointer": request["json_pointers"][0],
            "detail_kind": "review_body",
            "artifact_json_pointer": "/details/0/value",
            "value_kind": "string",
            "value_chars": len(review_body),
            "body_chars": len(review_body),
            "object_keys": None,
        },
        {
            "json_pointer": request["json_pointers"][1],
            "detail_kind": "thread_comment_body",
            "artifact_json_pointer": "/details/1/value",
            "value_kind": "string",
            "value_chars": len(thread_body),
            "body_chars": len(thread_body),
            "object_keys": None,
        },
        {
            "json_pointer": request["json_pointers"][2],
            "detail_kind": "discussion_comment_body",
            "artifact_json_pointer": "/details/2/value",
            "value_kind": "string",
            "value_chars": len(discussion_body),
            "body_chars": len(discussion_body),
            "object_keys": None,
        },
    ]
    artifact = json.loads(
        Path(data["selected_payload_reference"]["payload_path"]).read_text(encoding="utf-8")
    )
    assert artifact == {
        "source_payload_path": payload_path,
        "details": [
            {
                "json_pointer": request["json_pointers"][0],
                "detail_kind": "review_body",
                "value": review_body,
            },
            {
                "json_pointer": request["json_pointers"][1],
                "detail_kind": "thread_comment_body",
                "value": thread_body,
            },
            {
                "json_pointer": request["json_pointers"][2],
                "detail_kind": "discussion_comment_body",
                "value": discussion_body,
            },
        ],
    }


def test_read_feedback_details_accepts_selection_json_option(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    review_body = "READ_DETAILS_SELECTION_JSON_SENTINEL"
    fake = FakePRGateway(
        reviews={
            42: [
                PRReview(
                    id="PRR_1",
                    author="reviewer",
                    body=review_body,
                    state="COMMENTED",
                    submitted_at="2025-01-01T00:00:00Z",
                )
            ]
        }
    )

    get_exit, get_output = _invoke_json(
        cli_group,
        ["get-feedback", "42"],
        fake,
        env=_payload_env(tmp_path),
    )
    assert get_exit == 0
    manifest = get_output["data"]
    payload_path = manifest["payload_reference"]["payload_path"]
    request_json = json.dumps(
        {
            "payload_path": payload_path,
            "json_pointers": [manifest["reviews"][0]["body_locator"]["json_pointer"]],
        }
    )

    details_exit, details_output = _invoke_json(
        cli_group,
        ["read-feedback-details", "--selection-json", request_json],
        FakePRGateway(),
    )

    assert details_exit == 0
    assert review_body not in json.dumps(details_output)
    data = details_output["data"]
    artifact = json.loads(
        Path(data["selected_payload_reference"]["payload_path"]).read_text(encoding="utf-8")
    )
    assert artifact["details"][0]["value"] == review_body


def test_read_feedback_details_reads_item_pointers_without_inline_item_bodies(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    thread_body = "READ_DETAILS_THREAD_COMMENT_ITEM_SENTINEL add focused tests"
    fake = FakePRGateway(review_threads={42: [_summary_thread("PRRT_1", body=thread_body)]})

    get_exit, get_output = _invoke_json(
        cli_group,
        ["get-feedback", "42"],
        fake,
        env=_payload_env(tmp_path),
    )
    assert get_exit == 0
    manifest = get_output["data"]
    payload_path = manifest["payload_reference"]["payload_path"]
    item_pointer = manifest["review_threads"][0]["comments"][0]["body_locator"]["item_pointer"]
    request = {"payload_path": payload_path, "json_pointers": [item_pointer]}

    details_exit, details_output = _invoke_json(
        cli_group,
        ["read-feedback-details"],
        FakePRGateway(),
        input=json.dumps(request),
    )

    assert details_exit == 0
    assert thread_body not in json.dumps(details_output)
    data = details_output["data"]
    assert data["counts"] == {
        "requested": 1,
        "selected": 1,
        "body_values": 0,
        "item_values": 1,
    }
    detail = data["details"][0]
    assert detail["json_pointer"] == item_pointer
    assert detail["detail_kind"] == "thread_comment"
    assert detail["artifact_json_pointer"] == "/details/0/value"
    assert detail["value_kind"] == "object"
    assert detail["value_chars"] is None
    assert detail["body_chars"] == len(thread_body)
    assert "body" in detail["object_keys"]
    artifact = json.loads(
        Path(data["selected_payload_reference"]["payload_path"]).read_text(encoding="utf-8")
    )
    assert artifact["details"][0]["value"]["body"] == thread_body


def test_read_feedback_details_rejects_empty_selection(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    fake = FakePRGateway(review_threads={42: [_summary_thread("PRRT_1")]})
    get_exit, get_output = _invoke_json(
        cli_group,
        ["get-feedback", "42"],
        fake,
        env=_payload_env(tmp_path),
    )
    assert get_exit == 0
    request = {
        "payload_path": get_output["data"]["payload_reference"]["payload_path"],
        "json_pointers": [],
    }

    details_exit, details_output = _invoke_json(
        cli_group,
        ["read-feedback-details"],
        FakePRGateway(),
        input=json.dumps(request),
    )

    assert details_exit == 2
    assert details_output["exit_code"] == 2
    assert details_output["error_type"] == "invalid_request"


def test_read_feedback_details_rejects_duplicate_pointers(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    fake = FakePRGateway(review_threads={42: [_summary_thread("PRRT_1")]})
    get_exit, get_output = _invoke_json(
        cli_group,
        ["get-feedback", "42"],
        fake,
        env=_payload_env(tmp_path),
    )
    assert get_exit == 0
    payload_path = get_output["data"]["payload_reference"]["payload_path"]
    pointer = get_output["data"]["review_threads"][0]["comments"][0]["body_locator"]["json_pointer"]
    request = {"payload_path": payload_path, "json_pointers": [pointer, pointer]}

    details_exit, details_output = _invoke_json(
        cli_group,
        ["read-feedback-details"],
        FakePRGateway(),
        input=json.dumps(request),
    )

    assert details_exit == 2
    assert details_output["exit_code"] == 2
    assert details_output["error_type"] == "invalid_request"


def test_read_feedback_details_rejects_broad_pointer_without_writing_artifact(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    fake = FakePRGateway(review_threads={42: [_summary_thread("PRRT_1")]})
    get_exit, get_output = _invoke_json(
        cli_group,
        ["get-feedback", "42"],
        fake,
        env=_payload_env(tmp_path),
    )
    assert get_exit == 0
    payload_path = get_output["data"]["payload_reference"]["payload_path"]
    payload_dir = Path(payload_path).parent
    summaries_before = tuple(payload_dir.glob("*.summary.json"))
    request = {"payload_path": payload_path, "json_pointers": ["/data"]}

    details_exit, details_output = _invoke_json(
        cli_group,
        ["read-feedback-details"],
        FakePRGateway(),
        input=json.dumps(request),
    )

    assert details_exit == 2
    assert details_output["exit_code"] == 2
    assert details_output["error_type"] == "invalid_request"
    assert tuple(payload_dir.glob("*.summary.json")) == summaries_before


def test_read_feedback_detail_rejects_body_type_mismatch(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    payload_dir = tmp_path / "payload-root" / "sessions" / "session1" / "payloads"
    payload_dir.mkdir(parents=True)
    raw_path = payload_dir / "20260603t123456z-0001-probe.raw.json"
    raw_path.write_text(
        json.dumps({"exit_code": 0, "data": {"reviews": [{"body": {"not": "string"}}]}}),
        encoding="utf-8",
    )

    detail_exit, detail_output = _invoke_json(
        cli_group,
        [
            "read-feedback-detail",
            "--payload-path",
            str(raw_path),
            "--json-pointer",
            "/data/reviews/0/body",
        ],
        FakePRGateway(),
    )

    assert detail_exit == 2
    assert detail_output["exit_code"] == 2
    assert detail_output["error_type"] == "payload_lookup_failed"


def test_get_feedback_default_payload_requires_payload_session(
    cli_group: ClinkrGroup,
) -> None:
    fake = FakePRGateway()
    exit_code, output = _invoke_json(
        cli_group,
        ["get-feedback", "42"],
        fake,
        env={"ASDL_PAYLOAD_SESSION_ID": None},
    )

    assert exit_code == 2
    assert output["exit_code"] == 2
    assert output["error_type"] == "payload_session_required"
    assert "data" not in output


def test_get_feedback_default_payload_rejects_invalid_payload_session(
    cli_group: ClinkrGroup,
) -> None:
    fake = FakePRGateway()
    exit_code, output = _invoke_json(
        cli_group,
        ["get-feedback", "42", "--payload-session-id", "BadSession"],
        fake,
    )

    assert exit_code == 2
    assert output["exit_code"] == 2
    assert output["error_type"] == "payload_session_invalid"
    assert "data" not in output


# -- summarize-feedback --


def test_summarize_feedback_returns_compact_summary(cli_group: ClinkrGroup) -> None:
    long_body = "Please update this helper before merging. " * 3
    reviews = [
        PRReview(
            id="PRR_1",
            author="reviewer",
            body="Please update the helper.\n\nDetails follow here.",
            state="CHANGES_REQUESTED",
            submitted_at="2026-05-23T00:00:00Z",
        )
    ]
    comments = [
        PRDiscussionComment(
            id=101,
            body="Human discussion comment with several words.",
            author="schrockn",
            url="https://example.com/comment/101",
        ),
        PRDiscussionComment(
            id=102,
            body="Stack metadata: https://app.graphite.com/github/pr/dagster-io/asdl/42",
            author="Graphite Automations",
            url="https://example.com/comment/102",
        ),
    ]
    fake = FakePRGateway(
        prs=[_summary_pr(42)],
        reviews={42: reviews},
        review_threads={
            42: [
                _summary_thread("PRRT_open", body=long_body),
                _summary_thread("PRRT_resolved", is_resolved=True, comment_id=2),
            ]
        },
        discussion_comments={42: comments},
    )

    exit_code, output = _invoke_json(
        cli_group,
        ["summarize-feedback", "42", "--body-chars", "40"],
        fake,
    )

    assert exit_code == 0
    assert output["exit_code"] == 0
    data = output["data"]
    assert data["found"] is True
    assert data["pr"] == {
        "number": 42,
        "title": "Add compact feedback",
        "url": "https://github.com/dagster-io/asdl/pull/42",
        "head_ref_name": "feature",
        "base_ref_name": "master",
        "state": "OPEN",
    }
    assert data["counts"] == {
        "reviews": 1,
        "review_threads": 2,
        "unresolved_review_threads": 1,
        "resolved_review_threads": 1,
        "discussion_comments": 2,
    }
    assert data["reviews"][0]["body_first_line_excerpt"] == "Please update the helper."
    assert data["review_threads"] == [
        {
            "thread_id": "PRRT_open",
            "path": "src/app.py",
            "line": 10,
            "start_line": 8,
            "is_outdated": False,
            "is_resolved": False,
            "comment_count": 1,
            "first_comment": {
                "id": 1,
                "author": "reviewer",
                "line": 10,
                "start_line": 8,
                "created_at": "2026-05-23T00:00:00Z",
                "body_first_line_excerpt": long_body.strip(),
                "body_excerpt": "Please update this helper before mergin…",
            },
        }
    ]
    assert data["discussion_comments"][0]["source_kind"] == "human_like"
    assert data["discussion_comments"][0]["source_evidence"] == []
    assert data["discussion_comments"][1]["source_kind"] == "automation_like"
    assert data["discussion_comments"][1]["source_evidence"] == ["graphite_link"]


def test_summarize_feedback_include_resolved_threads(cli_group: ClinkrGroup) -> None:
    fake = FakePRGateway(
        prs=[_summary_pr(42)],
        review_threads={
            42: [
                _summary_thread("PRRT_open"),
                _summary_thread("PRRT_resolved", is_resolved=True, comment_id=2),
            ]
        },
    )

    exit_code, output = _invoke_json(
        cli_group,
        ["summarize-feedback", "42", "--include-resolved"],
        fake,
    )

    assert exit_code == 0
    assert [thread["thread_id"] for thread in output["data"]["review_threads"]] == [
        "PRRT_open",
        "PRRT_resolved",
    ]
    assert output["data"]["review_threads"][1]["is_resolved"] is True


def test_summarize_feedback_filters_empty_reviews_by_default(cli_group: ClinkrGroup) -> None:
    reviews = [
        PRReview(
            id="PRR_noise_commented",
            author="reviewer",
            body="",
            state="COMMENTED",
            submitted_at="2026-05-23T00:00:00Z",
        ),
        PRReview(
            id="PRR_noise_approved",
            author="reviewer",
            body="   ",
            state="APPROVED",
            submitted_at="2026-05-23T00:00:00Z",
        ),
        PRReview(
            id="PRR_signal_state",
            author="reviewer",
            body="",
            state="CHANGES_REQUESTED",
            submitted_at="2026-05-23T00:00:00Z",
        ),
    ]

    fake_default = FakePRGateway(prs=[_summary_pr(42)], reviews={42: reviews})
    default_exit, default_output = _invoke_json(
        cli_group, ["summarize-feedback", "42"], fake_default
    )
    assert default_exit == 0
    assert [review["id"] for review in default_output["data"]["reviews"]] == ["PRR_signal_state"]
    assert default_output["data"]["counts"]["reviews"] == 1

    fake_all = FakePRGateway(prs=[_summary_pr(42)], reviews={42: reviews})
    all_exit, all_output = _invoke_json(
        cli_group, ["summarize-feedback", "42", "--include-empty-reviews"], fake_all
    )
    assert all_exit == 0
    assert [review["id"] for review in all_output["data"]["reviews"]] == [
        "PRR_noise_commented",
        "PRR_noise_approved",
        "PRR_signal_state",
    ]
    assert all_output["data"]["counts"]["reviews"] == 3


class FailingGetPrGateway(FakePRGateway):
    def get_pr(self, pr_number: int) -> PRSummary | PRLookupMiss | PRGatewayFailure:
        return PRGatewayFailure(stderr="gh auth failed", returncode=4)


def test_summarize_feedback_missing_pr_returns_negative_envelope(
    cli_group: ClinkrGroup,
) -> None:
    fake = FakePRGateway()

    exit_code, output = _invoke_json(cli_group, ["summarize-feedback", "404"], fake)

    assert exit_code == 1
    assert output["exit_code"] == 1
    assert "No PR found" in output["message"]
    assert output["data"] == {
        "found": False,
        "pr_number": 404,
        "error": "no PR found for PR 404",
        "returncode": 1,
    }


def test_summarize_feedback_lookup_failure_returns_failure_envelope(
    cli_group: ClinkrGroup,
) -> None:
    fake = FailingGetPrGateway()

    exit_code, output = _invoke_json(cli_group, ["summarize-feedback", "42"], fake)

    assert exit_code == 2
    assert output["exit_code"] == 2
    assert output["error_type"] == "pr_gateway_failure"
    assert "PR 42" in output["message"]
    assert "gh auth failed" in output["message"]


@pytest.mark.parametrize(
    ("author", "body", "expected_evidence"),
    [
        ("github-actions[bot]", "Ordinary bot comment", ["bot_author"]),
        ("reviewer", "<!-- roaster: finding -->", ["roaster_marker"]),
        ("reviewer", "<!-- asdl-reviewer: finding -->", ["asdl_reviewer_marker"]),
        ("reviewer", "[vc]: deployment ready", ["vercel_marker"]),
        ("reviewer", "asset https://static.graphite.dev/check.svg", ["graphite_static_asset"]),
        ("reviewer", "Human feedback", []),
    ],
)
def test_summarize_feedback_discussion_source_evidence_is_mechanical(
    cli_group: ClinkrGroup,
    author: str,
    body: str,
    expected_evidence: list[str],
) -> None:
    fake = FakePRGateway(
        prs=[_summary_pr(42)],
        discussion_comments={
            42: [
                PRDiscussionComment(
                    id=101,
                    body=body,
                    author=author,
                    url="https://example.com/comment/101",
                )
            ]
        },
    )

    exit_code, output = _invoke_json(cli_group, ["summarize-feedback", "42"], fake)

    assert exit_code == 0
    comment = output["data"]["discussion_comments"][0]
    assert comment["source_evidence"] == expected_evidence
    expected_kind = "automation_like" if expected_evidence else "human_like"
    assert comment["source_kind"] == expected_kind


@pytest.mark.parametrize("body_chars", ["0", "-1", "4001"])
def test_summarize_feedback_rejects_invalid_body_chars(
    cli_group: ClinkrGroup,
    body_chars: str,
) -> None:
    fake = FakePRGateway(prs=[_summary_pr(42)])

    exit_code, output = _invoke_json(
        cli_group,
        ["summarize-feedback", "42", "--body-chars", body_chars],
        fake,
    )

    assert exit_code == 2
    assert output["exit_code"] == 2
    assert output["error_type"] == "invalid_request"
    assert "body_chars" in output["message"]


# -- Flag coverage --


def test_get_feedback_include_resolved(cli_group: ClinkrGroup) -> None:
    threads = [
        PRReviewThread(
            id="PRRT_1",
            path="a.py",
            line=1,
            is_resolved=False,
            is_outdated=False,
            comments=(
                PRReviewComment(
                    id=1,
                    body="x",
                    author="a",
                    path="a.py",
                    line=1,
                    created_at="2025-01-01T00:00:00Z",
                ),
            ),
        ),
        PRReviewThread(
            id="PRRT_2",
            path="b.py",
            line=2,
            is_resolved=True,
            is_outdated=False,
            comments=(
                PRReviewComment(
                    id=2,
                    body="y",
                    author="b",
                    path="b.py",
                    line=2,
                    created_at="2025-01-01T00:00:00Z",
                ),
            ),
        ),
    ]

    fake_default = FakePRGateway(review_threads={42: threads})
    exit_default, output_default = _invoke(
        cli_group,
        ["exec", "get-feedback", "42", "--payload-mode", "inline"],
        fake_default,
    )
    assert exit_default == 0
    assert [t["id"] for t in output_default["review_threads"]] == ["PRRT_1"]

    fake_all = FakePRGateway(review_threads={42: threads})
    exit_all, output_all = _invoke(
        cli_group,
        [
            "exec",
            "get-feedback",
            "42",
            "--include-resolved",
            "--payload-mode",
            "inline",
        ],
        fake_all,
    )
    assert exit_all == 0
    assert {t["id"] for t in output_all["review_threads"]} == {"PRRT_1", "PRRT_2"}


def test_get_feedback_filters_empty_reviews_by_default(cli_group: ClinkrGroup) -> None:
    reviews = [
        PRReview(
            id="PRR_noise_commented",
            author="reviewer",
            body="",
            state="COMMENTED",
            submitted_at="2025-01-01T00:00:00Z",
        ),
        PRReview(
            id="PRR_noise_approved",
            author="reviewer",
            body="   \n",
            state="APPROVED",
            submitted_at="2025-01-01T00:00:00Z",
        ),
        PRReview(
            id="PRR_signal_commented",
            author="reviewer",
            body="Please take a look at X.",
            state="COMMENTED",
            submitted_at="2025-01-01T00:00:00Z",
        ),
        PRReview(
            id="PRR_signal_state",
            author="reviewer",
            body="",
            state="CHANGES_REQUESTED",
            submitted_at="2025-01-01T00:00:00Z",
        ),
    ]
    fake_default = FakePRGateway(reviews={42: reviews})
    exit_default, output_default = _invoke(
        cli_group,
        ["exec", "get-feedback", "42", "--payload-mode", "inline"],
        fake_default,
    )
    assert exit_default == 0
    assert [r["id"] for r in output_default["reviews"]] == [
        "PRR_signal_commented",
        "PRR_signal_state",
    ]

    fake_all = FakePRGateway(reviews={42: reviews})
    exit_all, output_all = _invoke(
        cli_group,
        [
            "exec",
            "get-feedback",
            "42",
            "--include-empty-reviews",
            "--payload-mode",
            "inline",
        ],
        fake_all,
    )
    assert exit_all == 0
    assert [r["id"] for r in output_all["reviews"]] == [
        "PRR_noise_commented",
        "PRR_noise_approved",
        "PRR_signal_commented",
        "PRR_signal_state",
    ]


# -- --format json failure envelope --


def test_reply_to_review_format_json_reports_failure(cli_group: ClinkrGroup) -> None:
    fake = FakePRGateway()
    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "reply-to-review",
            "42",
            "reviewer",
            "   ",
            "--format",
            "json",
        ],
        obj=_obj(_ctx(fake)),
    )
    payload = json.loads(result.stdout)

    assert result.exit_code == 2
    assert payload["exit_code"] == 2
    assert payload["error_type"] == "invalid_request"
    assert "summary_markdown" in payload["message"]
