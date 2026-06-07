"""Scenario tests for ``pr-address exec finalize-run``."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from click.testing import CliRunner

from asdl_core.clinkr.context import build_clinkr_context_object
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.gh.pr_testing import FakePRGateway
from asdl_core.gh.types import PRReviewComment, PRReviewThread
from asdl_core.git.testing import FakeGitGateway
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
    *,
    fake: FakePRGateway | None = None,
    input_text: str | None = None,
    env: dict[str, str | None] | None = None,
) -> tuple[int, dict, str]:
    runner = CliRunner()
    ctx = PrAddressCliContext(
        pr_gateway=fake or FakePRGateway(),
        git_gateway=FakeGitGateway(),
    )
    op_name, *rest = args
    result = runner.invoke(
        cli_group,
        ["exec", op_name, "--format", "json", *rest],
        obj=_obj(ctx),
        input=input_text,
        env=env,
    )
    output = json.loads(result.output) if result.output.strip() else {}
    return result.exit_code, output, result.output


def _payload_env(tmp_path: Path, *, session_id: str = "session1") -> dict[str, str]:
    return {
        "ASDL_PAYLOAD_ROOT": str(tmp_path / "payload-root"),
        "ASDL_PAYLOAD_SESSION_ID": session_id,
    }


def _payload_reference() -> dict:
    return {
        "payload_path": "/tmp/pr-address-feedback.raw.json",
        "session_id": "session1",
        "descriptor": "pr-address-get-feedback-pr-42",
        "role": "raw",
        "created_at_utc": "2026-06-07T00:00:00Z",
        "sequence": 1,
        "payload_bytes": 2,
        "content_type": "application/json",
        "extension": "json",
    }


def _feedback(*, threads: list[dict] | None = None, pr_number: int = 42) -> dict:
    review_threads = threads or []
    unresolved = sum(1 for thread in review_threads if not thread["is_resolved"])
    return {
        "payload_mode": "payload",
        "payload_reference": _payload_reference(),
        "pr_number": pr_number,
        "counts": {
            "reviews": 0,
            "review_threads": len(review_threads),
            "unresolved_review_threads": unresolved,
            "resolved_review_threads": len(review_threads) - unresolved,
            "thread_comments": sum(thread["comment_count"] for thread in review_threads),
            "discussion_comments": 0,
        },
        "reviews": [],
        "review_threads": review_threads,
        "discussion_comments": [],
    }


def _thread(thread_id: str, *, is_resolved: bool = False) -> dict:
    return {
        "thread_id": thread_id,
        "path": "src/app.py",
        "line": 10,
        "start_line": 8,
        "is_resolved": is_resolved,
        "is_outdated": False,
        "comment_count": 1,
        "item_pointer": "/data/review_threads/0",
        "comments": [],
    }


def _checkpoint(**overrides: object) -> dict:
    return {
        "valid": True,
        "batch_complete": True,
        "batch_id": "single_file",
        "pr_number": 42,
        **overrides,
    }


def _finalization_payload(*, feedback: dict, checkpoints: list[dict] | None = None) -> str:
    return json.dumps({"feedback": feedback, "checkpoints": checkpoints or []})


def test_finalize_run_reports_ready_after_resolved_checkpoint(cli_group: ClinkrGroup) -> None:
    payload = _finalization_payload(
        feedback=_feedback(threads=[_thread("PRRT_done", is_resolved=True)]),
        checkpoints=[
            _checkpoint(
                thread_summary={
                    "review_thread_count": 1,
                    "resolved_thread_ids": ["PRRT_done"],
                    "all_succeeded": True,
                }
            )
        ],
    )

    exit_code, output, _raw_output = _invoke_json(
        cli_group,
        ["finalize-run"],
        input_text=payload,
    )

    assert exit_code == 0
    data = output["data"]
    assert data["ready_to_stop"] is True
    assert data["counts"]["unresolved_threads"] == 0
    assert data["checkpoint_summaries"][0]["resolved_thread_ids"] == ["PRRT_done"]


def test_finalize_run_returns_negative_for_unresolved_unskipped_thread(
    cli_group: ClinkrGroup,
) -> None:
    payload = _finalization_payload(
        feedback=_feedback(threads=[_thread("PRRT_open")]),
        checkpoints=[_checkpoint()],
    )

    exit_code, output, _raw_output = _invoke_json(
        cli_group,
        ["finalize-run"],
        input_text=payload,
    )

    assert exit_code == 1
    data = output["data"]
    assert data["ready_to_stop"] is False
    assert data["unresolved_unskipped_threads"][0]["thread_id"] == "PRRT_open"


def test_finalize_run_allows_explicitly_skipped_unresolved_thread_but_reports_it(
    cli_group: ClinkrGroup,
) -> None:
    payload = _finalization_payload(
        feedback=_feedback(threads=[_thread("PRRT_deferred")]),
        checkpoints=[
            _checkpoint(
                thread_summary={
                    "review_thread_count": 1,
                    "skipped_thread_ids": ["PRRT_deferred"],
                    "skipped_threads": [
                        {
                            "thread_id": "PRRT_deferred",
                            "skip_reason": "Deferred by user.",
                            "summary": "Needs follow-up.",
                        }
                    ],
                }
            )
        ],
    )

    exit_code, output, _raw_output = _invoke_json(
        cli_group,
        ["finalize-run"],
        input_text=payload,
    )

    assert exit_code == 0
    data = output["data"]
    assert data["ready_to_stop"] is True
    assert data["all_feedback_addressed"] is False
    assert data["unresolved_threads"][0]["thread_id"] == "PRRT_deferred"
    assert data["unresolved_unskipped_threads"] == []
    assert data["skipped_items"][0]["thread_id"] == "PRRT_deferred"


def test_finalize_run_returns_negative_for_failed_checkpoint_evidence(
    cli_group: ClinkrGroup,
) -> None:
    payload = _finalization_payload(
        feedback=_feedback(),
        checkpoints=[
            _checkpoint(
                batch_complete=False,
                thread_summary={
                    "review_thread_count": 1,
                    "failed_thread_ids": ["PRRT_fail"],
                    "all_succeeded": False,
                },
                validation_commands=[
                    {
                        "command": "uv run pytest packages/asdl-pr-address/tests/scenario -q",
                        "status": "failed",
                        "exit_code": 1,
                        "summary": "scenario tests failed",
                    }
                ],
            )
        ],
    )

    exit_code, output, _raw_output = _invoke_json(
        cli_group,
        ["finalize-run"],
        input_text=payload,
    )

    assert exit_code == 1
    data = output["data"]
    assert data["ready_to_stop"] is False
    assert data["checkpoint_summaries"][0]["failed_thread_ids"] == ["PRRT_fail"]
    assert data["checkpoint_summaries"][0]["failed_validation_commands"][0]["status"] == "failed"


def test_finalize_run_rejects_pr_number_mismatch(cli_group: ClinkrGroup) -> None:
    payload = _finalization_payload(
        feedback=_feedback(pr_number=42),
        checkpoints=[_checkpoint(pr_number=43)],
    )

    exit_code, output, _raw_output = _invoke_json(
        cli_group,
        ["finalize-run"],
        input_text=payload,
    )

    assert exit_code == 1
    data = output["data"]
    assert data["valid"] is False
    assert data["errors"][0]["code"] == "pr_number_mismatch"


def test_finalize_run_rejects_payload_json_and_payload_file(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    payload = _finalization_payload(feedback=_feedback())
    payload_path = tmp_path / "finalization.json"
    payload_path.write_text(payload, encoding="utf-8")

    exit_code, output, _raw_output = _invoke_json(
        cli_group,
        [
            "finalize-run",
            "--payload-json",
            payload,
            "--payload-file",
            str(payload_path),
        ],
    )

    assert exit_code == 2
    assert output["exit_code"] == 2
    assert output["error_type"] == "invalid_request"
    assert "do not pass both --payload-json and --payload-file" in output["message"]


def test_finalize_run_keeps_raw_bodies_out_of_output(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    sentinel = "FINALIZATION_RAW_BODY_SENTINEL"
    fake = FakePRGateway(
        review_threads={
            42: [
                PRReviewThread(
                    id="PRRT_1",
                    path="src/app.py",
                    line=10,
                    start_line=8,
                    is_resolved=False,
                    is_outdated=False,
                    comments=(
                        PRReviewComment(
                            id=7,
                            body=sentinel,
                            author="reviewer",
                            path="src/app.py",
                            line=10,
                            start_line=8,
                            created_at="2026-06-07T00:00:00Z",
                        ),
                    ),
                )
            ]
        }
    )
    get_exit_code, get_output, get_raw_output = _invoke_json(
        cli_group,
        ["get-feedback", "42"],
        fake=fake,
        env=_payload_env(tmp_path),
    )
    assert get_exit_code == 0, get_raw_output
    assert sentinel not in get_raw_output

    payload = _finalization_payload(feedback=get_output["data"])

    exit_code, output, raw_output = _invoke_json(
        cli_group,
        ["finalize-run"],
        input_text=payload,
    )

    assert exit_code == 1
    assert output["data"]["unresolved_threads"][0]["thread_id"] == "PRRT_1"
    assert sentinel not in raw_output


def test_finalize_run_reports_skipped_review_and_discussion_items(
    cli_group: ClinkrGroup,
) -> None:
    payload = _finalization_payload(
        feedback=_feedback(),
        checkpoints=[
            _checkpoint(
                non_thread_outcomes=[
                    {
                        "source_kind": "review",
                        "review_id": "PRR_1",
                        "action": "skipped",
                        "skip_reason": "Reviewer asked to defer.",
                        "summary": "Deferred PR-level review.",
                    },
                    {
                        "source_kind": "discussion_comment",
                        "discussion_comment_id": 9001,
                        "action": "skipped",
                        "skip_reason": "Needs product follow-up.",
                        "summary": "Deferred discussion comment.",
                    },
                ]
            )
        ],
    )

    exit_code, output, _raw_output = _invoke_json(
        cli_group,
        ["finalize-run"],
        input_text=payload,
    )

    assert exit_code == 0
    data = output["data"]
    assert data["ready_to_stop"] is True
    assert data["all_feedback_addressed"] is False
    assert [item["source_kind"] for item in data["skipped_items"]] == [
        "review",
        "discussion_comment",
    ]
    assert data["counts"]["skipped_non_thread_items"] == 2
