from __future__ import annotations

import json

import pytest

from twerk_reviewer.cli.reviewer.exec.format_findings_comment import (
    FindingRow,
    FindingsPayload,
    FindingsPayloadParseError,
    InlinePostingStatus,
    InlinePostingStatusParseError,
    parse_findings_payload_result,
    parse_inline_posting_status_result,
    render_findings_comment,
)


def _single_finding(**overrides: object) -> FindingRow:
    base: dict[str, object] = {
        "path": "app.py",
        "line": 1,
        "severity": "warning",
        "summary": "Avoid print",
        "details": "Use click.echo() instead.",
    }
    base.update(overrides)
    return FindingRow(**base)  # type: ignore[arg-type]


def _payload(
    *,
    review_name: str = "dignified-python",
    base_ref: str = "master",
    findings: tuple[FindingRow, ...] = (),
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


# -- render_findings_comment ------------------------------------------------


def test_render_empty_findings_produces_one_line_body() -> None:
    body = render_findings_comment(_payload())

    assert body.startswith("<!-- twerk-reviewer:dignified-python -->\n")
    assert "## twerk-reviewer · `dignified-python`" in body
    assert "**No findings** against base `master`. ✅" in body
    assert "| Severity |" not in body


def test_render_empty_findings_omits_footer() -> None:
    # Empty case intentionally does not carry the steelthread footer (matches
    # the legacy shell-script shape).
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


def test_render_unknown_severity_is_passed_through() -> None:
    finding = _single_finding(severity="critical")
    body = render_findings_comment(_payload(findings=(finding,)))

    assert "| critical | `app.py` | 1 | Avoid print |" in body


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

    assert "<!-- twerk-reviewer:dignified-python -->" in body
    assert "**Reviewer failed** against base `master`. ⚠️" in body
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
        FindingRow(path="app.py", line=1, severity="warning", summary="s", details="d"),
    )
    assert payload.is_error is False


def test_parse_missing_optional_fields_uses_defaults() -> None:
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
                        # missing summary + details
                    }
                ]
            },
        }
    )
    result = _parse_error(raw)

    assert "finding #0" in result.message


def test_parse_result_returns_error_object_for_envelope_without_exit_code() -> None:
    result = _parse_error(json.dumps({"data": {}}))

    assert "exit_code" in result.message


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
