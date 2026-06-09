"""Review-definition applicability matching for repo-relative changed paths."""

from __future__ import annotations

import fnmatch

from roaster.models import ReviewApplicability, ReviewDefinition


def applicable_review_keys(
    definitions_by_key: dict[str, ReviewDefinition],
    *,
    changed_paths: tuple[str, ...],
) -> tuple[str, ...]:
    """Return review keys whose applicability metadata matches ``changed_paths``."""
    return tuple(
        key
        for key, definition in definitions_by_key.items()
        if review_applies_to_paths(definition.applicability, changed_paths)
    )


def review_applies_to_paths(
    applicability: ReviewApplicability,
    changed_paths: tuple[str, ...],
) -> bool:
    """Return whether ``applicability`` contributes at least one changed path."""
    if not applicability.include:
        return True

    return any(_path_contributes(path, applicability=applicability) for path in changed_paths)


def path_matches_pattern(path: str, pattern: str) -> bool:
    """Match a repo-relative POSIX path against a gitignore-like ``**`` pattern."""
    path_segments = _split_path(path)
    pattern_segments = _split_path(pattern)
    if path_segments is None or pattern_segments is None:
        return False
    return _segments_match(path_segments=path_segments, pattern_segments=pattern_segments)


def _path_contributes(path: str, *, applicability: ReviewApplicability) -> bool:
    is_included = any(path_matches_pattern(path, pattern) for pattern in applicability.include)
    if not is_included:
        return False
    return not any(path_matches_pattern(path, pattern) for pattern in applicability.exclude)


def _split_path(path: str) -> tuple[str, ...] | None:
    normalized = path.replace("\\", "/").strip()
    if not normalized or normalized.startswith("/"):
        return None
    if normalized.startswith("./"):
        normalized = normalized[2:]
    segments = tuple(segment for segment in normalized.split("/") if segment)
    if not segments or ".." in segments:
        return None
    return segments


def _segments_match(*, path_segments: tuple[str, ...], pattern_segments: tuple[str, ...]) -> bool:
    if not pattern_segments:
        return not path_segments

    pattern_head = pattern_segments[0]
    pattern_tail = pattern_segments[1:]
    if pattern_head == "**":
        if _segments_match(path_segments=path_segments, pattern_segments=pattern_tail):
            return True
        return bool(path_segments) and _segments_match(
            path_segments=path_segments[1:],
            pattern_segments=pattern_segments,
        )

    if not path_segments:
        return False
    return fnmatch.fnmatchcase(path_segments[0], pattern_head) and _segments_match(
        path_segments=path_segments[1:],
        pattern_segments=pattern_tail,
    )
