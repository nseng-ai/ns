"""Changed-path selection helpers for markdown-defined reviewers."""

from __future__ import annotations

from dataclasses import dataclass
from fnmatch import fnmatchcase

from roaster.models import MatchedReview, ReviewDefinition, SkippedReview

_SKIPPED_NO_CHANGED_PATH_MATCH = "no_changed_path_match"


@dataclass(frozen=True)
class ReviewSelection:
    """Selected and skipped reviews for one changed-path set."""

    selected: tuple[MatchedReview, ...]
    skipped: tuple[SkippedReview, ...]


def build_review_selection(
    *,
    review_definitions: tuple[ReviewDefinition, ...],
    changed_paths: tuple[str, ...],
) -> ReviewSelection:
    """Select reviews whose ``when_changed`` globs match the changed paths."""
    normalized_changed_paths = tuple(
        normalized_path for path in changed_paths if (normalized_path := _normalize_repo_path(path))
    )

    selected: list[MatchedReview] = []
    skipped: list[SkippedReview] = []
    for review_definition in review_definitions:
        matched_paths = matching_changed_paths(
            patterns=review_definition.when_changed,
            changed_paths=normalized_changed_paths,
        )
        if not review_definition.when_changed or matched_paths:
            selected.append(
                MatchedReview(
                    key=review_definition.name,
                    description=review_definition.description,
                    default_model=review_definition.default_model,
                    when_changed=review_definition.when_changed,
                    matched_paths=matched_paths,
                )
            )
            continue

        skipped.append(
            SkippedReview(
                key=review_definition.name,
                description=review_definition.description,
                default_model=review_definition.default_model,
                when_changed=review_definition.when_changed,
                reason=_SKIPPED_NO_CHANGED_PATH_MATCH,
            )
        )

    return ReviewSelection(selected=tuple(selected), skipped=tuple(skipped))


def matching_changed_paths(
    *,
    patterns: tuple[str, ...],
    changed_paths: tuple[str, ...],
) -> tuple[str, ...]:
    """Return changed paths matched by at least one review condition pattern."""
    if not patterns:
        return ()

    return tuple(
        path
        for path in changed_paths
        if any(_matches_changed_path(pattern, path) for pattern in patterns)
    )


def _matches_changed_path(pattern: str, path: str) -> bool:
    normalized_pattern = _normalize_repo_path(pattern)
    if not normalized_pattern:
        return False

    if fnmatchcase(path, normalized_pattern):
        return True

    if normalized_pattern.startswith("**/"):
        return fnmatchcase(path, normalized_pattern[3:])

    return False


def _normalize_repo_path(value: str) -> str:
    normalized = value.strip().replace("\\", "/")
    while normalized.startswith("./"):
        normalized = normalized[2:]
    return normalized.lstrip("/")
