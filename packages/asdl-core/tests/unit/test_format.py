from __future__ import annotations

from datetime import UTC, datetime, timedelta

from asdl_core.format import format_relative_time, state_badge

NOW = datetime(2026, 4, 10, 12, 0, 0, tzinfo=UTC)


def _ago(**kwargs: float) -> str:
    return (NOW - timedelta(**kwargs)).isoformat()


def test_relative_time_just_now() -> None:
    assert format_relative_time(_ago(seconds=5), now=NOW) == "just now"


def test_relative_time_minutes() -> None:
    assert format_relative_time(_ago(minutes=5), now=NOW) == "5m ago"


def test_relative_time_hours() -> None:
    assert format_relative_time(_ago(hours=2), now=NOW) == "2h ago"


def test_relative_time_days() -> None:
    assert format_relative_time(_ago(days=3), now=NOW) == "3d ago"


def test_relative_time_weeks() -> None:
    assert format_relative_time(_ago(days=14), now=NOW) == "2w ago"


def test_relative_time_months() -> None:
    assert format_relative_time(_ago(days=120), now=NOW) == "4mo ago"


def test_relative_time_years() -> None:
    assert format_relative_time(_ago(days=400), now=NOW) == "1y ago"


def test_relative_time_handles_zulu_suffix() -> None:
    assert format_relative_time("2026-04-10T11:00:00Z", now=NOW) == "1h ago"


def test_relative_time_none() -> None:
    assert format_relative_time(None) == ""


def test_relative_time_invalid() -> None:
    assert format_relative_time("not-a-date") == ""


def test_state_badge_open() -> None:
    assert state_badge("open") == "[bold green]●[/bold green] open"


def test_state_badge_closed() -> None:
    assert state_badge("closed") == "[dim]○ closed[/dim]"


def test_state_badge_other() -> None:
    assert state_badge("merged") == "[yellow]● merged[/yellow]"


def test_state_badge_uppercase_open() -> None:
    assert state_badge("OPEN") == "[bold green]●[/bold green] open"


def test_state_badge_uppercase_closed() -> None:
    assert state_badge("CLOSED") == "[dim]○ closed[/dim]"
