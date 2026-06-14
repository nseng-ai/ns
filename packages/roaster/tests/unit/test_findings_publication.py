from __future__ import annotations

import json
import re
from typing import Any

import pytest

from roaster.findings_publication import (
    FindingsCommentBodyParseError,
    FindingsPayload,
    FindingsPayloadParseError,
    InlinePostingStatus,
    InlinePostingStatusParseError,
    ParsedFindingsCommentBody,
    extract_inline_markers,
    inline_marker_for_finding,
    parse_findings_comment_body,
    parse_findings_payload_result,
    parse_inline_posting_status_result,
    preserve_activity_log,
    render_findings_comment,
    render_inline_body,
    summary_marker_for_review,
)
from roaster.models import ReviewFinding


def _single_finding(**overrides: object) -> ReviewFinding:
    base: dict[str, Any] = {
        "path": "app.py",
        "line": 1,
        "severity": "warning",
        "summary": "Avoid print",
        "details": "Use click.echo() instead.",
    }
    base.update(overrides)
    return ReviewFinding.from_json_dict(base)


def _payload(
    *,
    review_name: str = "dignified-python",
    base_ref: str = "master",
    findings: tuple[ReviewFinding, ...] = (),
    count: int | None = None,
) -> FindingsPayload:
    return FindingsPayload(
        review_name=review_name,
        base_ref=base_ref,
        count=len(findings) if count is None else count,
        findings=findings,
    )


def _parse_payload(raw: str) -> FindingsPayload:
    result = parse_findings_payload_result(raw)
    assert isinstance(result, FindingsPayload)
    return result


def _parse_error(raw: str) -> FindingsPayloadParseError:
    result = parse_findings_payload_result(raw)
    assert isinstance(result, FindingsPayloadParseError)
    return result


def _parse_inline_status(raw: str) -> InlinePostingStatus:
    result = parse_inline_posting_status_result(raw)
    assert isinstance(result, InlinePostingStatus)
    return result


def _parse_inline_error(raw: str) -> InlinePostingStatusParseError:
    result = parse_inline_posting_status_result(raw)
    assert isinstance(result, InlinePostingStatusParseError)
    return result


def _parse_comment_body(raw: str) -> ParsedFindingsCommentBody:
    result = parse_findings_comment_body(raw)
    assert isinstance(result, ParsedFindingsCommentBody)
    return result


def _parse_comment_body_error(raw: str) -> FindingsCommentBodyParseError:
    result = parse_findings_comment_body(raw)
    assert isinstance(result, FindingsCommentBodyParseError)
    return result


# -- render_findings_comment ------------------------------------------------


def test_render_empty_findings_produces_summary_body() -> None:
    body = render_findings_comment(_payload())

    assert body.startswith("<!-- roaster:dignified-python -->\n")
    assert "## roaster · `dignified-python`" in body
    assert "**No findings** against base `master`. ✅" in body
    assert "| Severity |" not in body


def test_render_empty_findings_omits_footer() -> None:
    body = render_findings_comment(_payload())

    assert "Post-only steelthread" not in body


@pytest.mark.parametrize(
    ("severity", "expected_label"),
    [
        ("error", "⛔ error"),
        ("warning", "⚠️ warning"),
        ("info", "ℹ️ info"),
    ],
)
def test_render_table_row_uses_severity_icon(severity: str, expected_label: str) -> None:
    finding = _single_finding(severity=severity)
    body = render_findings_comment(_payload(findings=(finding,)))

    assert f"| {expected_label} | `app.py` | 1 | Avoid print |" in body


def test_render_null_line_renders_em_dash_and_omits_colon_in_heading() -> None:
    finding = _single_finding(line=None)
    body = render_findings_comment(_payload(findings=(finding,)))

    assert "| ⚠️ warning | `app.py` | — | Avoid print |" in body
    assert "### `app.py` — warning" in body
    assert "`app.py:" not in body


def test_render_multiple_findings_preserves_order_and_pluralizes() -> None:
    first = _single_finding(path="a.py", line=1, summary="A")
    second = _single_finding(path="b.py", line=2, summary="B")
    body = render_findings_comment(_payload(findings=(first, second)))

    assert "**2 findings** against base `master`." in body
    first_pos = body.index("`a.py`")
    second_pos = body.index("`b.py`")
    assert first_pos < second_pos


def test_render_single_finding_uses_singular_noun() -> None:
    body = render_findings_comment(_payload(findings=(_single_finding(),)))

    assert "**1 finding** against base `master`." in body


def test_render_includes_details_block_and_footer() -> None:
    finding = _single_finding(details="Long explanation here.")
    body = render_findings_comment(_payload(findings=(finding,)))

    assert "<details>" in body
    assert "<summary>Details</summary>" in body
    assert "**Avoid print**" in body
    assert "Long explanation here." in body
    assert "</details>" in body
    assert "_Post-only steelthread: this comment never blocks the check._" in body


def test_render_error_payload_flags_failure_without_footer() -> None:
    payload = FindingsPayload(
        review_name="dignified-python",
        base_ref="master",
        count=0,
        findings=(),
        error_type="harness_binary_missing",
        error_message="claude not on PATH",
    )

    body = render_findings_comment(payload)

    assert "<!-- roaster:dignified-python -->" in body
    assert "**Roaster failed** against base `master`. ⚠️" in body
    assert "- **Error type:** `harness_binary_missing`" in body
    assert "- **Message:** claude not on PATH" in body
    assert "Post-only steelthread" not in body


def test_render_inline_posting_status_before_complete_findings_body() -> None:
    finding = _single_finding()
    inline_status = InlinePostingStatus(
        posted_count=2,
        skipped_duplicate_count=1,
        fallback_only_count=3,
    )

    body = render_findings_comment(_payload(findings=(finding,)), inline_status=inline_status)

    assert "### Inline posting" in body
    assert "- **Inline comments posted:** 2" in body
    assert "- **Duplicate inline comments skipped:** 1" in body
    assert "- **Summary-only findings:** 3" in body
    assert "| ⚠️ warning | `app.py` | 1 | Avoid print |" in body
    assert "### `app.py:1` — warning" in body


def test_render_inline_posting_status_includes_api_error() -> None:
    inline_status = InlinePostingStatus(
        posted_count=0,
        skipped_duplicate_count=0,
        fallback_only_count=1,
        api_error="Validation Failed",
    )

    body = render_findings_comment(_payload(), inline_status=inline_status)

    assert "- **API error:** Validation Failed" in body
    assert "**No findings** against base `master`. ✅" in body


# -- parse_findings_payload -------------------------------------------------


def test_parse_success_wrapped_payload() -> None:
    raw = json.dumps(
        {
            "exit_code": 0,
            "data": {
                "review_name": "dignified-python",
                "base_ref": "master",
                "format": "findings",
                "count": 1,
                "findings": [
                    {
                        "path": "app.py",
                        "line": 1,
                        "severity": "warning",
                        "summary": "s",
                        "details": "d",
                    }
                ],
            },
        }
    )

    payload = _parse_payload(raw)

    assert payload.review_name == "dignified-python"
    assert payload.base_ref == "master"
    assert payload.count == 1
    assert payload.findings == (
        ReviewFinding.diff_line(
            path="app.py",
            line=1,
            severity="warning",
            summary="s",
            details="d",
        ),
    )
    assert payload.is_error is False


def test_parse_missing_optional_payload_fields_uses_defaults() -> None:
    payload = _parse_payload(json.dumps({"exit_code": 0, "data": {}}))

    assert payload.review_name == "unknown"
    assert payload.base_ref == "unknown"
    assert payload.findings == ()
    assert payload.count == 0


def test_parse_count_derives_from_findings_when_absent() -> None:
    raw = json.dumps(
        {
            "exit_code": 0,
            "data": {
                "findings": [
                    {
                        "path": "a.py",
                        "line": None,
                        "severity": "info",
                        "summary": "s",
                        "details": "d",
                    }
                ],
            },
        }
    )

    payload = _parse_payload(raw)

    assert payload.count == 1


def test_parse_nonzero_structured_data_preserves_review_metadata() -> None:
    raw = json.dumps(
        {
            "exit_code": 2,
            "message": "Claude Code failed.",
            "data": {
                "review_name": "typescript-style",
                "base_ref": "master",
                "error_type": "harness_execution_failed",
                "message": "prompt too long",
            },
        }
    )

    payload = _parse_payload(raw)

    assert payload.is_error is True
    assert payload.review_name == "typescript-style"
    assert payload.base_ref == "master"
    assert payload.error_type == "harness_execution_failed"
    assert payload.error_message == "prompt too long"
    assert payload.findings == ()


def test_parse_nonzero_structured_nonbudget_failure_preserves_review_metadata() -> None:
    raw = json.dumps(
        {
            "exit_code": 1,
            "message": "Claude Code failed.",
            "data": {
                "review_name": "typescript-style",
                "base_ref": "master",
                "model": "sonnet",
                "error_type": "harness_execution_failed",
                "message": "prompt too long",
            },
        }
    )

    payload = _parse_payload(raw)

    assert payload.is_error is True
    assert payload.review_name == "typescript-style"
    assert payload.base_ref == "master"
    assert payload.error_type == "harness_execution_failed"
    assert payload.error_message == "prompt too long"


def test_parse_error_shape_produces_error_payload() -> None:
    raw = json.dumps(
        {
            "exit_code": 2,
            "error_type": "harness_binary_missing",
            "message": "claude not on PATH",
        }
    )

    payload = _parse_payload(raw)

    assert payload.is_error is True
    assert payload.error_type == "harness_binary_missing"
    assert payload.error_message == "claude not on PATH"


def test_parse_result_returns_error_object_for_non_json() -> None:
    result = _parse_error("not json")

    assert result.error_type == "findings_parse_failed"
    assert "valid JSON" in result.message


def test_parse_result_returns_error_object_for_non_object_root() -> None:
    result = _parse_error("[]")

    assert "JSON object" in result.message


def test_parse_result_returns_error_object_for_envelope_without_exit_code() -> None:
    result = _parse_error(json.dumps({"data": {}}))

    assert "exit_code" in result.message


def test_parse_result_returns_error_object_for_non_object_data() -> None:
    result = _parse_error(json.dumps({"exit_code": 0, "data": []}))

    assert "data" in result.message
    assert "object" in result.message


def test_parse_result_returns_error_object_for_non_list_findings() -> None:
    result = _parse_error(json.dumps({"exit_code": 0, "data": {"findings": "oops"}}))

    assert "findings" in result.message


def test_parse_rejects_finding_missing_required_field() -> None:
    raw = json.dumps(
        {
            "exit_code": 0,
            "data": {
                "findings": [
                    {
                        "path": "a.py",
                        "line": 1,
                        "severity": "warning",
                    }
                ]
            },
        }
    )
    result = _parse_error(raw)

    assert "finding #0" in result.message
    assert "Missing review-finding fields" in result.message


def test_parse_rejects_invalid_finding_from_review_finding_validation() -> None:
    raw = json.dumps(
        {
            "exit_code": 0,
            "data": {
                "findings": [
                    {
                        "path": "app.py",
                        "line": 1,
                        "severity": "warning",
                        "summary": "",
                        "details": "d",
                    }
                ]
            },
        }
    )

    result = _parse_error(raw)

    assert "finding #0" in result.message
    assert "summary" in result.message
    assert "at least 1 character" in result.message


def test_parse_rejects_unknown_severity() -> None:
    raw = json.dumps(
        {
            "exit_code": 0,
            "data": {
                "findings": [
                    {
                        "path": "app.py",
                        "line": 1,
                        "severity": "critical",
                        "summary": "s",
                        "details": "d",
                    }
                ]
            },
        }
    )

    result = _parse_error(raw)

    assert "severity" in result.message
    assert "'info', 'warning' or 'error'" in result.message


def test_parse_rejects_extra_finding_fields() -> None:
    raw = json.dumps(
        {
            "exit_code": 0,
            "data": {
                "findings": [
                    {
                        "path": "app.py",
                        "line": 1,
                        "severity": "warning",
                        "summary": "s",
                        "details": "d",
                        "fingerprint": "extra",
                    }
                ]
            },
        }
    )

    result = _parse_error(raw)

    assert "Unknown review-finding fields: fingerprint" in result.message


def test_parse_negative_envelope_renders_as_error() -> None:
    raw = json.dumps({"exit_code": 1, "message": "boom"})

    payload = _parse_payload(raw)

    assert payload.is_error is True
    assert payload.error_type == "unknown"
    assert payload.error_message == "boom"


# -- parse_inline_posting_status -------------------------------------------


def test_parse_inline_status_from_post_inline_findings_json() -> None:
    status = _parse_inline_status(
        json.dumps(
            {
                "posted_count": 2,
                "skipped_duplicate_count": 1,
                "fallback_only_count": 3,
                "api_error": None,
            }
        )
    )

    assert status == InlinePostingStatus(
        posted_count=2,
        skipped_duplicate_count=1,
        fallback_only_count=3,
        api_error=None,
    )


def test_parse_inline_status_accepts_clinkr_data_envelope() -> None:
    status = _parse_inline_status(
        json.dumps(
            {
                "exit_code": 0,
                "data": {
                    "posted_count": 0,
                    "skipped_duplicate_count": 4,
                    "fallback_only_count": 5,
                    "api_error": "validation failed",
                },
            }
        )
    )

    assert status.api_error == "validation failed"
    assert status.skipped_duplicate_count == 4


def test_parse_inline_status_reports_malformed_json() -> None:
    result = _parse_inline_error("not json")

    assert result.error_type == "inline_posting_parse_failed"
    assert "valid JSON" in result.message


def test_parse_inline_status_rejects_missing_counts() -> None:
    result = _parse_inline_error(json.dumps({"posted_count": 1}))

    assert "skipped_duplicate_count" in result.message


# -- inline marker and body helpers -----------------------------------------


def test_inline_marker_for_finding_uses_stable_public_marker_format() -> None:
    finding = _single_finding()
    marker = inline_marker_for_finding("dignified-python", finding)

    assert re.fullmatch(r"<!-- roaster-inline:dignified-python:[0-9a-f]{16} -->", marker)
    assert inline_marker_for_finding("dignified-python", finding) == marker
    assert inline_marker_for_finding("other-review", finding) != marker


def test_extract_inline_markers_returns_marker_lines_only() -> None:
    marker = inline_marker_for_finding("dignified-python", _single_finding())
    body = f"intro\n  {marker}  \n<!-- unrelated:marker -->\n{marker}\n"

    assert extract_inline_markers(body) == (marker, marker)


def test_render_inline_body_includes_marker_finding_and_footer() -> None:
    finding = _single_finding(details="Use click.echo() instead.")
    marker = inline_marker_for_finding("dignified-python", finding)

    body = render_inline_body(marker, finding, review_name="dignified-python")

    assert body.startswith(f"{marker}\n")
    assert "**warning: Avoid print**" in body
    assert "_Review: `dignified-python`._" in body
    assert "Use click.echo() instead." in body
    assert "_Posted by roaster. Re-running may skip this comment by marker._" in body


# -- summary marker and activity log helpers --------------------------------


def test_summary_marker_for_review_uses_public_marker_format() -> None:
    assert summary_marker_for_review("dignified-python") == ("<!-- roaster:dignified-python -->")


def test_parse_findings_comment_body_extracts_first_line_summary_marker() -> None:
    marker = summary_marker_for_review("dignified-python")
    body = f"{marker}\n## roaster · `dignified-python`\n"

    parsed = _parse_comment_body(body)

    assert parsed.marker == marker
    assert parsed.body == body


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("", "empty"),
        ("not a marker\nbody\n", "first line"),
    ],
)
def test_parse_findings_comment_body_reports_marker_errors(raw: str, expected: str) -> None:
    result = _parse_comment_body_error(raw)

    assert result.error_type == "findings_comment_marker_parse_failed"
    assert expected in result.message


def test_preserve_activity_log_keeps_prior_entries_and_strips_new_body_log() -> None:
    existing_body = "old body\n\n### Activity Log\n\n- previous-run\n"
    new_body = "new body\n\n### Activity Log\n\n- stale-run\n"

    body = preserve_activity_log(existing_body, new_body, run_summary="current-run")

    assert body.startswith("new body\n\n### Activity Log\n")
    assert "previous-run" in body
    assert "current-run" in body
    assert "stale-run" not in body


def test_preserve_activity_log_caps_history_at_ten_entries() -> None:
    prior_entries = "\n".join(f"- old-{index}" for index in range(10))
    existing_body = f"old body\n\n### Activity Log\n\n{prior_entries}\n"

    body = preserve_activity_log(existing_body, "new body\n", run_summary="new-run")
    entries = [line for line in body.splitlines() if line.startswith("- ")]

    assert len(entries) == 10
    assert "- old-0" not in entries
    assert "- old-1" in entries
    assert "- old-9" in entries
    assert "- new-run" in entries
