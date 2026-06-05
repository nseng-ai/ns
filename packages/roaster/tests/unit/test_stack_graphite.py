from __future__ import annotations

from roaster.stack_graphite import (
    StackBatchOrderingError,
    generated_branch_for_batch,
    order_stack_triage_batches,
)
from roaster.stack_models import GeneratedStackBranch, StackConfidence, StackRisk, StackTriageBatch


def _batch(
    slug: str,
    *,
    dependencies: tuple[str, ...] = (),
    confidence: StackConfidence = "medium",
    risk: StackRisk = "behavioral",
) -> StackTriageBatch:
    return StackTriageBatch(
        slug=slug,
        title=slug.replace("-", " ").title(),
        summary=f"Resolve {slug}.",
        finding_ids=(f"F-{slug}",),
        dependencies=dependencies,
        confidence=confidence,
        risk=risk,
        resolver_mandate=f"Resolve {slug}.",
        validation_requirements=("just test",),
    )


def test_generated_branch_for_batch_uses_canonical_roaster_branch_layout() -> None:
    batch = _batch("fix-tests")

    branch = generated_branch_for_batch(
        impl_branch_slug="impl-branch",
        run_slug="run-1",
        batch=batch,
    )

    assert branch == GeneratedStackBranch(
        branch_name="impl-branch/roaster/run-1/fix-tests",
        impl_branch_slug="impl-branch",
        run_slug="run-1",
        batch_slug="fix-tests",
    )


def test_order_stack_triage_batches_honors_dependencies_before_preference() -> None:
    speculative = _batch(
        "speculative-top",
        dependencies=("mechanical-base",),
        confidence="low",
        risk="speculative",
    )
    mechanical = _batch("mechanical-base", confidence="high", risk="mechanical")

    ordered = order_stack_triage_batches((speculative, mechanical))

    assert ordered == (mechanical, speculative)


def test_order_stack_triage_batches_prefers_safe_high_confidence_batches_first() -> None:
    architectural = _batch("architectural", confidence="high", risk="architectural")
    mechanical = _batch("mechanical", confidence="high", risk="mechanical")
    low_confidence = _batch("low-confidence", confidence="low", risk="mechanical")

    ordered = order_stack_triage_batches((architectural, low_confidence, mechanical))

    assert ordered == (mechanical, architectural, low_confidence)


def test_order_stack_triage_batches_reports_unknown_dependency() -> None:
    result = order_stack_triage_batches((_batch("child", dependencies=("missing",)),))

    assert isinstance(result, StackBatchOrderingError)
    assert "unknown batch 'missing'" in result.message


def test_order_stack_triage_batches_reports_cycles() -> None:
    result = order_stack_triage_batches(
        (
            _batch("a", dependencies=("b",)),
            _batch("b", dependencies=("a",)),
        )
    )

    assert isinstance(result, StackBatchOrderingError)
    assert "cycle" in result.message
