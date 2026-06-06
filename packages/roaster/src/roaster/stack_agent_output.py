"""Parsers for roaster stack triage and resolver agent outputs."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, TypeAlias, cast

import yaml

from roaster.stack_models import (
    ResolverStatus,
    ResolverValidationStatus,
    StackConfidence,
    StackResolverOutput,
    StackResolverSafety,
    StackResolverValidation,
    StackRisk,
    StackTriageBatch,
    StackTriageFinding,
    StackTriageOutput,
    TriageFindingStatus,
)
from roaster.stack_slugs import StackSlugError, validate_batch_slug

_FRONTMATTER_FENCE = "---"
_TRIAGE_SCHEMA_VERSION = "roaster.stack.triage.v1"
_RESOLVER_SCHEMA_VERSION = "roaster.stack.resolver.v1"
_VALID_FINDING_STATUSES = frozenset({"accepted", "rejected", "merged"})
_VALID_CONFIDENCES = frozenset({"high", "medium", "low"})
_VALID_RISKS = frozenset({"mechanical", "behavioral", "architectural", "speculative"})
_VALID_RESOLVER_STATUSES = frozenset({"completed", "failed", "blocked"})
_VALID_VALIDATION_STATUSES = frozenset({"passed", "failed", "skipped"})
_TRIAGE_KEYS = frozenset({"schema_version", "summary", "findings", "batches"})
_FINDING_KEYS = frozenset(
    {
        "id",
        "source_review",
        "path",
        "line",
        "severity",
        "summary",
        "details",
        "status",
        "rationale",
        "merged_into",
        "confidence",
        "risk",
    }
)
_BATCH_KEYS = frozenset(
    {
        "slug",
        "title",
        "summary",
        "finding_ids",
        "dependencies",
        "confidence",
        "risk",
        "resolver_mandate",
        "validation_requirements",
    }
)
_RESOLVER_KEYS = frozenset(
    {"schema_version", "batch_slug", "status", "summary", "files_changed", "validation", "safety"}
)
_VALIDATION_KEYS = frozenset({"command", "status", "output_summary"})
_SAFETY_KEYS = frozenset(
    {
        "unresolved_conflicts",
        "destructive_changes",
        "secrets_or_security_sensitive",
        "validation_evidence_missing",
        "notes",
    }
)
_SAFETY_FLAG_KEYS = (
    "unresolved_conflicts",
    "destructive_changes",
    "secrets_or_security_sensitive",
    "validation_evidence_missing",
)


@dataclass(frozen=True)
class StackAgentOutputParseError:
    """A stack agent markdown output failed deterministic parsing."""

    message: str


StackTriageParseResult: TypeAlias = StackTriageOutput | StackAgentOutputParseError
StackResolverParseResult: TypeAlias = StackResolverOutput | StackAgentOutputParseError


def parse_triage_output_result(source: str) -> StackTriageParseResult:
    """Parse triage markdown using YAML frontmatter as the only authority."""
    parsed = _parse_frontmatter(source, output_name="triage output")
    if isinstance(parsed, StackAgentOutputParseError):
        return parsed
    frontmatter, body = parsed

    schema_error = _validate_schema(
        frontmatter,
        expected_schema=_TRIAGE_SCHEMA_VERSION,
        output_name="triage output",
    )
    if schema_error is not None:
        return schema_error

    unknown_error = _reject_unknown_keys(frontmatter, allowed=_TRIAGE_KEYS, context="triage output")
    if unknown_error is not None:
        return unknown_error

    summary = _required_string(frontmatter, "summary", context="triage output")
    if isinstance(summary, StackAgentOutputParseError):
        return summary

    findings = _parse_findings(frontmatter)
    if isinstance(findings, StackAgentOutputParseError):
        return findings

    batches = _parse_batches(frontmatter)
    if isinstance(batches, StackAgentOutputParseError):
        return batches

    cross_reference_error = _validate_triage_cross_references(findings=findings, batches=batches)
    if cross_reference_error is not None:
        return cross_reference_error

    return StackTriageOutput(summary=summary, findings=findings, batches=batches, body=body)


def parse_resolver_output_result(
    source: str,
    *,
    expected_batch_slug: str | None = None,
    require_validation_evidence: bool = True,
) -> StackResolverParseResult:
    """Parse resolver markdown using YAML frontmatter as the only authority."""
    parsed = _parse_frontmatter(source, output_name="resolver output")
    if isinstance(parsed, StackAgentOutputParseError):
        return parsed
    frontmatter, body = parsed

    schema_error = _validate_schema(
        frontmatter,
        expected_schema=_RESOLVER_SCHEMA_VERSION,
        output_name="resolver output",
    )
    if schema_error is not None:
        return schema_error

    unknown_error = _reject_unknown_keys(
        frontmatter,
        allowed=_RESOLVER_KEYS,
        context="resolver output",
    )
    if unknown_error is not None:
        return unknown_error

    batch_slug = _required_batch_slug(frontmatter, "batch_slug", context="resolver output")
    if isinstance(batch_slug, StackAgentOutputParseError):
        return batch_slug
    if expected_batch_slug is not None and batch_slug != expected_batch_slug:
        return StackAgentOutputParseError(
            message=(
                "resolver output batch slug mismatch: "
                f"expected {expected_batch_slug!r}, got {batch_slug!r}"
            )
        )

    status = _required_enum(
        frontmatter,
        "status",
        valid_values=_VALID_RESOLVER_STATUSES,
        context="resolver output",
    )
    if isinstance(status, StackAgentOutputParseError):
        return status
    if status != "completed":
        return StackAgentOutputParseError(
            message=f"resolver output status must be `completed`; got {status!r}."
        )

    summary = _required_string(frontmatter, "summary", context="resolver output")
    if isinstance(summary, StackAgentOutputParseError):
        return summary

    files_changed = _required_string_tuple(frontmatter, "files_changed", context="resolver output")
    if isinstance(files_changed, StackAgentOutputParseError):
        return files_changed

    validation = _parse_validation(frontmatter)
    if isinstance(validation, StackAgentOutputParseError):
        return validation

    validation_error = _validate_resolver_validation(
        validation,
        require_validation_evidence=require_validation_evidence,
    )
    if validation_error is not None:
        return validation_error

    safety = _parse_safety(frontmatter)
    if isinstance(safety, StackAgentOutputParseError):
        return safety

    safety_error = _validate_safety_flags(safety)
    if safety_error is not None:
        return safety_error

    assert isinstance(status, str) and status in _VALID_RESOLVER_STATUSES

    return StackResolverOutput(
        batch_slug=batch_slug,
        status=cast(ResolverStatus, status),
        summary=summary,
        files_changed=files_changed,
        validation=validation,
        safety=safety,
        body=body,
    )


def _parse_frontmatter(
    source: str,
    *,
    output_name: str,
) -> tuple[dict[str, Any], str] | StackAgentOutputParseError:
    split = _split_frontmatter(source, output_name=output_name)
    if isinstance(split, StackAgentOutputParseError):
        return split
    frontmatter_text, body = split

    try:
        parsed_frontmatter = yaml.safe_load(frontmatter_text)
    except yaml.YAMLError as exc:
        return StackAgentOutputParseError(
            message=f"{output_name} frontmatter is not valid YAML: {exc}"
        )

    if parsed_frontmatter is None:
        return StackAgentOutputParseError(message=f"{output_name} frontmatter is empty.")
    if not isinstance(parsed_frontmatter, dict):
        return StackAgentOutputParseError(
            message=f"{output_name} frontmatter must be a YAML mapping."
        )

    return parsed_frontmatter, body


def _split_frontmatter(
    source: str,
    *,
    output_name: str,
) -> tuple[str, str] | StackAgentOutputParseError:
    lines = source.splitlines(keepends=True)
    first_content_index = next((index for index, line in enumerate(lines) if line.strip()), None)
    if first_content_index is None:
        return StackAgentOutputParseError(message=f"{output_name} is empty.")

    if lines[first_content_index].strip() != _FRONTMATTER_FENCE:
        return StackAgentOutputParseError(
            message=f"{output_name} must begin with a `---` frontmatter fence."
        )

    closing_index: int | None = None
    for index in range(first_content_index + 1, len(lines)):
        if lines[index].strip() == _FRONTMATTER_FENCE:
            closing_index = index
            break
    if closing_index is None:
        return StackAgentOutputParseError(
            message=f"{output_name} frontmatter is missing a closing `---` fence."
        )

    frontmatter_text = "".join(lines[first_content_index + 1 : closing_index])
    body = "".join(lines[closing_index + 1 :])
    return frontmatter_text, body


def _validate_schema(
    frontmatter: dict[str, Any],
    *,
    expected_schema: str,
    output_name: str,
) -> StackAgentOutputParseError | None:
    if "schema_version" not in frontmatter:
        return StackAgentOutputParseError(
            message=f"{output_name} frontmatter is missing required field `schema_version`."
        )
    schema_version = frontmatter["schema_version"]
    if schema_version != expected_schema:
        return StackAgentOutputParseError(
            message=(
                f"{output_name} frontmatter has unsupported schema_version "
                f"{schema_version!r}; expected {expected_schema!r}."
            )
        )
    return None


def _reject_unknown_keys(
    data: dict[str, Any],
    *,
    allowed: frozenset[str],
    context: str,
) -> StackAgentOutputParseError | None:
    unknown = sorted(key for key in data if key not in allowed)
    if not unknown:
        return None
    unknown_list = ", ".join(f"`{key}`" for key in unknown)
    return StackAgentOutputParseError(
        message=f"{context} contains unknown field(s): {unknown_list}."
    )


def _parse_findings(
    frontmatter: dict[str, Any],
) -> tuple[StackTriageFinding, ...] | StackAgentOutputParseError:
    if "findings" not in frontmatter:
        return StackAgentOutputParseError(message="triage output missing required `findings` list.")
    raw_findings = frontmatter["findings"]
    if not isinstance(raw_findings, list):
        return StackAgentOutputParseError(message="triage output field `findings` must be a list.")

    findings: list[StackTriageFinding] = []
    seen_ids: set[str] = set()
    for index, raw_finding in enumerate(raw_findings):
        raw_finding_data = _required_object(raw_finding, context=f"triage finding #{index}")
        if isinstance(raw_finding_data, StackAgentOutputParseError):
            return raw_finding_data
        unknown_error = _reject_unknown_keys(
            raw_finding_data,
            allowed=_FINDING_KEYS,
            context=f"triage finding #{index}",
        )
        if unknown_error is not None:
            return unknown_error
        finding = _parse_finding(raw_finding_data, index=index)
        if isinstance(finding, StackAgentOutputParseError):
            return finding
        if finding.id in seen_ids:
            return StackAgentOutputParseError(
                message=f"duplicate triage finding id {finding.id!r}."
            )
        seen_ids.add(finding.id)
        findings.append(finding)

    return tuple(findings)


def _parse_finding(
    data: dict[str, Any],
    *,
    index: int,
) -> StackTriageFinding | StackAgentOutputParseError:
    context = f"triage finding #{index}"
    finding_id = _required_string(data, "id", context=context)
    source_review = _required_string(data, "source_review", context=context)
    path = _optional_string(data, "path", context=context)
    line = _optional_int(data, "line", context=context)
    severity = _required_string(data, "severity", context=context)
    summary = _required_string(data, "summary", context=context)
    details = _optional_string(data, "details", context=context)
    status = _required_enum(
        data,
        "status",
        valid_values=_VALID_FINDING_STATUSES,
        context=context,
    )
    rationale = _required_string(data, "rationale", context=context)
    merged_into = _optional_string(data, "merged_into", context=context)
    confidence = _required_enum(
        data,
        "confidence",
        valid_values=_VALID_CONFIDENCES,
        context=context,
    )
    risk = _required_enum(data, "risk", valid_values=_VALID_RISKS, context=context)

    error = _first_error(
        finding_id,
        source_review,
        path,
        line,
        severity,
        summary,
        details,
        status,
        rationale,
        merged_into,
        confidence,
        risk,
    )
    if error is not None:
        return error

    assert isinstance(finding_id, str)
    assert isinstance(source_review, str)
    assert path is None or isinstance(path, str)
    assert line is None or isinstance(line, int)
    assert isinstance(severity, str)
    assert isinstance(summary, str)
    assert details is None or isinstance(details, str)
    assert isinstance(status, str) and status in _VALID_FINDING_STATUSES
    assert isinstance(rationale, str)
    assert merged_into is None or isinstance(merged_into, str)
    assert isinstance(confidence, str) and confidence in _VALID_CONFIDENCES
    assert isinstance(risk, str) and risk in _VALID_RISKS

    return StackTriageFinding(
        id=finding_id,
        source_review=source_review,
        path=path,
        line=line,
        severity=severity,
        summary=summary,
        details=details,
        status=cast(TriageFindingStatus, status),
        rationale=rationale,
        merged_into=merged_into,
        confidence=cast(StackConfidence, confidence),
        risk=cast(StackRisk, risk),
    )


def _parse_batches(
    frontmatter: dict[str, Any],
) -> tuple[StackTriageBatch, ...] | StackAgentOutputParseError:
    if "batches" not in frontmatter:
        return StackAgentOutputParseError(message="triage output missing required `batches` list.")
    raw_batches = frontmatter["batches"]
    if not isinstance(raw_batches, list):
        return StackAgentOutputParseError(message="triage output field `batches` must be a list.")

    batches: list[StackTriageBatch] = []
    seen_slugs: set[str] = set()
    for index, raw_batch in enumerate(raw_batches):
        raw_batch_data = _required_object(raw_batch, context=f"triage batch #{index}")
        if isinstance(raw_batch_data, StackAgentOutputParseError):
            return raw_batch_data
        unknown_error = _reject_unknown_keys(
            raw_batch_data,
            allowed=_BATCH_KEYS,
            context=f"triage batch #{index}",
        )
        if unknown_error is not None:
            return unknown_error
        batch = _parse_batch(raw_batch_data, index=index)
        if isinstance(batch, StackAgentOutputParseError):
            return batch
        if batch.slug in seen_slugs:
            return StackAgentOutputParseError(
                message=f"duplicate triage batch slug {batch.slug!r}."
            )
        seen_slugs.add(batch.slug)
        batches.append(batch)

    return tuple(batches)


def _parse_batch(
    data: dict[str, Any],
    *,
    index: int,
) -> StackTriageBatch | StackAgentOutputParseError:
    context = f"triage batch #{index}"
    slug = _required_batch_slug(data, "slug", context=context)
    title = _required_string(data, "title", context=context)
    summary = _required_string(data, "summary", context=context)
    finding_ids = _required_string_tuple(data, "finding_ids", context=context)
    dependencies = _required_string_tuple(data, "dependencies", context=context)
    confidence = _required_enum(
        data,
        "confidence",
        valid_values=_VALID_CONFIDENCES,
        context=context,
    )
    risk = _required_enum(data, "risk", valid_values=_VALID_RISKS, context=context)
    resolver_mandate = _required_string(data, "resolver_mandate", context=context)
    validation_requirements = _required_string_tuple(
        data,
        "validation_requirements",
        context=context,
    )

    error = _first_error(
        slug,
        title,
        summary,
        finding_ids,
        dependencies,
        confidence,
        risk,
        resolver_mandate,
        validation_requirements,
    )
    if error is not None:
        return error

    assert isinstance(slug, str)
    assert isinstance(title, str)
    assert isinstance(summary, str)
    assert isinstance(finding_ids, tuple)
    assert all(isinstance(finding_id, str) for finding_id in finding_ids)
    typed_finding_ids = cast(tuple[str, ...], finding_ids)
    assert isinstance(dependencies, tuple)
    assert all(isinstance(dependency, str) for dependency in dependencies)
    typed_dependencies = cast(tuple[str, ...], dependencies)
    assert isinstance(confidence, str) and confidence in _VALID_CONFIDENCES
    assert isinstance(risk, str) and risk in _VALID_RISKS
    assert isinstance(resolver_mandate, str)
    assert isinstance(validation_requirements, tuple)
    assert all(isinstance(requirement, str) for requirement in validation_requirements)
    typed_validation_requirements = cast(tuple[str, ...], validation_requirements)

    return StackTriageBatch(
        slug=slug,
        title=title,
        summary=summary,
        finding_ids=typed_finding_ids,
        dependencies=typed_dependencies,
        confidence=cast(StackConfidence, confidence),
        risk=cast(StackRisk, risk),
        resolver_mandate=resolver_mandate,
        validation_requirements=typed_validation_requirements,
    )


def _validate_triage_cross_references(
    *,
    findings: tuple[StackTriageFinding, ...],
    batches: tuple[StackTriageBatch, ...],
) -> StackAgentOutputParseError | None:
    finding_ids = {finding.id for finding in findings}
    accepted_ids = {finding.id for finding in findings if finding.status == "accepted"}
    batch_slugs = {batch.slug for batch in batches}
    assigned_ids: set[str] = set()

    for finding in findings:
        if finding.status == "merged":
            if finding.merged_into is None:
                return StackAgentOutputParseError(
                    message=f"merged triage finding {finding.id!r} must declare `merged_into`."
                )
            if finding.merged_into not in finding_ids:
                return StackAgentOutputParseError(
                    message=(
                        f"merged triage finding {finding.id!r} references unknown merged_into "
                        f"{finding.merged_into!r}."
                    )
                )
            if finding.merged_into == finding.id:
                return StackAgentOutputParseError(
                    message=f"merged triage finding {finding.id!r} must not merge into itself."
                )

    for batch in batches:
        for finding_id in batch.finding_ids:
            if finding_id not in finding_ids:
                return StackAgentOutputParseError(
                    message=(
                        f"triage batch {batch.slug!r} references unknown finding id {finding_id!r}."
                    )
                )
            assigned_ids.add(finding_id)
        for dependency in batch.dependencies:
            if dependency not in batch_slugs:
                return StackAgentOutputParseError(
                    message=(
                        f"triage batch {batch.slug!r} depends on unknown batch {dependency!r}."
                    )
                )

    unassigned_accepted = sorted(accepted_ids - assigned_ids)
    if unassigned_accepted:
        finding_list = ", ".join(repr(finding_id) for finding_id in unassigned_accepted)
        return StackAgentOutputParseError(
            message=f"accepted triage finding(s) are not assigned to any batch: {finding_list}."
        )

    return _detect_dependency_cycle(batches)


def _detect_dependency_cycle(
    batches: tuple[StackTriageBatch, ...],
) -> StackAgentOutputParseError | None:
    graph = {batch.slug: batch.dependencies for batch in batches}
    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(slug: str, path: tuple[str, ...]) -> StackAgentOutputParseError | None:
        if slug in visited:
            return None
        if slug in visiting:
            cycle = " -> ".join((*path, slug))
            return StackAgentOutputParseError(message=f"triage batch dependency cycle: {cycle}.")
        visiting.add(slug)
        for dependency in graph[slug]:
            error = visit(dependency, (*path, slug))
            if error is not None:
                return error
        visiting.remove(slug)
        visited.add(slug)
        return None

    for slug in graph:
        error = visit(slug, ())
        if error is not None:
            return error
    return None


def _parse_validation(
    frontmatter: dict[str, Any],
) -> tuple[StackResolverValidation, ...] | StackAgentOutputParseError:
    if "validation" not in frontmatter:
        return StackAgentOutputParseError(
            message="resolver output missing required `validation` list."
        )
    raw_validation = frontmatter["validation"]
    if not isinstance(raw_validation, list):
        return StackAgentOutputParseError(
            message="resolver output field `validation` must be a list."
        )

    entries: list[StackResolverValidation] = []
    for index, raw_entry in enumerate(raw_validation):
        raw_entry_data = _required_object(raw_entry, context=f"resolver validation #{index}")
        if isinstance(raw_entry_data, StackAgentOutputParseError):
            return raw_entry_data
        unknown_error = _reject_unknown_keys(
            raw_entry_data,
            allowed=_VALIDATION_KEYS,
            context=f"resolver validation #{index}",
        )
        if unknown_error is not None:
            return unknown_error
        entry = _parse_validation_entry(raw_entry_data, index=index)
        if isinstance(entry, StackAgentOutputParseError):
            return entry
        entries.append(entry)
    return tuple(entries)


def _parse_validation_entry(
    data: dict[str, Any],
    *,
    index: int,
) -> StackResolverValidation | StackAgentOutputParseError:
    context = f"resolver validation #{index}"
    command = _required_string(data, "command", context=context)
    status = _required_enum(
        data,
        "status",
        valid_values=_VALID_VALIDATION_STATUSES,
        context=context,
    )
    output_summary = _required_string(data, "output_summary", context=context)
    error = _first_error(command, status, output_summary)
    if error is not None:
        return error
    assert isinstance(command, str)
    assert isinstance(status, str) and status in _VALID_VALIDATION_STATUSES
    assert isinstance(output_summary, str)
    return StackResolverValidation(
        command=command,
        status=cast(ResolverValidationStatus, status),
        output_summary=output_summary,
    )


def _validate_resolver_validation(
    validation: tuple[StackResolverValidation, ...],
    *,
    require_validation_evidence: bool,
) -> StackAgentOutputParseError | None:
    if not validation:
        return StackAgentOutputParseError(
            message="completed resolver output must include validation evidence."
        )
    for entry in validation:
        if entry.status == "failed":
            return StackAgentOutputParseError(
                message=f"resolver validation command failed: {entry.command!r}."
            )
        if require_validation_evidence and entry.status == "skipped":
            return StackAgentOutputParseError(
                message=(
                    "resolver validation command was skipped even though evidence is required: "
                    f"{entry.command!r}."
                )
            )
    if require_validation_evidence and not any(entry.status == "passed" for entry in validation):
        return StackAgentOutputParseError(
            message="completed resolver output must include at least one passed validation command."
        )
    return None


def _parse_safety(frontmatter: dict[str, Any]) -> StackResolverSafety | StackAgentOutputParseError:
    if "safety" not in frontmatter:
        return StackAgentOutputParseError(
            message="resolver output missing required `safety` object."
        )
    safety = _required_object(frontmatter["safety"], context="resolver safety")
    if isinstance(safety, StackAgentOutputParseError):
        return StackAgentOutputParseError(
            message="resolver output field `safety` must be an object."
        )
    unknown_error = _reject_unknown_keys(safety, allowed=_SAFETY_KEYS, context="resolver safety")
    if unknown_error is not None:
        return unknown_error

    for key in _SAFETY_FLAG_KEYS:
        if key not in safety:
            return StackAgentOutputParseError(
                message=f"resolver safety missing required field `{key}`."
            )
        if not isinstance(safety[key], bool):
            return StackAgentOutputParseError(
                message=f"resolver safety field `{key}` must be boolean."
            )

    notes = _required_string(safety, "notes", context="resolver safety")
    if isinstance(notes, StackAgentOutputParseError):
        return notes

    return StackResolverSafety(
        unresolved_conflicts=safety["unresolved_conflicts"],
        destructive_changes=safety["destructive_changes"],
        secrets_or_security_sensitive=safety["secrets_or_security_sensitive"],
        validation_evidence_missing=safety["validation_evidence_missing"],
        notes=notes,
    )


def _validate_safety_flags(safety: StackResolverSafety) -> StackAgentOutputParseError | None:
    if safety.unresolved_conflicts:
        return StackAgentOutputParseError(
            message="resolver safety flag `unresolved_conflicts` is true."
        )
    if safety.destructive_changes:
        return StackAgentOutputParseError(
            message="resolver safety flag `destructive_changes` is true."
        )
    if safety.secrets_or_security_sensitive:
        return StackAgentOutputParseError(
            message="resolver safety flag `secrets_or_security_sensitive` is true."
        )
    if safety.validation_evidence_missing:
        return StackAgentOutputParseError(
            message="resolver safety flag `validation_evidence_missing` is true."
        )
    return None


def _required_object(
    value: object,
    *,
    context: str,
) -> dict[str, Any] | StackAgentOutputParseError:
    if not isinstance(value, dict):
        return StackAgentOutputParseError(message=f"{context} must be an object.")
    assert isinstance(value, dict)
    return cast(dict[str, Any], value)


def _required_string(
    data: dict[str, Any],
    field: str,
    *,
    context: str,
) -> str | StackAgentOutputParseError:
    if field not in data:
        return StackAgentOutputParseError(message=f"{context} missing required field `{field}`.")
    value = data[field]
    if not isinstance(value, str) or not value.strip():
        return StackAgentOutputParseError(
            message=f"{context} field `{field}` must be a non-empty string."
        )
    return value.strip()


def _optional_string(
    data: dict[str, Any],
    field: str,
    *,
    context: str,
) -> str | None | StackAgentOutputParseError:
    if field not in data or data[field] is None:
        return None
    value = data[field]
    if not isinstance(value, str) or not value.strip():
        return StackAgentOutputParseError(
            message=f"{context} field `{field}` must be a non-empty string or null."
        )
    return value.strip()


def _optional_int(
    data: dict[str, Any],
    field: str,
    *,
    context: str,
) -> int | None | StackAgentOutputParseError:
    if field not in data or data[field] is None:
        return None
    value = data[field]
    if not isinstance(value, int) or isinstance(value, bool):
        return StackAgentOutputParseError(
            message=f"{context} field `{field}` must be an integer or null."
        )
    return value


def _required_enum(
    data: dict[str, Any],
    field: str,
    *,
    valid_values: frozenset[str],
    context: str,
) -> str | StackAgentOutputParseError:
    value = _required_string(data, field, context=context)
    if isinstance(value, StackAgentOutputParseError):
        return value
    if value not in valid_values:
        allowed = ", ".join(sorted(valid_values))
        return StackAgentOutputParseError(
            message=f"{context} field `{field}` must be one of: {allowed}; got {value!r}."
        )
    return value


def _required_string_tuple(
    data: dict[str, Any],
    field: str,
    *,
    context: str,
) -> tuple[str, ...] | StackAgentOutputParseError:
    if field not in data:
        return StackAgentOutputParseError(message=f"{context} missing required field `{field}`.")
    value = data[field]
    if not isinstance(value, list):
        return StackAgentOutputParseError(
            message=f"{context} field `{field}` must be a list of strings."
        )

    values: list[str] = []
    for index, item in enumerate(value):
        if not isinstance(item, str) or not item.strip():
            return StackAgentOutputParseError(
                message=f"{context} field `{field}` item {index} must be a non-empty string."
            )
        values.append(item.strip())
    return tuple(values)


def _required_batch_slug(
    data: dict[str, Any],
    field: str,
    *,
    context: str,
) -> str | StackAgentOutputParseError:
    value = _required_string(data, field, context=context)
    if isinstance(value, StackAgentOutputParseError):
        return value
    try:
        return validate_batch_slug(value)
    except StackSlugError as exc:
        return StackAgentOutputParseError(message=f"{context} field `{field}` is invalid: {exc}")


def _first_error(*values: object) -> StackAgentOutputParseError | None:
    for value in values:
        if isinstance(value, StackAgentOutputParseError):
            return value
    return None
