"""Unit tests for batch checkpoint validation."""

from __future__ import annotations

import pytest

from asdl_pr_address.cli.pr_address.batch_checkpoint_models import RecordBatchCheckpointInput
from asdl_pr_address.cli.pr_address.batch_checkpoint_validation import record_batch_checkpoint


def _minimal_plan() -> dict:
    return {
        "valid": True,
        "manifest_kind": "get_feedback",
        "pr_number": 42,
        "payload_path": None,
        "validation": {
            "valid": True,
            "manifest_kind": "get_feedback",
            "pr_number": 42,
            "payload_path": None,
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
            "actionable_items": 0,
            "informational_items": 0,
            "batches": 1,
            "approval_required_batches": 0,
            "actionable_reviews": 0,
            "actionable_review_threads": 0,
            "actionable_discussion_comments": 0,
            "informational_reviews": 0,
            "informational_review_threads": 0,
            "informational_discussion_comments": 0,
        },
        "batches": [
            {
                "batch_id": "single_file",
                "complexity": "single_file",
                "approval_required": False,
                "items": [],
            }
        ],
        "informational": [],
        "warnings": [],
    }


def _checkpoint_input(**overrides: object) -> RecordBatchCheckpointInput:
    payload = {"plan": _minimal_plan(), "batch_id": "single_file", **overrides}
    return RecordBatchCheckpointInput.model_validate(payload)


@pytest.mark.parametrize(
    "changed_file",
    [
        "..\\escape.py",
        "foo\\..\\bar.py",
        "C:foo\\bar.py",
        "foo/../bar.py",
    ],
)
def test_record_batch_checkpoint_rejects_non_posix_relative_changed_files(
    changed_file: str,
) -> None:
    result = record_batch_checkpoint(
        _checkpoint_input(commit_sha="abc1234", changed_files=[changed_file])
    )

    assert result.valid is False
    assert result.batch_complete is False
    assert [error.code for error in result.errors] == ["unsafe_changed_file"]


def test_record_batch_checkpoint_failed_validation_command_is_incomplete_not_invalid() -> None:
    result = record_batch_checkpoint(
        _checkpoint_input(
            validation_commands=[
                {
                    "command": "uv run pytest packages/asdl-pr-address/tests/scenario -q",
                    "status": "failed",
                    "exit_code": 1,
                    "summary": "scenario tests failed",
                }
            ]
        )
    )

    assert result.valid is True
    assert result.batch_complete is False
    assert [error.code for error in result.errors] == ["failed_validation_command"]
