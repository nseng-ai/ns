"""Shared helpers for review-target presentation metadata."""

from __future__ import annotations

from roaster.models import DiffReviewTarget, ReviewTarget


def target_label(target: ReviewTarget) -> str:
    """Return the human-readable label for a review target."""
    if isinstance(target, DiffReviewTarget):
        return "current branch diff"
    return target.label
