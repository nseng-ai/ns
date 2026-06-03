"""Changed-path and target selection for markdown-defined reviews."""

from __future__ import annotations

import fnmatch

from roaster.models import MatchedReview, ReviewMetadata, ReviewScope, ReviewTarget, SkippedReview

_SKIP_REASON_WHEN_CHANGED = "No changed paths matched when_changed globs."


def is_review_eligible_for_target(scope: ReviewScope, target: ReviewTarget | None) -> bool:
    """Return whether a review scope is discoverable for the requested target."""
    if target is None:
        return True
    if target == "ci":
        return scope == "all" or scope == "ci"
    return scope == "all" or scope == "local"


def filter_reviews_for_target(
    reviews: tuple[ReviewMetadata, ...],
    *,
    target: ReviewTarget | None,
) -> tuple[ReviewMetadata, ...]:
    """Return reviews eligible for the target, preserving catalog order."""
    return tuple(
        review for review in reviews if is_review_eligible_for_target(review.scope, target)
    )


def build_review_selection(
    *,
    reviews: tuple[ReviewMetadata, ...],
    changed_paths: tuple[str, ...],
) -> tuple[tuple[MatchedReview, ...], tuple[SkippedReview, ...]]:
    """Select reviews whose ``when_changed`` globs match the changed paths."""
    selected: list[MatchedReview] = []
    skipped: list[SkippedReview] = []

    for review in reviews:
        if not review.when_changed:
            selected.append(_matched_review(review, matched_paths=()))
            continue

        matched_paths = _matched_paths(review=review, changed_paths=changed_paths)
        if matched_paths:
            selected.append(_matched_review(review, matched_paths=matched_paths))
            continue

        skipped.append(
            SkippedReview(
                key=review.key,
                description=review.description,
                default_model=review.default_model,
                scope=review.scope,
                when_changed=review.when_changed,
                skip_reason=_SKIP_REASON_WHEN_CHANGED,
            )
        )

    return tuple(selected), tuple(skipped)


def _matched_review(review: ReviewMetadata, *, matched_paths: tuple[str, ...]) -> MatchedReview:
    return MatchedReview(
        key=review.key,
        description=review.description,
        default_model=review.default_model,
        scope=review.scope,
        when_changed=review.when_changed,
        matched_paths=matched_paths,
    )


def _matched_paths(
    *,
    review: ReviewMetadata,
    changed_paths: tuple[str, ...],
) -> tuple[str, ...]:
    return tuple(
        path
        for path in changed_paths
        if any(_path_matches_glob(path=path, pattern=pattern) for pattern in review.when_changed)
    )


def _path_matches_glob(*, path: str, pattern: str) -> bool:
    if fnmatch.fnmatchcase(path, pattern):
        return True
    if pattern.startswith("**/"):
        return fnmatch.fnmatchcase(path, pattern.removeprefix("**/"))
    return False
