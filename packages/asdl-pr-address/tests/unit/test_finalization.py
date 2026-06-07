"""Unit tests for pr-address final run verification."""

from __future__ import annotations

from asdl_pr_address.cli.pr_address.finalization import finalize_run
from asdl_pr_address.cli.pr_address.finalization_models import FinalizeRunInput


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


def _finalize(payload: dict):
    return finalize_run(FinalizeRunInput.model_validate(payload))


def test_finalize_run_rejects_duplicate_checkpoint_batch_ids() -> None:
    result = _finalize(
        {
            "feedback": _feedback(),
            "checkpoints": [
                _checkpoint(),
                _checkpoint(commit_sha="def5678"),
            ],
        }
    )

    assert result.valid is False
    assert result.ready_to_stop is False
    assert [error.code for error in result.errors] == ["duplicate_checkpoint_batch"]


def test_finalize_run_reports_checkpointed_thread_still_unresolved() -> None:
    result = _finalize(
        {
            "feedback": _feedback(threads=[_thread("PRRT_still_open")]),
            "checkpoints": [
                _checkpoint(
                    thread_summary={
                        "review_thread_count": 1,
                        "resolved_thread_ids": ["PRRT_still_open"],
                    }
                )
            ],
        }
    )

    assert result.valid is True
    assert result.ready_to_stop is False
    assert result.errors[0].code == "checkpointed_thread_still_unresolved"
    assert result.unresolved_unskipped_threads[0].thread_id == "PRRT_still_open"


def test_finalize_run_failed_validation_command_is_not_ready() -> None:
    result = _finalize(
        {
            "feedback": _feedback(),
            "checkpoints": [
                _checkpoint(
                    batch_complete=False,
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
        }
    )

    assert result.valid is True
    assert result.ready_to_stop is False
    assert result.checkpoint_summaries[0].failed_validation_commands[0].status == "failed"
    assert "failed_validation_command" in [error.code for error in result.errors]


def test_finalize_run_empty_checkpoints_returns_live_summary_with_warning() -> None:
    result = _finalize({"feedback": _feedback(threads=[_thread("PRRT_open")])})

    assert result.valid is True
    assert result.ready_to_stop is False
    assert result.counts.checkpoint_batches == 0
    assert result.unresolved_unskipped_threads[0].thread_id == "PRRT_open"
    assert result.warnings == ("No batch checkpoint evidence supplied.",)


def test_finalize_run_skipped_unresolved_thread_is_not_unskipped_work() -> None:
    result = _finalize(
        {
            "feedback": _feedback(threads=[_thread("PRRT_deferred")]),
            "checkpoints": [
                _checkpoint(
                    thread_summary={
                        "review_thread_count": 1,
                        "skipped_thread_ids": ["PRRT_deferred"],
                        "skipped_threads": [
                            {
                                "thread_id": "PRRT_deferred",
                                "skip_reason": "Deferred by user.",
                                "summary": "Needs a follow-up design decision.",
                            }
                        ],
                    }
                )
            ],
        }
    )

    assert result.ready_to_stop is True
    assert result.all_feedback_addressed is False
    assert result.counts.unresolved_unskipped_threads == 0
    assert result.skipped_items[0].thread_id == "PRRT_deferred"
