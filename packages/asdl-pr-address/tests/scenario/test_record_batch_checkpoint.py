"""Scenario tests for ``pr-address exec record-batch-checkpoint``."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from click.testing import CliRunner

from asdl_core.clinkr.context import build_clinkr_context_object
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.gh.pr_testing import FakePRGateway
from asdl_core.git.testing import FakeGitGateway
from asdl_core.payloads.store import PayloadStore
from asdl_pr_address.cli.main import build_cli
from asdl_pr_address.cli.pr_address.context import PrAddressCliContext


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def _obj(context: object) -> object:
    return build_clinkr_context_object(lambda: context)


def _invoke_json(
    cli_group: ClinkrGroup,
    args: list[str],
    fake: FakePRGateway,
    *,
    input_text: str | None = None,
) -> tuple[int, dict]:
    runner = CliRunner()
    ctx = PrAddressCliContext(
        pr_gateway=fake,
        git_gateway=FakeGitGateway(),
    )
    op_name, *rest = args
    result = runner.invoke(
        cli_group,
        ["exec", op_name, "--format", "json", *rest],
        obj=_obj(ctx),
        input=input_text,
    )
    output = json.loads(result.output) if result.output.strip() else {}
    return result.exit_code, output


def _minimal_feedback_plan(
    *,
    batches: list[dict],
    payload_path: str | None = None,
) -> dict:
    return {
        "valid": True,
        "manifest_kind": "get_feedback",
        "pr_number": 42,
        "payload_path": payload_path,
        "validation": {
            "valid": True,
            "manifest_kind": "get_feedback",
            "pr_number": 42,
            "payload_path": payload_path,
            "counts": {
                "reviews_expected": 0,
                "reviews_classified": 0,
                "review_threads_expected": 0,
                "review_threads_classified": 0,
                "thread_comments_expected": 0,
                "thread_comments_covered": 0,
                "discussion_comments_expected": 0,
                "discussion_comments_classified": 0,
            },
            "errors": [],
        },
        "counts": {
            "actionable_items": sum(len(batch["items"]) for batch in batches),
            "informational_items": 0,
            "batches": len(batches),
            "approval_required_batches": 0,
            "actionable_reviews": 0,
            "actionable_review_threads": 0,
            "actionable_discussion_comments": 0,
            "informational_reviews": 0,
            "informational_review_threads": 0,
            "informational_discussion_comments": 0,
        },
        "batches": batches,
        "informational": [],
        "warnings": [],
    }


def _plan_batch(batch_id: str, items: list[dict]) -> dict:
    return {
        "batch_id": batch_id,
        "complexity": "single_file",
        "approval_required": False,
        "items": items,
    }


def _thread_plan_item(thread_id: str) -> dict:
    return {
        "source_kind": "review_thread",
        "summary": f"Thread {thread_id} requires action.",
        "action_summary": f"Address thread {thread_id}.",
        "complexity": "single_file",
        "thread_id": thread_id,
    }


def _review_plan_item(review_id: str) -> dict:
    return {
        "source_kind": "review",
        "summary": f"Review {review_id} requires action.",
        "action_summary": f"Address review {review_id}.",
        "complexity": "single_file",
        "review_id": review_id,
    }


def _discussion_plan_item(comment_id: int) -> dict:
    return {
        "source_kind": "discussion_comment",
        "summary": f"Discussion comment {comment_id} requires action.",
        "action_summary": f"Address discussion comment {comment_id}.",
        "complexity": "single_file",
        "discussion_comment_id": comment_id,
    }


def _thread_payload_build_result(
    *,
    batch_id: str = "single_file",
    resolved_thread_ids: list[str] | None = None,
    skipped_thread_ids: list[str] | None = None,
    ignored_reviews: list[str] | None = None,
) -> dict:
    resolved = resolved_thread_ids or []
    skipped = skipped_thread_ids or []
    return {
        "valid": True,
        "payload_ready": bool(resolved),
        "batch_id": batch_id,
        "commit_sha": "abc1234",
        "continue_on_error": False,
        "review_thread_count": len(resolved) + len(skipped),
        "resolved_thread_count": len(resolved),
        "skipped_thread_count": len(skipped),
        "ignored_non_thread_items": [
            {
                "source_kind": "review",
                "review_id": review_id,
                "discussion_comment_id": None,
                "summary": f"Review {review_id} requires action.",
            }
            for review_id in (ignored_reviews or [])
        ],
        "skipped_items": [
            {
                "thread_id": thread_id,
                "skip_reason": "User deferred this thread.",
                "summary": f"Thread {thread_id} requires action.",
            }
            for thread_id in skipped
        ],
        "payload": {
            "commit_sha": "abc1234",
            "continue_on_error": False,
            "items": [
                {
                    "thread_id": thread_id,
                    "mode": "fixed",
                    "message": "Fixed the requested behavior.",
                    "commit_sha": None,
                }
                for thread_id in resolved
            ],
        }
        if resolved
        else None,
        "errors": [],
        "warnings": [],
    }


def _thread_resolution_result(
    *,
    resolved_thread_ids: list[str] | None = None,
    failed_thread_ids: list[str] | None = None,
) -> dict:
    resolved = resolved_thread_ids or []
    failed = failed_thread_ids or []
    results = [
        {
            "index": index,
            "thread_id": thread_id,
            "mode": "fixed",
            "status": "resolved",
            "body": "Fixed in commit abc1234: Fixed the requested behavior.",
            "comment": None,
            "is_resolved": True,
            "error_type": None,
            "error_message": None,
        }
        for index, thread_id in enumerate(resolved)
    ]
    results.extend(
        {
            "index": len(resolved) + index,
            "thread_id": thread_id,
            "mode": "fixed",
            "status": "failed",
            "body": None,
            "comment": None,
            "is_resolved": None,
            "error_type": "gateway_error",
            "error_message": "GitHub rejected the reply.",
        }
        for index, thread_id in enumerate(failed)
    )
    return {
        "total": len(results),
        "resolved": len(resolved),
        "failed": len(failed),
        "skipped": 0,
        "all_succeeded": not failed,
        "results": results,
    }


def _write_raw_payload_artifact(tmp_path: Path, *, sentinel: str = "RAW_BODY_SENTINEL") -> str:
    store = PayloadStore.open(root=tmp_path / "payload-root", session_id="session1")
    reference = store.write_json_artifact(
        descriptor="pr-address-feedback",
        role="raw",
        payload={"exit_code": 0, "data": {"body": sentinel}},
    )
    return reference.payload_path


def test_record_batch_checkpoint_writes_summary_artifact_for_complete_batch(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    fake = FakePRGateway()
    sentinel = "RAW_BODY_SENTINEL_SHOULD_NOT_LEAK"
    payload_path = _write_raw_payload_artifact(tmp_path, sentinel=sentinel)
    plan = _minimal_feedback_plan(
        batches=[
            _plan_batch(
                "single_file",
                [
                    _thread_plan_item("PRRT_resolve"),
                    _thread_plan_item("PRRT_skip"),
                    _review_plan_item("PRR_1"),
                ],
            )
        ],
        payload_path=payload_path,
    )
    request = {
        "plan": plan,
        "batch_id": "single_file",
        "commit_sha": "abc1234",
        "changed_files": ["packages/example/src/example.py"],
        "validation_commands": [
            {
                "command": "uv run pytest packages/asdl-pr-address/tests/scenario -q",
                "status": "passed",
                "exit_code": 0,
                "summary": "targeted scenario tests passed",
            }
        ],
        "thread_payload_build": _thread_payload_build_result(
            resolved_thread_ids=["PRRT_resolve"],
            skipped_thread_ids=["PRRT_skip"],
            ignored_reviews=["PRR_1"],
        ),
        "thread_resolution_result": _thread_resolution_result(
            resolved_thread_ids=["PRRT_resolve"],
        ),
        "non_thread_outcomes": [
            {
                "source_kind": "review",
                "review_id": "PRR_1",
                "action": "replied",
                "result_comment_id": 12345,
                "summary": "Posted canonical review reply.",
            }
        ],
    }

    exit_code, output = _invoke_json(
        cli_group,
        ["record-batch-checkpoint"],
        fake,
        input_text=json.dumps(request),
    )

    assert exit_code == 0
    assert output["exit_code"] == 0
    data = output["data"]
    assert data["valid"] is True
    assert data["batch_complete"] is True
    assert data["checkpoint_reference"]["role"] == "summary"
    assert data["checkpoint_reference"]["descriptor"] == "pr-address-batch-checkpoint"
    assert data["thread_summary"]["resolved_thread_ids"] == ["PRRT_resolve"]
    assert data["thread_summary"]["skipped_thread_ids"] == ["PRRT_skip"]
    assert data["non_thread_outcomes"][0]["result_comment_id"] == 12345

    artifact_path = Path(data["checkpoint_reference"]["payload_path"])
    artifact_text = artifact_path.read_text(encoding="utf-8")
    artifact = json.loads(artifact_text)
    assert artifact["batch_id"] == "single_file"
    assert artifact["changed_files"] == ["packages/example/src/example.py"]
    assert sentinel not in artifact_text


def test_record_batch_checkpoint_accepts_payload_file_option(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    fake = FakePRGateway()
    plan = _minimal_feedback_plan(
        batches=[_plan_batch("single_file", [_review_plan_item("PRR_1")])]
    )
    request = {
        "plan": plan,
        "batch_id": "single_file",
        "non_thread_outcomes": [
            {
                "source_kind": "review",
                "review_id": "PRR_1",
                "action": "no_reply_needed",
                "summary": "Existing response already addresses the review.",
            }
        ],
    }
    payload_path = tmp_path / "checkpoint.json"
    payload_path.write_text(json.dumps(request), encoding="utf-8")

    exit_code, output = _invoke_json(
        cli_group,
        ["record-batch-checkpoint", "--payload-file", str(payload_path)],
        fake,
        input_text=json.dumps({"batch_id": "ignored"}),
    )

    assert exit_code == 0
    assert output["data"]["valid"] is True
    assert output["data"]["batch_complete"] is True
    assert output["data"]["checkpoint_reference"] is None
    assert "payload_path is null" in output["data"]["warnings"][0]


def test_record_batch_checkpoint_rejects_payload_json_and_payload_file(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    fake = FakePRGateway()
    request = {"plan": {}, "batch_id": "single_file"}
    payload_path = tmp_path / "checkpoint.json"
    payload_path.write_text(json.dumps(request), encoding="utf-8")

    exit_code, output = _invoke_json(
        cli_group,
        [
            "record-batch-checkpoint",
            "--payload-json",
            json.dumps(request),
            "--payload-file",
            str(payload_path),
        ],
        fake,
    )

    assert exit_code == 2
    assert output["exit_code"] == 2
    assert output["error_type"] == "invalid_request"
    assert "do not pass both --payload-json and --payload-file" in output["message"]


def test_record_batch_checkpoint_rejects_unknown_batch_without_artifact_write(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    fake = FakePRGateway()
    payload_path = _write_raw_payload_artifact(tmp_path)
    plan = _minimal_feedback_plan(
        batches=[_plan_batch("single_file", [_review_plan_item("PRR_1")])],
        payload_path=payload_path,
    )
    request = {"plan": plan, "batch_id": "local"}

    exit_code, output = _invoke_json(
        cli_group,
        ["record-batch-checkpoint"],
        fake,
        input_text=json.dumps(request),
    )

    assert exit_code == 1
    data = output["data"]
    assert data["valid"] is False
    assert data["batch_complete"] is False
    assert data["checkpoint_reference"] is None
    assert data["errors"][0]["code"] == "unknown_batch"


def test_record_batch_checkpoint_requires_thread_payload_build_for_thread_batch(
    cli_group: ClinkrGroup,
) -> None:
    fake = FakePRGateway()
    plan = _minimal_feedback_plan(
        batches=[_plan_batch("single_file", [_thread_plan_item("PRRT_missing")])]
    )
    request = {"plan": plan, "batch_id": "single_file"}

    exit_code, output = _invoke_json(
        cli_group,
        ["record-batch-checkpoint"],
        fake,
        input_text=json.dumps(request),
    )

    assert exit_code == 1
    data = output["data"]
    assert data["valid"] is False
    assert data["batch_complete"] is False
    assert [error["code"] for error in data["errors"]] == ["missing_thread_payload_build"]


def test_record_batch_checkpoint_reports_failed_thread_resolution(
    cli_group: ClinkrGroup,
) -> None:
    fake = FakePRGateway()
    plan = _minimal_feedback_plan(
        batches=[_plan_batch("single_file", [_thread_plan_item("PRRT_fail")])]
    )
    request = {
        "plan": plan,
        "batch_id": "single_file",
        "thread_payload_build": _thread_payload_build_result(
            resolved_thread_ids=["PRRT_fail"],
        ),
        "thread_resolution_result": _thread_resolution_result(failed_thread_ids=["PRRT_fail"]),
    }

    exit_code, output = _invoke_json(
        cli_group,
        ["record-batch-checkpoint"],
        fake,
        input_text=json.dumps(request),
    )

    assert exit_code == 1
    data = output["data"]
    assert data["valid"] is True
    assert data["batch_complete"] is False
    assert data["thread_summary"]["failed_thread_ids"] == ["PRRT_fail"]
    assert [error["code"] for error in data["errors"]] == ["thread_resolution_failed"]


@pytest.mark.parametrize(
    ("changed_files", "error_code"),
    [
        (["/tmp/escape.py"], "absolute_changed_file"),
        (["../escape.py"], "unsafe_changed_file"),
        (["..\\escape.py"], "unsafe_changed_file"),
        (["foo\\..\\bar.py"], "unsafe_changed_file"),
        (["C:foo\\bar.py"], "unsafe_changed_file"),
        (["foo/../bar.py"], "unsafe_changed_file"),
        ([" "], "empty_changed_file"),
        (["src/example.py", "src/example.py"], "duplicate_changed_file"),
    ],
)
def test_record_batch_checkpoint_rejects_unsafe_or_duplicate_changed_files(
    cli_group: ClinkrGroup,
    changed_files: list[str],
    error_code: str,
) -> None:
    fake = FakePRGateway()
    plan = _minimal_feedback_plan(batches=[_plan_batch("single_file", [])])
    request = {
        "plan": plan,
        "batch_id": "single_file",
        "commit_sha": "abc1234",
        "changed_files": changed_files,
    }

    exit_code, output = _invoke_json(
        cli_group,
        ["record-batch-checkpoint"],
        fake,
        input_text=json.dumps(request),
    )

    assert exit_code == 1
    data = output["data"]
    assert data["valid"] is False
    assert error_code in [error["code"] for error in data["errors"]]


def test_record_batch_checkpoint_requires_non_thread_outcomes(
    cli_group: ClinkrGroup,
) -> None:
    fake = FakePRGateway()
    plan = _minimal_feedback_plan(
        batches=[
            _plan_batch(
                "single_file",
                [_review_plan_item("PRR_1"), _discussion_plan_item(9001)],
            )
        ]
    )
    request = {"plan": plan, "batch_id": "single_file"}

    exit_code, output = _invoke_json(
        cli_group,
        ["record-batch-checkpoint"],
        fake,
        input_text=json.dumps(request),
    )

    assert exit_code == 1
    data = output["data"]
    assert data["valid"] is False
    assert [error["code"] for error in data["errors"]] == [
        "missing_non_thread_outcome",
        "missing_non_thread_outcome",
    ]
