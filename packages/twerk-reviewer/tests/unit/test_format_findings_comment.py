from __future__ import annotations

import json

import pytest

from twerk_reviewer.cli.reviewer.exec.format_findings_comment import (
    FindingRow,
    FindingsParseError,
    FindingsPayload,
    parse_findings_payload,
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

    payload = parse_findings_payload(raw)

    assert payload.review_name == "dignified-python"
    assert payload.base_ref == "master"
    assert payload.count == 1
    assert payload.findings == (
        FindingRow(path="app.py", line=1, severity="warning", summary="s", details="d"),
    )
    assert payload.is_error is False


def test_parse_missing_optional_fields_uses_defaults() -> None:
    payload = parse_findings_payload(json.dumps({"exit_code": 0, "data": {}}))

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

    payload = parse_findings_payload(raw)

    assert payload.count == 1


def test_parse_error_shape_produces_error_payload() -> None:
    raw = json.dumps(
        {
            "exit_code": 2,
            "error_type": "harness_binary_missing",
            "message": "claude not on PATH",
        }
    )

    payload = parse_findings_payload(raw)

    assert payload.is_error is True
    assert payload.error_type == "harness_binary_missing"
    assert payload.error_message == "claude not on PATH"


def test_parse_rejects_non_json() -> None:
    with pytest.raises(FindingsParseError, match="valid JSON"):
        parse_findings_payload("not json")


def test_parse_rejects_non_object_root() -> None:
    with pytest.raises(FindingsParseError, match="JSON object"):
        parse_findings_payload("[]")


def test_parse_rejects_non_list_findings() -> None:
    with pytest.raises(FindingsParseError, match="findings"):
        parse_findings_payload(json.dumps({"exit_code": 0, "data": {"findings": "oops"}}))


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
    with pytest.raises(FindingsParseError, match="finding #0"):
        parse_findings_payload(raw)


def test_parse_rejects_envelope_without_exit_code() -> None:
    with pytest.raises(FindingsParseError, match="exit_code"):
        parse_findings_payload(json.dumps({"data": {}}))


def test_parse_negative_envelope_renders_as_error() -> None:
    raw = json.dumps({"exit_code": 1, "message": "boom"})

    payload = parse_findings_payload(raw)

    assert payload.is_error is True
    assert payload.error_type == "unknown"
    assert payload.error_message == "boom"
