"""Unit tests for canonical stack feedback review-thread indexing."""

from __future__ import annotations

from asdl_pr_address.cli.pr_address.stack_feedback import StackFeedbackPlanResult
from asdl_pr_address.cli.pr_address.stack_feedback_thread_index import (
    actionable_review_thread_items,
    build_stack_feedback_thread_index,
    informational_review_thread_keys,
    items_by_thread,
    known_review_thread_keys,
    other_batch_review_threads,
    planned_pr_numbers,
    selected_batch_review_thread_items,
    thread_key,
)


def _minimal_stack_feedback_plan(
    *,
    batches: list[dict],
    informational: list[dict] | None = None,
    validation_pr_numbers: tuple[int, ...] = (),
) -> StackFeedbackPlanResult:
    informational_items = informational or []
    pr_numbers = tuple(
        dict.fromkeys(
            [item["pr_number"] for batch in batches for item in batch["items"]]
            + [item["pr_number"] for item in informational_items]
            + list(validation_pr_numbers)
        )
    )
    return StackFeedbackPlanResult.model_validate(
        {
            "valid": True,
            "payload_session_id": "session1",
            "pr_count": len(pr_numbers),
            "validation": {
                "all_valid": True,
                "per_pr": [
                    {"pr_number": pr_number, "valid": True, "counts": {}, "errors": []}
                    for pr_number in validation_pr_numbers
                ],
            },
            "batches": batches,
            "informational": informational_items,
            "automation_discussion_summary": {
                "automation_like": 0,
                "human_like": 0,
                "needs_agent_review": 0,
                "by_reason": {},
            },
            "decision_docket": [],
            "stack_plan_reference": None,
            "summary": {
                "actionable_items": sum(len(batch["items"]) for batch in batches),
                "approval_required_items": 0,
                "informational_items": len(informational_items),
                "automation_discussion_comments": 0,
            },
        }
    )


def _stack_batch(batch_id: str, items: list[dict], *, complexity: str = "local") -> dict:
    return {
        "batch_id": batch_id,
        "complexity": complexity,
        "approval_required": False,
        "items": items,
    }


def _stack_thread_item(
    pr_number: int,
    thread_id: str | None,
    *,
    source_batch_id: str = "local",
) -> dict:
    return {
        "pr_number": pr_number,
        "branch": f"branch-{pr_number}",
        "source_batch_id": source_batch_id,
        "source_kind": "review_thread",
        "summary": f"Thread {thread_id} requires action.",
        "action_summary": f"Address thread {thread_id}.",
        "complexity": source_batch_id,
        "thread_id": thread_id,
    }


def _stack_review_item(pr_number: int, review_id: str) -> dict:
    return {
        "pr_number": pr_number,
        "branch": f"branch-{pr_number}",
        "source_batch_id": "local",
        "source_kind": "review",
        "summary": f"Review {review_id} requires action.",
        "action_summary": f"Address review {review_id}.",
        "complexity": "local",
        "review_id": review_id,
    }


def _informational_thread_item(pr_number: int, thread_id: str | None) -> dict:
    return {
        "pr_number": pr_number,
        "branch": f"branch-{pr_number}",
        "source_kind": "review_thread",
        "summary": f"Thread {thread_id} is informational.",
        "informational_reason": "not_actionable",
        "user_decision_required": False,
        "thread_id": thread_id,
    }


def _informational_review_item(pr_number: int, review_id: str) -> dict:
    return {
        "pr_number": pr_number,
        "branch": f"branch-{pr_number}",
        "source_kind": "review",
        "summary": f"Review {review_id} is informational.",
        "informational_reason": "not_actionable",
        "user_decision_required": False,
        "review_id": review_id,
    }


def test_stack_feedback_thread_index_collects_actionable_and_known_review_threads() -> None:
    stack_plan = _minimal_stack_feedback_plan(
        batches=[
            _stack_batch(
                "local",
                [
                    _stack_thread_item(101, "PRRT_101"),
                    _stack_review_item(101, "PRR_101"),
                    _stack_thread_item(102, "   "),
                    _stack_thread_item(103, None),
                ],
            )
        ],
        informational=[
            _informational_thread_item(104, "PRRT_INFO"),
            _informational_thread_item(105, " "),
            _informational_review_item(106, "PRR_INFO"),
        ],
    )

    index = build_stack_feedback_thread_index(stack_plan)

    assert [item.thread_id for item in actionable_review_thread_items(stack_plan)] == [
        "PRRT_101",
        "   ",
        None,
    ]
    assert index.actionable_review_thread_keys == {(101, "PRRT_101")}
    assert known_review_thread_keys(stack_plan) == {(101, "PRRT_101"), (104, "PRRT_INFO")}
    assert index.known_review_thread_keys == {(101, "PRRT_101"), (104, "PRRT_INFO")}
    assert thread_key(101, "  PRRT_101  ") == (101, "PRRT_101")
    assert thread_key(101, " ") is None


def test_stack_feedback_thread_index_preserves_validation_pr_order() -> None:
    stack_plan = _minimal_stack_feedback_plan(
        batches=[_stack_batch("local", [_stack_thread_item(101, "PRRT_101")])],
        informational=[_informational_thread_item(103, "PRRT_INFO")],
        validation_pr_numbers=(103, 101, 102),
    )
    fallback_stack_plan = _minimal_stack_feedback_plan(
        batches=[
            _stack_batch(
                "local",
                [
                    _stack_thread_item(102, "PRRT_102"),
                    _stack_thread_item(101, "PRRT_101"),
                    _stack_thread_item(102, "PRRT_102B"),
                ],
            )
        ],
        informational=[_informational_thread_item(103, "PRRT_INFO")],
    )

    assert planned_pr_numbers(stack_plan) == (103, 101, 102)
    assert build_stack_feedback_thread_index(stack_plan).planned_pr_numbers == (103, 101, 102)
    assert planned_pr_numbers(fallback_stack_plan) == (102, 101, 103)


def test_stack_feedback_thread_index_supports_payload_builder_lookups() -> None:
    stack_plan = _minimal_stack_feedback_plan(
        batches=[
            _stack_batch(
                "local",
                [
                    _stack_thread_item(101, " PRRT_SHARED "),
                    _stack_thread_item(102, "PRRT_SHARED"),
                    _stack_review_item(103, "PRR_103"),
                ],
            ),
            _stack_batch(
                "cross_cutting",
                [_stack_thread_item(104, "PRRT_OTHER", source_batch_id="cross_cutting")],
                complexity="cross_cutting",
            ),
        ],
        informational=[_informational_thread_item(105, "PRRT_INFO")],
    )

    selected_items = selected_batch_review_thread_items(stack_plan.batches[0])

    grouped_by_thread = {
        thread_id: [item.pr_number for item in items]
        for thread_id, items in items_by_thread(selected_items).items()
    }

    assert [item.pr_number for item in selected_items] == [101, 102]
    assert grouped_by_thread == {"PRRT_SHARED": [101, 102]}
    assert other_batch_review_threads(plan=stack_plan, selected_batch_id="local") == {
        (104, "PRRT_OTHER"): "cross_cutting"
    }
    assert informational_review_thread_keys(stack_plan) == {(105, "PRRT_INFO")}
