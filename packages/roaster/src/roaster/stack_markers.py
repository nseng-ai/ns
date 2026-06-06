"""Durable markers for roaster Graphite stack workflow artifacts."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any, TypeAlias

from roaster.stack_slugs import StackSlugError, validate_profile_slug

_STACK_DASHBOARD_MARKER_NAME = "roaster-stack-dashboard"
_STACK_DASHBOARD_MARKER_VERSION = 1


@dataclass(frozen=True)
class StackDashboardMarker:
    """Parsed roaster stack dashboard marker payload."""

    profile_slug: str
    version: int = _STACK_DASHBOARD_MARKER_VERSION


@dataclass(frozen=True)
class StackDashboardMarkerParseError:
    """Non-ideal parse result for malformed roaster stack dashboard markers."""

    message: str
    error_type: str = "stack_dashboard_marker_parse_failed"


StackDashboardMarkerParseResult: TypeAlias = StackDashboardMarker | StackDashboardMarkerParseError


def render_stack_dashboard_marker(profile_slug: str) -> str:
    """Render the canonical dashboard marker with compact deterministic JSON."""
    normalized_profile_slug = validate_profile_slug(profile_slug)
    payload = {"version": _STACK_DASHBOARD_MARKER_VERSION, "profile_slug": normalized_profile_slug}
    payload_json = json.dumps(payload, separators=(",", ":"))
    return f"<!-- {_STACK_DASHBOARD_MARKER_NAME} {payload_json} -->"


def parse_stack_dashboard_marker(raw: str) -> StackDashboardMarkerParseResult:
    """Parse one dashboard marker line."""
    marker = raw.strip()
    match = _marker_pattern().fullmatch(marker)
    if match is None:
        return StackDashboardMarkerParseError(
            message=(
                "expected dashboard marker shaped as "
                f"`<!-- {_STACK_DASHBOARD_MARKER_NAME} {{...}} -->`"
            )
        )

    payload = _parse_marker_payload(match.group("payload"))
    if isinstance(payload, StackDashboardMarkerParseError):
        return payload

    return _parse_marker_object(payload)


def parse_stack_dashboard_marker_from_body(raw: str) -> StackDashboardMarkerParseResult:
    """Parse the first line of a rendered stack dashboard body."""
    lines = raw.splitlines()
    if not lines:
        return StackDashboardMarkerParseError(message="dashboard body is empty")
    return parse_stack_dashboard_marker(lines[0].rstrip("\r"))


def stack_dashboard_marker_for_profile(profile_slug: str) -> str:
    """Return the marker string used to find the persistent dashboard comment."""
    return render_stack_dashboard_marker(profile_slug)


def _parse_marker_payload(raw_payload: str) -> dict[str, Any] | StackDashboardMarkerParseError:
    try:
        payload = json.loads(raw_payload)
    except json.JSONDecodeError as exc:
        return StackDashboardMarkerParseError(message=f"dashboard marker JSON is invalid: {exc}")

    if not isinstance(payload, dict):
        return StackDashboardMarkerParseError(
            message=f"dashboard marker payload must be an object, got {type(payload).__name__}"
        )
    return payload


def _parse_marker_object(payload: dict[str, Any]) -> StackDashboardMarkerParseResult:
    allowed_keys = {"version", "profile_slug"}
    unknown_keys = sorted(set(payload) - allowed_keys)
    if unknown_keys:
        joined = ", ".join(f"`{key}`" for key in unknown_keys)
        return StackDashboardMarkerParseError(
            message=f"dashboard marker payload contains unknown key(s): {joined}"
        )

    version = payload.get("version")
    if version != _STACK_DASHBOARD_MARKER_VERSION:
        return StackDashboardMarkerParseError(
            message=(
                "dashboard marker payload field `version` must be "
                f"{_STACK_DASHBOARD_MARKER_VERSION}; got {version!r}"
            )
        )

    profile_slug = payload.get("profile_slug")
    if not isinstance(profile_slug, str):
        return StackDashboardMarkerParseError(
            message="dashboard marker payload field `profile_slug` must be a string"
        )

    try:
        normalized_profile_slug = validate_profile_slug(profile_slug)
    except StackSlugError as exc:
        return StackDashboardMarkerParseError(message=str(exc))

    return StackDashboardMarker(profile_slug=normalized_profile_slug)


def _marker_pattern() -> re.Pattern[str]:
    return re.compile(rf"^<!-- {_STACK_DASHBOARD_MARKER_NAME} (?P<payload>.+) -->$")
