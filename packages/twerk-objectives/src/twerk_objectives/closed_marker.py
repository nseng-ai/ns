"""Read and write the canonical ``.closed`` marker for an objective."""

from __future__ import annotations

import json
from dataclasses import dataclass
from json import JSONDecodeError
from typing import Any

from brmem.gateway import BranchMemoryGateway
from twerk_objectives.discovery import closed_key
from twerk_objectives.gateway_access import OBJECTIVE_NAMESPACE

CLOSED_MARKER_SCHEMA = 1


@dataclass(frozen=True)
class ClosedMarkerDiagnostic:
    """A non-fatal marker parsing diagnostic."""

    message: str


@dataclass(frozen=True)
class ClosedMarker:
    """Parsed ``.closed`` content."""

    present: bool
    closed_at: str | None
    reason: str | None
    diagnostics: tuple[ClosedMarkerDiagnostic, ...]

    @property
    def ok(self) -> bool:
        return not self.diagnostics


def load_closed_marker(
    gateway: BranchMemoryGateway,
    *,
    slug: str,
    trunk_branch: str,
) -> ClosedMarker:
    """Read and parse ``<slug>/.closed`` from the canonical trunk branch."""
    content = gateway.get(OBJECTIVE_NAMESPACE, closed_key(slug), trunk_branch)
    if content is None:
        return ClosedMarker(present=False, closed_at=None, reason=None, diagnostics=())
    return parse_closed_marker(content)


def parse_closed_marker(content: str) -> ClosedMarker:
    """Parse marker content without trusting malformed payloads."""
    try:
        data = json.loads(content)
    except JSONDecodeError as exc:
        return ClosedMarker(
            present=True,
            closed_at=None,
            reason=None,
            diagnostics=(ClosedMarkerDiagnostic(message=f"invalid JSON: {exc.msg}"),),
        )

    if not isinstance(data, dict):
        return ClosedMarker(
            present=True,
            closed_at=None,
            reason=None,
            diagnostics=(ClosedMarkerDiagnostic(message="expected JSON object"),),
        )

    schema = data.get("schema")
    if schema != CLOSED_MARKER_SCHEMA:
        return ClosedMarker(
            present=True,
            closed_at=None,
            reason=None,
            diagnostics=(ClosedMarkerDiagnostic(message=f"unsupported schema: {schema!r}"),),
        )

    closed_at, closed_at_err = _required_str(data, "closed_at")
    reason, reason_err = _optional_str(data, "reason")
    errors = tuple(e for e in (closed_at_err, reason_err) if e is not None)
    if errors:
        return ClosedMarker(
            present=True,
            closed_at=None,
            reason=None,
            diagnostics=tuple(ClosedMarkerDiagnostic(message=msg) for msg in errors),
        )

    return ClosedMarker(
        present=True,
        closed_at=closed_at,
        reason=reason,
        diagnostics=(),
    )


def serialize_closed_marker(*, closed_at: str, reason: str | None) -> str:
    """Serialize a closed marker as a single-line JSON object with trailing newline."""
    payload: dict[str, Any] = {
        "schema": CLOSED_MARKER_SCHEMA,
        "closed_at": closed_at,
        "reason": reason,
    }
    return json.dumps(payload, separators=(",", ":")) + "\n"


def _required_str(data: dict[str, Any], key: str) -> tuple[str, str | None]:
    value = data.get(key)
    if isinstance(value, str) and value:
        return value, None
    return "", f"{key!r} must be a non-empty string"


def _optional_str(data: dict[str, Any], key: str) -> tuple[str | None, str | None]:
    value = data.get(key)
    if value is None:
        return None, None
    if isinstance(value, str) and value:
        return value, None
    return None, f"{key!r} must be a non-empty string or null"
