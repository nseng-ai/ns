from __future__ import annotations

from roaster.models import ReviewDefinition
from roaster.review_compatibility import evaluate_review_compatibility


def _definition(*, description: str, instructions: str) -> ReviewDefinition:
    return ReviewDefinition(
        name="reviewer",
        description=description,
        instructions=instructions,
        default_model="sonnet",
    )


def test_diff_targets_are_always_clear() -> None:
    result = evaluate_review_compatibility(
        review_definition=_definition(
            description="Review only the supplied diff.",
            instructions="Flag changed code.",
        ),
        target_kind="diff",
    )

    assert result.is_clear is True
    assert result.warning is None


def test_document_friendly_review_avoids_warning() -> None:
    result = evaluate_review_compatibility(
        review_definition=_definition(
            description="Review the supplied document or plan.",
            instructions="Find material contradictions in the artifact.",
        ),
        target_kind="document",
    )

    assert result.is_clear is True
    assert result.warning is None


def test_diff_specific_review_warns_for_document_target() -> None:
    result = evaluate_review_compatibility(
        review_definition=_definition(
            description="Review only the supplied diff.",
            instructions="Each finding must point at a changed line in the PR diff.",
        ),
        target_kind="document",
    )

    assert result.is_clear is False
    assert result.warning is not None
    assert "diff-oriented" in result.warning
