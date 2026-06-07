"""Pure Graphite-stack planning helpers for roaster stack workflows."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TypeAlias

from roaster.stack.core.contracts import (
    GeneratedStackBranch,
    StackTriageBatch,
)
from roaster.stack.core.slugs import generated_batch_branch_name

_CONFIDENCE_ORDER = {"high": 0, "medium": 1, "low": 2}
_RISK_ORDER = {"mechanical": 0, "behavioral": 1, "architectural": 2, "speculative": 3}


@dataclass(frozen=True)
class StackBatchOrderingError:
    """A triage batch dependency graph cannot be ordered."""

    message: str
    error_type: str = "stack_batch_ordering_failed"


StackBatchOrderingResult: TypeAlias = tuple[StackTriageBatch, ...] | StackBatchOrderingError


def generated_branch_for_batch(
    *,
    impl_branch_slug: str,
    run_slug: str,
    batch: StackTriageBatch,
) -> GeneratedStackBranch:
    """Return the generated branch identity for one resolver batch."""
    return GeneratedStackBranch(
        branch_name=generated_batch_branch_name(
            impl_branch_slug=impl_branch_slug,
            run_slug=run_slug,
            batch_slug=batch.slug,
        ),
        impl_branch_slug=impl_branch_slug,
        run_slug=run_slug,
        batch_slug=batch.slug,
    )


def order_stack_triage_batches(
    batches: tuple[StackTriageBatch, ...],
) -> StackBatchOrderingResult:
    """Order batches dependency-first, then safer and higher-confidence first.

    Earlier batches become lower in the generated Graphite stack. Later batches
    become topmost, so speculative and higher-risk work is intentionally delayed
    when dependencies do not constrain order.
    """
    batches_by_slug = {batch.slug: batch for batch in batches}
    if len(batches_by_slug) != len(batches):
        return StackBatchOrderingError(message="Triage batches contain duplicate slugs.")

    unknown_dependencies = _unknown_dependencies(batches, batches_by_slug)
    if unknown_dependencies:
        batch_slug, dependency = unknown_dependencies[0]
        return StackBatchOrderingError(
            message=f"Batch {batch_slug!r} depends on unknown batch {dependency!r}."
        )

    original_index = {batch.slug: index for index, batch in enumerate(batches)}
    remaining = set(batches_by_slug)
    ordered: list[StackTriageBatch] = []

    while remaining:
        ready = [
            batches_by_slug[slug]
            for slug in remaining
            if all(dependency not in remaining for dependency in batches_by_slug[slug].dependencies)
        ]
        if not ready:
            cycle_slugs = ", ".join(sorted(remaining))
            return StackBatchOrderingError(
                message=f"Triage batch dependencies contain a cycle involving: {cycle_slugs}."
            )

        ready.sort(key=lambda batch: _batch_order_key(batch, original_index[batch.slug]))
        selected = ready[0]
        ordered.append(selected)
        remaining.remove(selected.slug)

    return tuple(ordered)


def _unknown_dependencies(
    batches: tuple[StackTriageBatch, ...],
    batches_by_slug: dict[str, StackTriageBatch],
) -> tuple[tuple[str, str], ...]:
    unknown: list[tuple[str, str]] = []
    for batch in batches:
        for dependency in batch.dependencies:
            if dependency not in batches_by_slug:
                unknown.append((batch.slug, dependency))
    return tuple(unknown)


def _batch_order_key(batch: StackTriageBatch, original_index: int) -> tuple[int, int, int]:
    return (
        _CONFIDENCE_ORDER[batch.confidence],
        _RISK_ORDER[batch.risk],
        original_index,
    )
