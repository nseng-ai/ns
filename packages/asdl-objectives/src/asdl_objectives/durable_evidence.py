"""Read and write objective snapshot Durable Evidence marker files."""

from __future__ import annotations

import json
from dataclasses import dataclass
from json import JSONDecodeError
from typing import Any

from asdl_core.git.types import CommitSummary
from asdl_objectives.discovery import durable_evidence_key
from asdl_objectives.gateway_access import OBJECTIVE_NAMESPACE
from brmem.gateway import BranchMemoryGateway

DURABLE_EVIDENCE_SCHEMA = 1


@dataclass(frozen=True)
class DurableEvidenceRecord:
    """One commit recorded as covered by an objective branch snapshot."""

    schema: int
    sha: str
    patch_id: str | None
    author_iso: str
    subject: str


@dataclass(frozen=True)
class DurableEvidenceDiagnostic:
    """A non-fatal marker parsing diagnostic."""

    line: int
    message: str


@dataclass(frozen=True)
class DurableEvidenceMarker:
    """Parsed ``.durable-evidence.jsonl`` content."""

    present: bool
    records: tuple[DurableEvidenceRecord, ...]
    diagnostics: tuple[DurableEvidenceDiagnostic, ...]

    @property
    def patch_ids(self) -> frozenset[str]:
        """Return non-null patch IDs recorded by the marker."""
        return frozenset(r.patch_id for r in self.records if r.patch_id is not None)

    @property
    def ok(self) -> bool:
        return not self.diagnostics


def load_durable_evidence(
    gateway: BranchMemoryGateway,
    *,
    slug: str,
    branch: str,
) -> DurableEvidenceMarker:
    """Read and parse ``<slug>/.durable-evidence.jsonl`` from ``branch``."""
    content = gateway.get(OBJECTIVE_NAMESPACE, durable_evidence_key(slug), branch)
    if content is None:
        return DurableEvidenceMarker(present=False, records=(), diagnostics=())
    parsed = parse_durable_evidence(content)
    return DurableEvidenceMarker(
        present=True,
        records=parsed.records,
        diagnostics=parsed.diagnostics,
    )


def parse_durable_evidence(content: str) -> DurableEvidenceMarker:
    """Parse marker content without trusting malformed records."""
    records: list[DurableEvidenceRecord] = []
    diagnostics: list[DurableEvidenceDiagnostic] = []

    for line_number, raw_line in enumerate(content.splitlines(), start=1):
        if not raw_line.strip():
            continue
        record, error = _parse_marker_line(raw_line)
        if error is not None:
            diagnostics.append(DurableEvidenceDiagnostic(line=line_number, message=error))
            continue
        if record is not None:
            records.append(record)

    return DurableEvidenceMarker(
        present=True,
        records=tuple(records),
        diagnostics=tuple(diagnostics),
    )


def serialize_durable_evidence(records: tuple[DurableEvidenceRecord, ...]) -> str:
    """Serialize records as compact JSONL with a trailing newline when non-empty."""
    lines = [
        json.dumps(
            {
                "schema": record.schema,
                "sha": record.sha,
                "patch_id": record.patch_id,
                "author_iso": record.author_iso,
                "subject": record.subject,
            },
            separators=(",", ":"),
        )
        for record in records
    ]
    if not lines:
        return ""
    return "\n".join(lines) + "\n"


def records_from_commits(
    commits: tuple[CommitSummary, ...],
    *,
    pid_by_sha: dict[str, str | None],
) -> tuple[DurableEvidenceRecord, ...]:
    """Build marker records from newest-first git log output, oldest first."""
    return tuple(
        DurableEvidenceRecord(
            schema=DURABLE_EVIDENCE_SCHEMA,
            sha=commit.sha,
            patch_id=pid_by_sha.get(commit.sha),
            author_iso=commit.author_iso,
            subject=commit.subject,
        )
        for commit in reversed(commits)
    )


def _parse_marker_line(raw_line: str) -> tuple[DurableEvidenceRecord | None, str | None]:
    try:
        data = json.loads(raw_line)
    except JSONDecodeError as exc:
        return None, f"invalid JSON: {exc.msg}"

    if not isinstance(data, dict):
        return None, "expected JSON object"

    schema = data.get("schema")
    if schema != DURABLE_EVIDENCE_SCHEMA:
        return None, f"unsupported schema: {schema!r}"

    sha = _required_str(data, "sha")
    patch_id = _optional_str(data, "patch_id")
    author_iso = _required_str(data, "author_iso")
    subject = _required_str(data, "subject")
    errors = tuple(e for e in (sha[1], patch_id[1], author_iso[1], subject[1]) if e is not None)
    if errors:
        return None, "; ".join(errors)

    return (
        DurableEvidenceRecord(
            schema=schema,
            sha=sha[0],
            patch_id=patch_id[0],
            author_iso=author_iso[0],
            subject=subject[0],
        ),
        None,
    )


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
