"""Loose markdown profile lookup for roaster Graphite stack runs."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

_PROFILE_SLUG_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
_PROFILES_DIR = Path(".roaster") / "profiles"


@dataclass(frozen=True)
class StackProfile:
    """Raw markdown guidance loaded for a stack workflow profile."""

    slug: str
    path: Path
    guidance: str


@dataclass(frozen=True)
class StackProfileInvalidSlug:
    """The requested profile slug is not a safe single path segment."""

    message: str


@dataclass(frozen=True)
class StackProfileMissing:
    """No markdown profile exists for the requested slug."""

    path: Path
    message: str


@dataclass(frozen=True)
class StackProfileNotAFile:
    """The resolved profile path exists but is not a regular file."""

    path: Path
    message: str


@dataclass(frozen=True)
class StackProfileResolutionFailed:
    """The resolved profile path could not be proven safe."""

    message: str


@dataclass(frozen=True)
class StackProfileReadFailed:
    """The profile file could not be read from disk."""

    path: Path
    message: str


StackProfileResolution = (
    StackProfile
    | StackProfileInvalidSlug
    | StackProfileMissing
    | StackProfileNotAFile
    | StackProfileResolutionFailed
    | StackProfileReadFailed
)


def resolve_stack_profile(*, cwd: Path, slug: str) -> StackProfileResolution:
    """Load a raw markdown stack profile from ``.roaster/profiles/<slug>.md``.

    The markdown body is intentionally returned as loose guidance only. This
    resolver validates the file location but does not parse headings,
    frontmatter, or prose into deterministic workflow facts.
    """
    normalized_slug = slug.strip()
    invalid_message = _invalid_profile_slug_message(slug=slug, normalized_slug=normalized_slug)
    if invalid_message is not None:
        return StackProfileInvalidSlug(message=invalid_message)

    profiles_dir = cwd / _PROFILES_DIR
    path = profiles_dir / f"{normalized_slug}.md"

    if not path.exists():
        return StackProfileMissing(
            path=path,
            message=(
                f"No roaster stack profile found for slug {slug!r} at {path}. "
                "Create .roaster/profiles/<slug>.md."
            ),
        )
    if not path.is_file():
        return StackProfileNotAFile(
            path=path,
            message=f"Roaster stack profile path is not a file: {path}",
        )

    try:
        profiles_root = profiles_dir.resolve()
        resolved_path = path.resolve()
    except OSError as exc:
        return StackProfileResolutionFailed(
            message=f"Unable to resolve roaster stack profile {slug!r}: {exc}",
        )

    if profiles_root not in resolved_path.parents:
        return StackProfileInvalidSlug(
            message=f"Roaster stack profile {slug!r} resolves outside {profiles_dir}.",
        )

    try:
        guidance = path.read_text(encoding="utf-8")
    except OSError as exc:
        return StackProfileReadFailed(
            path=path,
            message=f"Unable to read roaster stack profile {path}: {exc}",
        )

    return StackProfile(slug=normalized_slug, path=path, guidance=guidance)


def _invalid_profile_slug_message(*, slug: str, normalized_slug: str) -> str | None:
    if not normalized_slug:
        return "Roaster stack profile slug must not be empty."
    if not _PROFILE_SLUG_RE.fullmatch(normalized_slug):
        return (
            "Roaster stack profile slug must be one safe path segment using only "
            "letters, numbers, dots, underscores, and hyphens; "
            f"got {slug!r}."
        )
    return None
