"""Unit tests for the ``.closed`` marker parser/serializer."""

from __future__ import annotations

from asdl_objectives.closed_marker import (
    CLOSED_MARKER_SCHEMA,
    parse_closed_marker,
    serialize_closed_marker,
)


def test_round_trip_with_reason() -> None:
    serialized = serialize_closed_marker(
        closed_at="2026-04-29T12:00:00+00:00",
        reason="shipped",
    )
    marker = parse_closed_marker(serialized)

    assert marker.present is True
    assert marker.ok is True
    assert marker.closed_at == "2026-04-29T12:00:00+00:00"
    assert marker.reason == "shipped"


def test_round_trip_without_reason() -> None:
    serialized = serialize_closed_marker(
        closed_at="2026-04-29T12:00:00+00:00",
        reason=None,
    )
    marker = parse_closed_marker(serialized)

    assert marker.ok is True
    assert marker.closed_at == "2026-04-29T12:00:00+00:00"
    assert marker.reason is None


def test_invalid_json_yields_diagnostic() -> None:
    marker = parse_closed_marker("not json")

    assert marker.present is True
    assert marker.ok is False
    assert "invalid JSON" in marker.diagnostics[0].message
    assert marker.closed_at is None


def test_unsupported_schema_yields_diagnostic() -> None:
    marker = parse_closed_marker(f'{{"schema":{CLOSED_MARKER_SCHEMA + 1},"closed_at":"x"}}')

    assert marker.ok is False
    assert "unsupported schema" in marker.diagnostics[0].message


def test_missing_closed_at_yields_diagnostic() -> None:
    marker = parse_closed_marker(f'{{"schema":{CLOSED_MARKER_SCHEMA}}}')

    assert marker.ok is False
    assert any("closed_at" in d.message for d in marker.diagnostics)


def test_serialize_emits_trailing_newline() -> None:
    text = serialize_closed_marker(closed_at="2026-04-29T12:00:00+00:00", reason=None)
    assert text.endswith("\n")
