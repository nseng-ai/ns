"""Pure-string formatting helpers shared across twerk plugins."""

from __future__ import annotations

from datetime import UTC, datetime


def format_relative_time(
    iso_timestamp: str | None,
    now: datetime | None = None,
) -> str:
    """Format an ISO 8601 timestamp as a short relative time.

    Returns strings like ``"just now"``, ``"5m ago"``, ``"2h ago"``,
    ``"3d ago"``, ``"2w ago"``, ``"4mo ago"``, ``"1y ago"``. Returns the empty
    string when ``iso_timestamp`` is ``None`` or fails to parse.

    ``now`` is injectable for deterministic tests; defaults to
    ``datetime.now(UTC)``.
    """
    if iso_timestamp is None:
        return ""

    try:
        dt = datetime.fromisoformat(iso_timestamp.replace("Z", "+00:00"))
    except ValueError:
        return ""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)

    current = now if now is not None else datetime.now(UTC)
    total_seconds = int((current - dt).total_seconds())

    if total_seconds < 30:
        return "just now"
    if total_seconds < 3600:
        return f"{total_seconds // 60}m ago"
    if total_seconds < 86400:
        return f"{total_seconds // 3600}h ago"
    if total_seconds < 604800:  # 7 days
        return f"{total_seconds // 86400}d ago"
    if total_seconds < 2592000:  # 30 days
        return f"{total_seconds // 604800}w ago"
    months = total_seconds // 2592000
    if months < 12:
        return f"{months}mo ago"
    return f"{total_seconds // 31536000}y ago"


def state_badge(state: str) -> str:
    """Return a Rich-markup badge for an issue/PR state.

    The badge pairs a colored bullet with the state label so a glance at the
    column instantly conveys status. State matching is case-insensitive (the
    GitHub CLI returns ``OPEN``/``CLOSED`` in some endpoints and lowercase in
    others). Unknown states render in yellow so they stand out for follow-up.
    """
    normalized = state.lower()
    if normalized == "open":
        return "[bold green]●[/bold green] open"
    if normalized == "closed":
        return "[dim]○ closed[/dim]"
    return f"[yellow]● {normalized}[/yellow]"
