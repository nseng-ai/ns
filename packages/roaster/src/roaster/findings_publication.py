"""Pure findings-publication helpers for roaster PR comments."""

from __future__ import annotations

import functools
import hashlib
import json
import re
from dataclasses import dataclass
from typing import Any, TypeAlias

from roaster.models import DiffLineLocation, ReviewFinding, TargetKind

_SEVERITY_LABELS: dict[str, str] = {
    "error": "⛔ error",
    "warning": "⚠️ warning",
    "info": "ℹ️ info",
}

_FOOTER = "_Post-only steelthread: this comment never blocks the check._"
_INLINE_MARKER_PREFIX = "roaster-inline"
_ACTIVITY_LOG_HEADING = "### Activity Log"
_ACTIVITY_LOG_CAP = 10


@dataclass(frozen=True)
class FindingsPayloadParseError:
    """Non-ideal parse result for malformed findings JSON input."""

    message: str
    error_type: str = "findings_parse_failed"


@dataclass(frozen=True)
class FindingsPublicationPolicyError:
    """Non-ideal result for valid findings payloads that cannot be published to a PR."""

    message: str
    error_type: str = "findings_publication_policy_failed"


@dataclass(frozen=True)
class InlinePostingStatusParseError:
    """Non-ideal parse result for malformed inline-posting JSON input."""

    message: str
    error_type: str = "inline_posting_parse_failed"


@dataclass(frozen=True)
class FindingsCommentBodyParseError:
    """Non-ideal parse result for a rendered findings comment body."""

    message: str
    error_type: str = "findings_comment_marker_parse_failed"


@dataclass(frozen=True)
class FindingsPayload:
    review_name: str
    base_ref: str
    count: int
    findings: tuple[ReviewFinding, ...]
    target_kind: TargetKind = "diff"
    target_label: str | None = None
    target_source_path: str | None = None
    error_type: str | None = None
    error_message: str | None = None

    @property
    def is_error(self) -> bool:
        return self.error_type is not None


@dataclass(frozen=True)
class InlinePostingStatus:
    posted_count: int
    skipped_duplicate_count: int
    fallback_only_count: int
    api_error: str | None = None


@dataclass(frozen=True)
class ParsedFindingsCommentBody:
    marker: str
    body: str


FindingsPayloadParseResult: TypeAlias = FindingsPayload | FindingsPayloadParseError
PublishableFindingsPayloadResult: TypeAlias = (
    FindingsPayload | FindingsPayloadParseError | FindingsPublicationPolicyError
)
InlinePostingStatusParseResult: TypeAlias = InlinePostingStatus | InlinePostingStatusParseError
FindingsCommentBodyParseResult: TypeAlias = (
    ParsedFindingsCommentBody | FindingsCommentBodyParseError
)


def parse_findings_payload_result(raw: str) -> FindingsPayloadParseResult:
    """Parse a roaster clinkr envelope, returning a payload or error object."""
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        return FindingsPayloadParseError(message=f"input is not valid JSON: {exc}")

    if not isinstance(data, dict):
        return FindingsPayloadParseError(
            message=f"expected a JSON object at top level, got {type(data).__name__}"
        )

    if "exit_code" not in data:
        return FindingsPayloadParseError(
            message="expected a clinkr envelope with top-level 'exit_code'"
        )

    exit_code = data.get("exit_code")
    if exit_code != 0:
        return FindingsPayload(
            review_name="unknown",
            base_ref="unknown",
            count=0,
            findings=(),
            error_type=_coerce_str(data.get("error_type"), default="unknown"),
            error_message=_coerce_str(data.get("message"), default=""),
        )

    inner = data.get("data")
    if not isinstance(inner, dict):
        return FindingsPayloadParseError(message="`data` must be an object when `exit_code` is 0")

    review_name = _coerce_str(inner.get("review_name"), default="unknown")
    base_ref = _coerce_str(inner.get("base_ref"), default="unknown")
    target_metadata = _parse_target_metadata(inner)
    if isinstance(target_metadata, FindingsPayloadParseError):
        return target_metadata
    target_kind, target_label, target_source_path = target_metadata

    raw_findings = inner.get("findings", [])
    if not isinstance(raw_findings, list):
        return FindingsPayloadParseError(message="`findings` must be a list when present")

    findings: list[ReviewFinding] = []
    for index, item in enumerate(raw_findings):
        parsed_finding = _parse_finding_result(item, index=index)
        if isinstance(parsed_finding, FindingsPayloadParseError):
            return parsed_finding
        findings.append(parsed_finding)

    count = inner.get("count")
    if not isinstance(count, int):
        count = len(findings)

    return FindingsPayload(
        review_name=review_name,
        base_ref=base_ref,
        count=count,
        findings=tuple(findings),
        target_kind=target_kind,
        target_label=target_label,
        target_source_path=target_source_path,
    )


def parse_inline_posting_status_result(raw: str) -> InlinePostingStatusParseResult:
    """Parse JSON emitted by ``roaster exec post-inline-findings``."""
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        return InlinePostingStatusParseError(message=f"inline result is not valid JSON: {exc}")

    if not isinstance(data, dict):
        return InlinePostingStatusParseError(
            message=f"expected inline result JSON object, got {type(data).__name__}"
        )

    status_data: Any = data
    if "data" in data:
        status_data = data["data"]
        if not isinstance(status_data, dict):
            return InlinePostingStatusParseError(message="inline result `data` must be an object")

    return _parse_inline_posting_status_object(status_data)


def parse_publishable_diff_findings_payload_result(raw: str) -> PublishableFindingsPayloadResult:
    """Parse findings JSON and reject valid local-only findings before PR publication."""
    payload = parse_findings_payload_result(raw)
    if isinstance(payload, FindingsPayloadParseError):
        return payload
    return ensure_publishable_diff_payload(payload)


def ensure_publishable_diff_payload(
    payload: FindingsPayload,
) -> FindingsPayload | FindingsPublicationPolicyError:
    """Reject local-only document review payloads before PR publication."""
    if payload.target_kind != "diff":
        return FindingsPublicationPolicyError(
            message=(
                "document review findings are local-output only "
                "and cannot be published as PR comments"
            )
        )
    for finding in payload.findings:
        if not isinstance(finding.location, DiffLineLocation):
            return FindingsPublicationPolicyError(
                message=(
                    "PR comment publication requires diff-line finding locations; "
                    f"got {finding.location.kind!r}"
                )
            )
    return payload


def render_findings_comment(
    payload: FindingsPayload,
    *,
    inline_status: InlinePostingStatus | None = None,
) -> str:
    """Render the payload as a Markdown comment body."""
    marker = summary_marker_for_review(payload.review_name)
    heading = f"## roaster · `{payload.review_name}`"
    lines: list[str] = [marker, heading, ""]

    if inline_status is not None:
        lines.extend(_render_inline_posting_status(inline_status))
        lines.append("")

    if payload.is_error:
        lines.extend(_render_error_body(payload))
    elif payload.count == 0:
        lines.append(f"**No findings** against base `{payload.base_ref}`. ✅")
    else:
        lines.extend(_render_findings_body(payload))

    return "\n".join(lines)


def summary_marker_for_review(review_name: str) -> str:
    return f"<!-- roaster:{review_name} -->"


def parse_findings_comment_body(raw: str) -> FindingsCommentBodyParseResult:
    lines = raw.splitlines()
    if not lines:
        return FindingsCommentBodyParseError(message="input body is empty")

    match = _get_summary_marker_pattern().match(lines[0].rstrip("\r"))
    if match is None:
        return FindingsCommentBodyParseError(
            message="first line of body must be a `<!-- roaster:<key> -->` marker"
        )

    return ParsedFindingsCommentBody(marker=f"<!-- {match.group(1)} -->", body=raw)


def preserve_activity_log(existing_body: str, new_body: str, run_summary: str) -> str:
    """Merge a new Activity Log entry into ``new_body`` from ``existing_body``."""
    prior_entries = _extract_activity_log_entries(existing_body)
    entries = list(prior_entries) + [run_summary]
    entries = entries[-_ACTIVITY_LOG_CAP:]

    base = _strip_activity_log(new_body).rstrip()
    rendered = [base, "", _ACTIVITY_LOG_HEADING, ""]
    rendered.extend(f"- {entry}" for entry in entries)
    return "\n".join(rendered) + "\n"


def inline_marker_for_finding(review_name: str, finding: ReviewFinding) -> str:
    location_discriminator = ""
    if not isinstance(finding.location, DiffLineLocation):
        location_discriminator = json.dumps(
            finding.location.model_dump(mode="json"),
            sort_keys=True,
            separators=(",", ":"),
        )
    digest_input = "\0".join(
        (
            review_name,
            finding.path or "",
            "" if finding.line is None else str(finding.line),
            location_discriminator,
            finding.severity,
            finding.summary,
            finding.details,
        )
    )
    digest = hashlib.sha256(digest_input.encode("utf-8")).hexdigest()[:16]
    return f"<!-- {_INLINE_MARKER_PREFIX}:{review_name}:{digest} -->"


def extract_inline_markers(body: str) -> tuple[str, ...]:
    markers: list[str] = []
    for line in body.splitlines():
        stripped = line.strip()
        if stripped.startswith(f"<!-- {_INLINE_MARKER_PREFIX}:") and stripped.endswith(" -->"):
            markers.append(stripped)
    return tuple(markers)


def render_inline_body(marker: str, finding: ReviewFinding, *, review_name: str) -> str:
    return "\n".join(
        [
            marker,
            f"**{finding.severity}: {finding.summary}**",
            f"_Review: `{review_name}`._",
            "",
            finding.details,
            "",
            "_Posted by roaster. Re-running may skip this comment by marker._",
        ]
    )


@functools.cache
def _get_summary_marker_pattern() -> re.Pattern[str]:
    return re.compile(r"^<!-- (roaster:[^ ]+) -->$")


def _render_inline_posting_status(status: InlinePostingStatus) -> list[str]:
    lines = [
        "### Inline posting",
        "",
        f"- **Inline comments posted:** {status.posted_count}",
        f"- **Duplicate inline comments skipped:** {status.skipped_duplicate_count}",
        f"- **Summary-only findings:** {status.fallback_only_count}",
    ]
    if status.api_error is not None:
        lines.append(f"- **API error:** {status.api_error}")
    return lines


def _render_error_body(payload: FindingsPayload) -> list[str]:
    return [
        f"**Roaster failed** against base `{payload.base_ref}`. ⚠️",
        "",
        f"- **Error type:** `{payload.error_type}`",
        f"- **Message:** {payload.error_message or '(none)'}",
    ]


def _render_findings_body(payload: FindingsPayload) -> list[str]:
    noun = "finding" if payload.count == 1 else "findings"
    body: list[str] = [
        f"**{payload.count} {noun}** against base `{payload.base_ref}`.",
        "",
        "| Severity | File | Line | Summary |",
        "| --- | --- | --- | --- |",
    ]
    body.extend(_finding_table_row(finding) for finding in payload.findings)
    body.extend(["", "<details>", "<summary>Details</summary>", ""])
    for finding in payload.findings:
        location = _finding_location(finding)
        body.extend(
            [
                f"### `{location}` — {finding.severity}",
                f"**{finding.summary}**",
                "",
                finding.details,
                "",
            ]
        )
    body.extend(["</details>", "", _FOOTER])
    return body


def _finding_table_row(finding: ReviewFinding) -> str:
    return (
        f"| {_severity_label(finding.severity)} | `{_path_display(finding.path)}` | "
        f"{_line_display(finding.line)} | {finding.summary} |"
    )


def _finding_location(finding: ReviewFinding) -> str:
    if finding.line is None:
        return _path_display(finding.path)
    return f"{_path_display(finding.path)}:{finding.line}"


def _severity_label(severity: str) -> str:
    return _SEVERITY_LABELS.get(severity, severity)


def _line_display(line: int | None) -> str:
    return "—" if line is None else str(line)


def _path_display(path: str | None) -> str:
    return "—" if path is None else path


def _coerce_str(value: Any, *, default: str) -> str:
    if isinstance(value, str) and value:
        return value
    return default


def _parse_target_metadata(
    inner: dict[str, Any],
) -> tuple[TargetKind, str | None, str | None] | FindingsPayloadParseError:
    target = inner.get("target")
    if target is not None:
        if not isinstance(target, dict):
            return FindingsPayloadParseError(message="`target` must be an object when present")
        raw_kind = target.get("kind", "diff")
        raw_label = target.get("label")
        raw_source_path = target.get("source_path")
    else:
        raw_kind = inner.get("target_kind", "diff")
        raw_label = inner.get("target_label")
        raw_source_path = inner.get("target_source_path")
    if raw_kind == "diff":
        target_kind: TargetKind = "diff"
    elif raw_kind == "document":
        target_kind = "document"
    else:
        return FindingsPayloadParseError(
            message="target kind must be either `diff` or `document` when present"
        )

    target_label = _optional_str(raw_label, field_name="target label")
    if isinstance(target_label, FindingsPayloadParseError):
        return target_label
    target_source_path = _optional_str(raw_source_path, field_name="target source_path")
    if isinstance(target_source_path, FindingsPayloadParseError):
        return target_source_path
    return target_kind, target_label, target_source_path


def _optional_str(value: Any, *, field_name: str) -> str | None | FindingsPayloadParseError:
    if value is None:
        return None
    if isinstance(value, str):
        return value or None
    return FindingsPayloadParseError(message=f"{field_name} must be a string when present")


def _parse_inline_posting_status_object(data: dict[str, Any]) -> InlinePostingStatusParseResult:
    posted_count = data.get("posted_count")
    skipped_duplicate_count = data.get("skipped_duplicate_count")
    fallback_only_count = data.get("fallback_only_count")
    api_error = data.get("api_error")

    if not isinstance(posted_count, int):
        return InlinePostingStatusParseError(message="inline result missing integer `posted_count`")
    if not isinstance(skipped_duplicate_count, int):
        return InlinePostingStatusParseError(
            message="inline result missing integer `skipped_duplicate_count`"
        )
    if not isinstance(fallback_only_count, int):
        return InlinePostingStatusParseError(
            message="inline result missing integer `fallback_only_count`"
        )
    if api_error is not None and not isinstance(api_error, str):
        return InlinePostingStatusParseError(
            message="inline result `api_error` must be a string or null"
        )

    return InlinePostingStatus(
        posted_count=posted_count,
        skipped_duplicate_count=skipped_duplicate_count,
        fallback_only_count=fallback_only_count,
        api_error=api_error,
    )


def _parse_finding_result(item: Any, *, index: int) -> ReviewFinding | FindingsPayloadParseError:
    if not isinstance(item, dict):
        return FindingsPayloadParseError(message=f"finding #{index} is not an object")

    try:
        return ReviewFinding.from_json_dict(item)
    except ValueError as exc:
        return FindingsPayloadParseError(message=f"finding #{index}: {exc}")


def _extract_activity_log_entries(body: str) -> tuple[str, ...]:
    lines = body.splitlines()
    for index, line in enumerate(lines):
        if line.strip() == _ACTIVITY_LOG_HEADING:
            entries: list[str] = []
            for entry_line in lines[index + 1 :]:
                stripped = entry_line.strip()
                if stripped.startswith("- "):
                    entries.append(stripped[2:])
            return tuple(entries)
    return ()


def _strip_activity_log(body: str) -> str:
    lines = body.splitlines()
    for index, line in enumerate(lines):
        if line.strip() == _ACTIVITY_LOG_HEADING:
            return "\n".join(lines[:index])
    return body
