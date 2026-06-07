"""Deterministic review-definition compatibility checks."""

from __future__ import annotations

from dataclasses import dataclass

from roaster.models import ReviewDefinition, TargetKind

_DOCUMENT_COMPATIBLE_TERMS = (
    "document",
    "artifact",
    "plan",
    "spec",
    "adr",
    "handoff",
    "objective",
    "proposal",
    "design",
    "target",
)

_DIFF_SPECIFIC_TERMS = (
    "unified diff",
    "line in the diff",
    "changed line",
    "changed code",
    "changed path",
    "current branch diff",
    "supplied diff",
    "review only the supplied diff",
    "diff",
    "patch",
    "pr",
    "pull request",
)


@dataclass(frozen=True)
class ReviewCompatibility:
    """Warning-only compatibility result for a reviewer and target kind."""

    is_clear: bool
    warning: str | None = None


def evaluate_review_compatibility(
    *,
    review_definition: ReviewDefinition,
    target_kind: TargetKind,
) -> ReviewCompatibility:
    """Infer whether a reviewer clearly fits a target kind.

    Existing review definitions predate target frontmatter. The heuristic is
    deterministic and intentionally conservative: diff targets are compatible;
    document targets warn only when the reviewer text appears strongly tied to
    diffs/PR patches and lacks document/artifact language.
    """
    if target_kind == "diff":
        return ReviewCompatibility(is_clear=True)

    text = _definition_text(review_definition)
    if _contains_any(text, _DOCUMENT_COMPATIBLE_TERMS):
        return ReviewCompatibility(is_clear=True)

    diff_hits = _term_hit_count(text, _DIFF_SPECIFIC_TERMS)
    if diff_hits == 0:
        return ReviewCompatibility(is_clear=True)

    return ReviewCompatibility(
        is_clear=False,
        warning=(
            f"Review {review_definition.name!r} appears diff-oriented; running against a "
            "document target anyway. Consider using a target-polymorphic reviewer."
        ),
    )


def _definition_text(review_definition: ReviewDefinition) -> str:
    return "\n".join(
        (
            review_definition.name,
            review_definition.description,
            review_definition.instructions,
        )
    ).lower()


def _contains_any(text: str, terms: tuple[str, ...]) -> bool:
    return any(term in text for term in terms)


def _term_hit_count(text: str, terms: tuple[str, ...]) -> int:
    return sum(1 for term in terms if term in text)
