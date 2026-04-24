"""Unit tests for the `post-findings-check` exec command."""

from __future__ import annotations

import pytest

from twerk_reviewer.cli.reviewer.exec.findings_payload import FindingRow
from twerk_reviewer.cli.reviewer.exec.post_findings_check import (
    _MESSAGE_MAX,
    _TITLE_MAX,
    build_annotation,
    severity_to_annotation_level,
)


@pytest.mark.parametrize(
    ("severity", "expected"),
    [
        ("error", "failure"),
        ("warning", "warning"),
        ("info", "notice"),
    ],
)
def test_severity_to_annotation_level_known_values(severity: str, expected: str) -> None:
    assert severity_to_annotation_level(severity) == expected


def test_severity_to_annotation_level_unknown_falls_back_to_notice() -> None:
    """Unknown severities degrade to 'notice' rather than blocking publish.

    Honors invariant #2 (full visibility): better to surface a finding with a
    muted level than drop it because of a schema drift we didn't anticipate.
    """
    assert severity_to_annotation_level("fatal") == "notice"
    assert severity_to_annotation_level("") == "notice"


def test_build_annotation_requires_concrete_line() -> None:
    finding = FindingRow(
        path="a.py",
        line=None,
        severity="warning",
        summary="s",
        details="d",
    )
    with pytest.raises(ValueError, match="requires a finding with a concrete line"):
        build_annotation(finding)


def test_build_annotation_single_line_range() -> None:
    finding = FindingRow(
        path="a.py",
        line=5,
        severity="warning",
        summary="summary text",
        details="details text",
    )
    annotation = build_annotation(finding)
    assert annotation.path == "a.py"
    # Single-line finding: start == end.
    assert annotation.start_line == 5
    assert annotation.end_line == 5
    assert annotation.annotation_level == "warning"
    assert annotation.message == "details text"
    assert annotation.title == "summary text"


def test_build_annotation_falls_back_to_summary_when_details_empty() -> None:
    """Empty `details` is atypical but handled — we still need a message."""
    finding = FindingRow(
        path="a.py",
        line=5,
        severity="info",
        summary="brief summary",
        details="",
    )
    annotation = build_annotation(finding)
    assert annotation.message == "brief summary"


def test_build_annotation_truncates_title_to_github_cap() -> None:
    long_summary = "x" * (_TITLE_MAX + 100)
    finding = FindingRow(
        path="a.py",
        line=1,
        severity="warning",
        summary=long_summary,
        details="d",
    )
    annotation = build_annotation(finding)
    assert annotation.title is not None
    assert len(annotation.title) == _TITLE_MAX


def test_build_annotation_truncates_message_to_github_cap() -> None:
    long_details = "y" * (_MESSAGE_MAX + 100)
    finding = FindingRow(
        path="a.py",
        line=1,
        severity="warning",
        summary="s",
        details=long_details,
    )
    annotation = build_annotation(finding)
    assert len(annotation.message) == _MESSAGE_MAX


def test_build_annotation_empty_summary_leaves_title_none() -> None:
    finding = FindingRow(
        path="a.py",
        line=1,
        severity="warning",
        summary="",
        details="d",
    )
    annotation = build_annotation(finding)
    assert annotation.title is None
