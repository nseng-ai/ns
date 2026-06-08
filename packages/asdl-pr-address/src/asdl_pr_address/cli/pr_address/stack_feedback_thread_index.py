"""Canonical stack feedback review-thread identity helpers."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import TypeAlias

from asdl_pr_address.cli.pr_address.stack_feedback import (
    StackFeedbackPlanBatch,
    StackFeedbackPlanInformationalItem,
    StackFeedbackPlanItem,
    StackFeedbackPlanResult,
)
from asdl_pr_address.cli.pr_address.string_values import trim_optional

ThreadKey: TypeAlias = tuple[int, str]
StackFeedbackPlanThreadItem: TypeAlias = StackFeedbackPlanItem | StackFeedbackPlanInformationalItem


@dataclass(frozen=True)
class StackFeedbackThreadIndex:
    planned_pr_numbers: tuple[int, ...]
    actionable_review_threads: tuple[StackFeedbackPlanItem, ...]
    actionable_review_thread_keys: set[ThreadKey]
    known_review_thread_keys: set[ThreadKey]
    informational_review_thread_keys: set[ThreadKey]


def build_stack_feedback_thread_index(
    stack_plan: StackFeedbackPlanResult,
) -> StackFeedbackThreadIndex:
    actionable_items = actionable_review_thread_items(stack_plan)
    actionable_keys = _review_thread_keys(actionable_items)
    informational_keys = informational_review_thread_keys(stack_plan)
    return StackFeedbackThreadIndex(
        planned_pr_numbers=planned_pr_numbers(stack_plan),
        actionable_review_threads=actionable_items,
        actionable_review_thread_keys=actionable_keys,
        known_review_thread_keys=actionable_keys | informational_keys,
        informational_review_thread_keys=informational_keys,
    )


def thread_key(pr_number: int, thread_id: str | None) -> ThreadKey | None:
    trimmed = trim_optional(thread_id)
    if trimmed is None:
        return None
    return (pr_number, trimmed)


def planned_pr_numbers(stack_plan: StackFeedbackPlanResult) -> tuple[int, ...]:
    if stack_plan.validation.per_pr:
        return tuple(item.pr_number for item in stack_plan.validation.per_pr)

    pr_numbers: list[int] = []
    for batch in stack_plan.batches:
        for item in batch.items:
            pr_numbers.append(item.pr_number)
    for item in stack_plan.informational:
        pr_numbers.append(item.pr_number)
    return tuple(dict.fromkeys(pr_numbers))


def actionable_review_thread_items(
    stack_plan: StackFeedbackPlanResult,
) -> tuple[StackFeedbackPlanItem, ...]:
    return tuple(
        item
        for batch in stack_plan.batches
        for item in batch.items
        if item.source_kind == "review_thread"
    )


def selected_batch_review_thread_items(
    selected_batch: StackFeedbackPlanBatch,
) -> tuple[StackFeedbackPlanItem, ...]:
    return tuple(item for item in selected_batch.items if item.source_kind == "review_thread")


def known_review_thread_keys(stack_plan: StackFeedbackPlanResult) -> set[ThreadKey]:
    actionable_keys = _review_thread_keys(actionable_review_thread_items(stack_plan))
    return actionable_keys | informational_review_thread_keys(stack_plan)


def informational_review_thread_keys(stack_plan: StackFeedbackPlanResult) -> set[ThreadKey]:
    return _review_thread_keys(
        tuple(item for item in stack_plan.informational if item.source_kind == "review_thread")
    )


def items_by_thread(
    items: tuple[StackFeedbackPlanItem, ...],
) -> dict[str, tuple[StackFeedbackPlanItem, ...]]:
    grouped: dict[str, list[StackFeedbackPlanItem]] = defaultdict(list)
    for item in items:
        trimmed_thread_id = trim_optional(item.thread_id)
        if trimmed_thread_id is not None:
            grouped[trimmed_thread_id].append(item)
    return {thread_id: tuple(thread_items) for thread_id, thread_items in grouped.items()}


def other_batch_review_threads(
    *,
    plan: StackFeedbackPlanResult,
    selected_batch_id: str,
) -> dict[ThreadKey, str]:
    lookup: dict[ThreadKey, str] = {}
    for batch in plan.batches:
        if batch.batch_id == selected_batch_id:
            continue
        for item in batch.items:
            if item.source_kind != "review_thread":
                continue
            key = thread_key(item.pr_number, item.thread_id)
            if key is not None:
                lookup[key] = batch.batch_id
    return lookup


def duplicate_thread_keys(keys: tuple[ThreadKey, ...]) -> tuple[ThreadKey, ...]:
    seen: set[ThreadKey] = set()
    duplicates: list[ThreadKey] = []
    for key in keys:
        if key in seen and key not in duplicates:
            duplicates.append(key)
        seen.add(key)
    return tuple(duplicates)


def _review_thread_keys(items: tuple[StackFeedbackPlanThreadItem, ...]) -> set[ThreadKey]:
    keys: set[ThreadKey] = set()
    for item in items:
        key = thread_key(item.pr_number, item.thread_id)
        if key is not None:
            keys.add(key)
    return keys
