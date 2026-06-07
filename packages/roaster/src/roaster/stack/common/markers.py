"""Durable markers for roaster Graphite stack workflow artifacts."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any, TypeAlias

from roaster.stack.core.slugs import (
    StackSlugError,
    validate_batch_slug,
    validate_branch_memory_branch_name,
    validate_generated_branch_name,
    validate_profile_slug,
    validate_run_slug,
)

_STACK_DASHBOARD_MARKER_NAME = "roaster-stack-dashboard"
_STACK_DASHBOARD_MARKER_VERSION = 1
_STACK_GENERATED_PR_MARKER_NAME = "roaster-stack-generated-pr"
_STACK_GENERATED_PR_MARKER_VERSION = 1


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


@dataclass(frozen=True)
class GeneratedPrBranchMemoryLocator:
    """Branch Memory pointer for one generated resolver artifact."""

    namespace: str
    branch: str
    key: str


@dataclass(frozen=True)
class StackGeneratedPrMarker:
    """Parsed roaster marker embedded in generated resolution PR bodies."""

    profile_slug: str
    run_slug: str
    batch_slug: str
    implementation_branch: str
    implementation_pr: str | None
    finding_ids: tuple[str, ...]
    branch_memory_namespace: str
    branch_memory_branch: str
    branch_memory_key: str
    version: int = _STACK_GENERATED_PR_MARKER_VERSION


@dataclass(frozen=True)
class StackGeneratedPrMarkerParseError:
    """Non-ideal parse result for malformed generated PR markers."""

    message: str
    error_type: str = "stack_generated_pr_marker_parse_failed"


@dataclass(frozen=True)
class GeneratedPrBodyRequest:
    """Input facts for rendering a generated roaster resolution PR body."""

    implementation_branch: str
    implementation_pr: str | None
    profile_slug: str
    run_slug: str
    batch_slug: str
    batch_title: str
    batch_summary: str
    finding_ids: tuple[str, ...]
    validation_summary: str | None
    branch_memory: GeneratedPrBranchMemoryLocator
    dashboard_pointer: str | None = None


StackGeneratedPrMarkerParseResult: TypeAlias = (
    StackGeneratedPrMarker | StackGeneratedPrMarkerParseError
)


def render_stack_generated_pr_marker(
    *,
    implementation_branch: str,
    implementation_pr: str | None,
    profile_slug: str,
    run_slug: str,
    batch_slug: str,
    finding_ids: tuple[str, ...],
    branch_memory: GeneratedPrBranchMemoryLocator,
) -> str:
    """Render the canonical generated PR marker with compact deterministic JSON."""
    normalized = _normalized_generated_pr_marker_fields(
        implementation_branch=implementation_branch,
        implementation_pr=implementation_pr,
        profile_slug=profile_slug,
        run_slug=run_slug,
        batch_slug=batch_slug,
        finding_ids=finding_ids,
        branch_memory=branch_memory,
    )
    payload = {
        "version": _STACK_GENERATED_PR_MARKER_VERSION,
        "implementation_branch": normalized.implementation_branch,
        "implementation_pr": normalized.implementation_pr,
        "profile_slug": normalized.profile_slug,
        "run_slug": normalized.run_slug,
        "batch_slug": normalized.batch_slug,
        "finding_ids": list(normalized.finding_ids),
        "branch_memory_namespace": normalized.branch_memory_namespace,
        "branch_memory_branch": normalized.branch_memory_branch,
        "branch_memory_key": normalized.branch_memory_key,
    }
    payload_json = json.dumps(payload, separators=(",", ":"))
    return f"<!-- {_STACK_GENERATED_PR_MARKER_NAME} {payload_json} -->"


def parse_stack_generated_pr_marker(raw: str) -> StackGeneratedPrMarkerParseResult:
    """Parse one generated PR marker line."""
    marker = raw.strip()
    match = _generated_pr_marker_pattern().fullmatch(marker)
    if match is None:
        return StackGeneratedPrMarkerParseError(
            message=(
                "expected generated PR marker shaped as "
                f"`<!-- {_STACK_GENERATED_PR_MARKER_NAME} {{...}} -->`"
            )
        )

    payload = _parse_generated_pr_payload(match.group("payload"))
    if isinstance(payload, StackGeneratedPrMarkerParseError):
        return payload
    return _parse_generated_pr_object(payload)


def parse_stack_generated_pr_marker_from_body(raw: str) -> StackGeneratedPrMarkerParseResult:
    """Parse the first line of a rendered generated PR body."""
    lines = raw.splitlines()
    if not lines:
        return StackGeneratedPrMarkerParseError(message="generated PR body is empty")
    return parse_stack_generated_pr_marker(lines[0].rstrip("\r"))


def render_generated_pr_body(request: GeneratedPrBodyRequest) -> str:
    """Render the human generated PR body without publishing it."""
    marker = render_stack_generated_pr_marker(
        implementation_branch=request.implementation_branch,
        implementation_pr=request.implementation_pr,
        profile_slug=request.profile_slug,
        run_slug=request.run_slug,
        batch_slug=request.batch_slug,
        finding_ids=request.finding_ids,
        branch_memory=request.branch_memory,
    )
    lines = [
        marker,
        f"## roaster stack resolution · {request.batch_slug}",
        "",
        "### Source implementation",
        "",
        f"- **Branch:** `{request.implementation_branch}`",
        f"- **PR:** {_value_or_dash(request.implementation_pr)}",
        f"- **Profile:** `{request.profile_slug}`",
        f"- **Run:** `{request.run_slug}`",
        "",
        "### Batch",
        "",
        f"- **Title:** {request.batch_title}",
        f"- **Summary:** {request.batch_summary}",
        f"- **Findings:** {_tuple_code_or_dash(request.finding_ids)}",
        "",
        "### Validation",
        "",
        request.validation_summary or "Not reported yet.",
        "",
        "### Run artifacts",
        "",
        (
            "- **Branch Memory:** "
            f"`{request.branch_memory.namespace}` / `{request.branch_memory.key}` "
            f"on `{request.branch_memory.branch}`"
        ),
    ]
    if request.dashboard_pointer is not None and request.dashboard_pointer:
        lines.append(f"- **Dashboard:** {request.dashboard_pointer}")
    return "\n".join(lines).rstrip() + "\n"


def _normalized_generated_pr_marker_fields(
    *,
    implementation_branch: str,
    implementation_pr: str | None,
    profile_slug: str,
    run_slug: str,
    batch_slug: str,
    finding_ids: tuple[str, ...],
    branch_memory: GeneratedPrBranchMemoryLocator,
) -> StackGeneratedPrMarker:
    return StackGeneratedPrMarker(
        implementation_branch=validate_generated_branch_name(implementation_branch),
        implementation_pr=_normalize_optional_pr(implementation_pr),
        profile_slug=validate_profile_slug(profile_slug),
        run_slug=validate_run_slug(run_slug),
        batch_slug=validate_batch_slug(batch_slug),
        finding_ids=_validate_finding_ids(finding_ids),
        branch_memory_namespace=_validate_nonempty_text(
            branch_memory.namespace,
            label="Branch Memory namespace",
        ),
        branch_memory_branch=validate_branch_memory_branch_name(branch_memory.branch),
        branch_memory_key=_validate_nonempty_text(branch_memory.key, label="Branch Memory key"),
    )


def _parse_generated_pr_payload(
    raw_payload: str,
) -> dict[str, Any] | StackGeneratedPrMarkerParseError:
    try:
        payload = json.loads(raw_payload)
    except json.JSONDecodeError as exc:
        return StackGeneratedPrMarkerParseError(
            message=f"generated PR marker JSON is invalid: {exc}"
        )

    if not isinstance(payload, dict):
        return StackGeneratedPrMarkerParseError(
            message=f"generated PR marker payload must be an object, got {type(payload).__name__}"
        )
    return payload


def _parse_generated_pr_object(payload: dict[str, Any]) -> StackGeneratedPrMarkerParseResult:
    allowed_keys = {
        "version",
        "implementation_branch",
        "implementation_pr",
        "profile_slug",
        "run_slug",
        "batch_slug",
        "finding_ids",
        "branch_memory_namespace",
        "branch_memory_branch",
        "branch_memory_key",
    }
    unknown_keys = sorted(set(payload) - allowed_keys)
    if unknown_keys:
        joined = ", ".join(f"`{key}`" for key in unknown_keys)
        return StackGeneratedPrMarkerParseError(
            message=f"generated PR marker payload contains unknown key(s): {joined}"
        )

    version = payload.get("version")
    if version != _STACK_GENERATED_PR_MARKER_VERSION:
        return StackGeneratedPrMarkerParseError(
            message=(
                "generated PR marker payload field `version` must be "
                f"{_STACK_GENERATED_PR_MARKER_VERSION}; got {version!r}"
            )
        )

    finding_ids = payload.get("finding_ids")
    if not isinstance(finding_ids, list) or not all(
        isinstance(finding_id, str) for finding_id in finding_ids
    ):
        return StackGeneratedPrMarkerParseError(
            message="generated PR marker payload field `finding_ids` must be a string list"
        )

    try:
        return _normalized_generated_pr_marker_fields(
            implementation_branch=_required_string(payload, "implementation_branch"),
            implementation_pr=_optional_string(payload, "implementation_pr"),
            profile_slug=_required_string(payload, "profile_slug"),
            run_slug=_required_string(payload, "run_slug"),
            batch_slug=_required_string(payload, "batch_slug"),
            finding_ids=tuple(finding_ids),
            branch_memory=GeneratedPrBranchMemoryLocator(
                namespace=_required_string(payload, "branch_memory_namespace"),
                branch=_required_string(payload, "branch_memory_branch"),
                key=_required_string(payload, "branch_memory_key"),
            ),
        )
    except StackSlugError as exc:
        return StackGeneratedPrMarkerParseError(message=str(exc))
    except ValueError as exc:
        return StackGeneratedPrMarkerParseError(message=str(exc))


def _required_string(payload: dict[str, Any], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str):
        raise ValueError(f"generated PR marker payload field `{key}` must be a string")
    return value


def _optional_string(payload: dict[str, Any], key: str) -> str | None:
    value = payload.get(key)
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError(f"generated PR marker payload field `{key}` must be a string or null")
    return value


def _normalize_optional_pr(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    if not normalized:
        return None
    if normalized != value:
        raise StackSlugError("Roaster implementation PR must not have surrounding whitespace.")
    return normalized


def _validate_finding_ids(finding_ids: tuple[str, ...]) -> tuple[str, ...]:
    normalized_ids: list[str] = []
    for finding_id in finding_ids:
        normalized_ids.append(_validate_nonempty_text(finding_id, label="finding ID"))
    return tuple(normalized_ids)


def _validate_nonempty_text(value: str, *, label: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise StackSlugError(f"Roaster {label} must not be empty.")
    if normalized != value:
        raise StackSlugError(f"Roaster {label} must not have surrounding whitespace.")
    return normalized


def _generated_pr_marker_pattern() -> re.Pattern[str]:
    return re.compile(rf"^<!-- {_STACK_GENERATED_PR_MARKER_NAME} (?P<payload>.+) -->$")


def _tuple_code_or_dash(values: tuple[str, ...]) -> str:
    if not values:
        return "-"
    return ", ".join(f"`{value}`" for value in values)


def _value_or_dash(value: str | None) -> str:
    if value is None or not value:
        return "-"
    return value
