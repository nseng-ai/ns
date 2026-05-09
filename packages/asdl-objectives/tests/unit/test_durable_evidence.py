"""Unit tests for the ``.durable-evidence.jsonl`` marker parser."""

from __future__ import annotations

from asdl_core.git.types import CommitSummary
from asdl_objectives.durable_evidence import (
    DurableEvidenceRecord,
    parse_durable_evidence,
    records_from_commits,
    serialize_durable_evidence,
)


def test_parse_valid_jsonl_records() -> None:
    marker = parse_durable_evidence(
        '{"schema":1,"sha":"sha-1","patch_id":"pid-1",'
        '"author_iso":"2026-04-26T18:00:00+00:00","subject":"First"}\n'
        '{"schema":1,"sha":"sha-merge","patch_id":null,'
        '"author_iso":"2026-04-26T19:00:00+00:00","subject":"Merge"}\n'
    )

    assert marker.present is True
    assert marker.diagnostics == ()
    assert marker.patch_ids == frozenset({"pid-1"})
    assert [r.sha for r in marker.records] == ["sha-1", "sha-merge"]


def test_parse_ignores_blank_lines() -> None:
    marker = parse_durable_evidence(
        '\n{"schema":1,"sha":"sha-1","patch_id":"pid-1",'
        '"author_iso":"2026-04-26T18:00:00+00:00","subject":"First"}\n\n'
    )

    assert marker.diagnostics == ()
    assert marker.patch_ids == frozenset({"pid-1"})


def test_parse_malformed_line_reports_diagnostic() -> None:
    marker = parse_durable_evidence(
        '{"schema":1,"sha":"sha-1","patch_id":"pid-1",'
        '"author_iso":"2026-04-26T18:00:00+00:00","subject":"First"}\n'
        "not-json\n"
    )

    assert marker.ok is False
    assert len(marker.diagnostics) == 1
    assert marker.diagnostics[0].line == 2
    assert "invalid JSON" in marker.diagnostics[0].message


def test_serialize_records_is_compact_jsonl() -> None:
    content = serialize_durable_evidence(
        (
            DurableEvidenceRecord(
                schema=1,
                sha="sha-1",
                patch_id="pid-1",
                author_iso="2026-04-26T18:00:00+00:00",
                subject="First",
            ),
        )
    )

    assert content == (
        '{"schema":1,"sha":"sha-1","patch_id":"pid-1",'
        '"author_iso":"2026-04-26T18:00:00+00:00","subject":"First"}\n'
    )


def test_records_from_commits_are_oldest_first() -> None:
    commits = (
        CommitSummary(sha="sha-2", author_iso="2026-04-26T19:00:00+00:00", subject="Second"),
        CommitSummary(sha="sha-1", author_iso="2026-04-26T18:00:00+00:00", subject="First"),
    )

    records = records_from_commits(
        commits,
        pid_by_sha={"sha-2": "pid-2", "sha-1": "pid-1"},
    )

    assert [(r.sha, r.patch_id) for r in records] == [
        ("sha-1", "pid-1"),
        ("sha-2", "pid-2"),
    ]
