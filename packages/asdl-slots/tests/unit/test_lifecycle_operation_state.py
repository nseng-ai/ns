from __future__ import annotations

from pathlib import Path

from asdl_slots.lifecycle.operation_state import (
    operation_in_progress_detail,
    operation_recovery_instruction,
    operation_recovery_sentence,
    slot_operation_in_progress_message,
)


def test_operation_recovery_instruction_rebase() -> None:
    instruction = operation_recovery_instruction("rebase")

    assert "git rebase --continue" in instruction
    assert "--abort" in instruction


def test_operation_recovery_instruction_bisect() -> None:
    instruction = operation_recovery_instruction("bisect")

    assert "git bisect reset" in instruction


def test_operation_recovery_instruction_unknown_operation() -> None:
    assert operation_recovery_instruction("cherry-pick") == "finish or abort it there"


def test_operation_recovery_sentence_starts_with_capitalized_instruction() -> None:
    assert operation_recovery_sentence("bisect") == "Run `git bisect reset` there"


def test_slot_operation_in_progress_message_includes_context() -> None:
    message = slot_operation_in_progress_message(
        slot_name="slot-01",
        branch_name="feat/rebase",
        worktree_path=Path("/tmp/slot-01"),
        operation="rebase",
        action="freeing",
    )

    assert "slot-01" in message
    assert "feat/rebase" in message
    assert "rebase" in message
    assert "/tmp/slot-01" in message
    assert "git rebase --continue" in message
    assert "freeing" in message


def test_slot_operation_in_progress_message_uses_unknown_branch_fallback() -> None:
    message = slot_operation_in_progress_message(
        slot_name="slot-02",
        branch_name=None,
        worktree_path=Path("/tmp/slot-02"),
        operation="bisect",
        action="shrinking the pool",
    )

    assert "unknown branch" in message
    assert "git bisect reset" in message


def test_operation_in_progress_detail_omits_slot_prefix() -> None:
    message = operation_in_progress_detail(
        branch_name="feat/bisect",
        worktree_path=Path("/tmp/slot-03"),
        operation="bisect",
        action="running slot gc",
    )

    assert message.startswith("bisect in progress")
    assert "feat/bisect" in message
    assert "git bisect reset" in message
