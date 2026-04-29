"""Shared deterministic helpers for ``objective-create`` exec commands.

The agent owns slug *naming* (proposing a candidate from the workstream
brief). This module owns slug *format validation* (rejecting candidates that
violate the lowercase-ASCII / hyphen-separated / no-``objective-``-prefix /
no-``body.md``-suffix / 50-char-limit rules) and the canonical-collision
check on ``master``. Both are pure data transforms — no Markdown parsing,
no template loading, no prose synthesis. See "Markdown prose is not
schema" in ``docs/objective-system-canonicalization-plan.md``.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from brmem.gateway import BranchMemoryGateway
from twerk_objectives.discovery import BODY_FILE, MASTER_BRANCH
from twerk_objectives.gateway_access import OBJECTIVE_NAMESPACE

SLUG_MAX_LENGTH = 50
SLUG_FORBIDDEN_PREFIX = "objective-"
SLUG_FORBIDDEN_SUFFIX = f"/{BODY_FILE}"

InvalidSlugReason = Literal[
    "empty",
    "contains_slash",
    "ends_with_body_md",
    "leading_objective_prefix",
    "non_ascii_or_uppercase",
    "leading_or_trailing_hyphen",
    "consecutive_hyphens",
    "too_long",
]


@dataclass(frozen=True)
class InvalidSlug:
    """Structured slug-format failure."""

    reason: InvalidSlugReason
    message: str


def validate_slug_format(raw: str) -> InvalidSlug | None:
    """Validate ``raw`` against the slug-format rules.

    Returns ``None`` when the slug is valid, otherwise an :class:`InvalidSlug`
    describing the first violated rule. The agent supplies the slug; this
    helper does **not** transform or repair it.
    """
    if not raw:
        return InvalidSlug(reason="empty", message="Slug must be a non-empty string.")

    # The slug never contains a path component. ``slug_for_key`` strips the
    # last ``/<filename>`` from a key, so a slug containing ``/`` would
    # round-trip lossy.
    if "/" in raw:
        return InvalidSlug(
            reason="contains_slash",
            message=(
                f"Slug must not contain '/'; pass the bare slug, "
                f"not a key like 'foo/body.md'. Received: {raw!r}."
            ),
        )

    # Rules below assume the slug already lacks a ``/`` so ``ends_with_body_md``
    # is reachable only via ``body.md`` exactly (no ``/body.md`` suffix).
    if raw.endswith(SLUG_FORBIDDEN_SUFFIX):
        return InvalidSlug(
            reason="ends_with_body_md",
            message=(f"Slug must not end with '{SLUG_FORBIDDEN_SUFFIX}'. Received: {raw!r}."),
        )

    if raw.startswith(SLUG_FORBIDDEN_PREFIX):
        return InvalidSlug(
            reason="leading_objective_prefix",
            message=(
                f"Slug must not start with '{SLUG_FORBIDDEN_PREFIX}' — the namespace "
                f"already implies it. Received: {raw!r}."
            ),
        )

    if len(raw) > SLUG_MAX_LENGTH:
        return InvalidSlug(
            reason="too_long",
            message=(
                f"Slug exceeds the {SLUG_MAX_LENGTH}-character limit "
                f"({len(raw)} chars). Received: {raw!r}."
            ),
        )

    if raw.startswith("-") or raw.endswith("-"):
        return InvalidSlug(
            reason="leading_or_trailing_hyphen",
            message=f"Slug must not start or end with '-'. Received: {raw!r}.",
        )

    if "--" in raw:
        return InvalidSlug(
            reason="consecutive_hyphens",
            message=f"Slug must not contain consecutive hyphens. Received: {raw!r}.",
        )

    for ch in raw:
        if not (ch.isascii() and (ch.islower() or ch.isdigit() or ch == "-")):
            return InvalidSlug(
                reason="non_ascii_or_uppercase",
                message=(
                    f"Slug must be lowercase ASCII letters, digits, and hyphens only. "
                    f"Received: {raw!r}."
                ),
            )

    return None


def slug_collides_on_master(gateway: BranchMemoryGateway, *, slug: str) -> bool:
    """Return True when ``master`` already carries any key under ``<slug>/``."""
    entries = gateway.list_entries(namespace=OBJECTIVE_NAMESPACE, branch=MASTER_BRANCH)
    prefix = f"{slug}/"
    return any(entry.key.startswith(prefix) for entry in entries)
