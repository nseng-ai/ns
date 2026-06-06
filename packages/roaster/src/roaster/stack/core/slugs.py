"""Slug and branch-name helpers for roaster stack workflows."""

from __future__ import annotations

import re

_SAFE_SEGMENT_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
_FORBIDDEN_BRANCH_CHARS = frozenset(" ~^:?*[\\")


class StackSlugError(ValueError):
    """A roaster stack slug or generated branch name is unsafe."""


def validate_profile_slug(slug: str) -> str:
    """Validate a profile slug as one safe path segment."""
    return _validate_safe_segment(slug, label="profile slug")


def validate_run_slug(slug: str) -> str:
    """Validate a run slug as one safe path segment."""
    return _validate_safe_segment(slug, label="run slug")


def validate_batch_slug(slug: str) -> str:
    """Validate a batch slug as one safe path segment."""
    return _validate_safe_segment(slug, label="batch slug")


def validate_branch_memory_segment(
    segment: str,
    *,
    label: str = "Branch Memory key segment",
) -> str:
    """Validate one Branch Memory branch/key path segment.

    Branch Memory refs use `---` as a structural delimiter, so roaster rejects
    that token before storage code sees it.
    """
    normalized = _validate_safe_segment(segment, label=label)
    if "---" in normalized:
        raise StackSlugError(f"Roaster {label} must not contain the Branch Memory delimiter `---`.")
    return normalized


def validate_branch_memory_branch_name(branch_name: str) -> str:
    """Validate a Branch Memory branch name at a conservative safe-ref level."""
    normalized = validate_generated_branch_name(branch_name)
    if "---" in normalized:
        raise StackSlugError(
            "Roaster Branch Memory branch names must not contain the delimiter `---`."
        )
    return normalized


def generated_batch_branch_name(
    *,
    impl_branch_slug: str,
    run_slug: str,
    batch_slug: str,
) -> str:
    """Generate `<impl-branch-slug>/roaster/<run-slug>/<batch-slug>`."""
    branch_name = "/".join(
        (
            _validate_safe_segment(impl_branch_slug, label="implementation branch slug"),
            "roaster",
            validate_run_slug(run_slug),
            validate_batch_slug(batch_slug),
        )
    )
    return validate_generated_branch_name(branch_name)


def validate_generated_branch_name(branch_name: str) -> str:
    """Validate a generated git/Graphite branch name at a basic safe level."""
    normalized = branch_name.strip()
    if not normalized:
        raise StackSlugError("Roaster generated branch name must not be empty.")
    if normalized != branch_name:
        raise StackSlugError("Roaster generated branch name must not have surrounding whitespace.")
    if normalized.startswith("/") or normalized.endswith("/"):
        raise StackSlugError("Roaster generated branch name must not start or end with `/`.")
    if "//" in normalized:
        raise StackSlugError("Roaster generated branch name must not contain empty path segments.")
    if ".." in normalized:
        raise StackSlugError("Roaster generated branch name must not contain `..`.")
    if "@{" in normalized:
        raise StackSlugError("Roaster generated branch name must not contain `@{`.")
    for char in normalized:
        if ord(char) < 32 or ord(char) == 127:
            raise StackSlugError("Roaster generated branch name must not contain control chars.")
        if char in _FORBIDDEN_BRANCH_CHARS:
            raise StackSlugError(
                f"Roaster generated branch name contains forbidden git ref character {char!r}."
            )
    for segment in normalized.split("/"):
        if segment.startswith("."):
            raise StackSlugError("Roaster generated branch path segments must not start with `.`.")
        if segment.endswith("."):
            raise StackSlugError("Roaster generated branch path segments must not end with `.`.")
        if segment.endswith(".lock"):
            raise StackSlugError(
                "Roaster generated branch path segments must not end with `.lock`."
            )
    return normalized


def _validate_safe_segment(slug: str, *, label: str) -> str:
    normalized = slug.strip()
    if not normalized:
        raise StackSlugError(f"Roaster {label} must not be empty.")
    if normalized != slug:
        raise StackSlugError(f"Roaster {label} must not have surrounding whitespace.")
    if not _SAFE_SEGMENT_RE.fullmatch(normalized):
        raise StackSlugError(
            f"Roaster {label} must be one safe path segment using only letters, numbers, "
            f"dots, underscores, and hyphens; got {slug!r}."
        )
    return normalized
