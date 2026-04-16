"""Filter PR-level reviews that carry no classifier signal."""

from __future__ import annotations

from twerk_core.gh.types import PRReview

_SILENCEABLE_EMPTY_STATES: frozenset[str] = frozenset({"COMMENTED", "APPROVED"})


def is_empty_review(review: PRReview) -> bool:
    """True when the review has no body and its state carries no request.

    `COMMENTED` / `APPROVED` with an empty body is pure noise — no text to
    act on, no state-level request. `CHANGES_REQUESTED` / `DISMISSED` with an
    empty body still conveys a signal through state alone, so those are
    preserved.
    """
    return review.state in _SILENCEABLE_EMPTY_STATES and not review.body.strip()


def filter_empty_reviews(reviews: tuple[PRReview, ...]) -> tuple[PRReview, ...]:
    return tuple(review for review in reviews if not is_empty_review(review))
