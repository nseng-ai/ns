from __future__ import annotations

from copy import deepcopy
from typing import Any

import pytest
import yaml

from roaster.stack.command.agent_output import (
    StackAgentOutputParseError,
    parse_resolver_output_result,
    parse_triage_output_result,
)
from roaster.stack.core.contracts import (
    StackResolverOutput,
    StackTriageOutput,
)


def _frontmatter_source(data: dict[str, Any], *, body: str = "## Explanation\n") -> str:
    return f"---\n{yaml.safe_dump(data, sort_keys=False)}---\n{body}"


def _valid_triage_frontmatter() -> dict[str, Any]:
    return {
        "schema_version": "roaster.stack.triage.v1",
        "summary": "Triage summary",
        "findings": [
            {
                "id": "F1",
                "source_review": "pytest",
                "path": "tests/test_example.py",
                "line": 12,
                "severity": "warning",
                "summary": "Accepted finding",
                "details": None,
                "status": "accepted",
                "rationale": "Worth fixing.",
                "merged_into": None,
                "confidence": "high",
                "risk": "mechanical",
            },
            {
                "id": "F2",
                "source_review": "dignified-python",
                "path": None,
                "line": None,
                "severity": "info",
                "summary": "Merged finding",
                "details": "Same issue as F1.",
                "status": "merged",
                "rationale": "Duplicate.",
                "merged_into": "F1",
                "confidence": "medium",
                "risk": "behavioral",
            },
        ],
        "batches": [
            {
                "slug": "batch-one",
                "title": "Batch one",
                "summary": "Fix F1.",
                "finding_ids": ["F1"],
                "dependencies": [],
                "confidence": "high",
                "risk": "mechanical",
                "resolver_mandate": "Make the minimal fix.",
                "validation_requirements": ["uv run pytest"],
            },
        ],
    }


def _valid_resolver_frontmatter() -> dict[str, Any]:
    return {
        "schema_version": "roaster.stack.resolver.v1",
        "batch_slug": "batch-one",
        "status": "completed",
        "summary": "Resolved batch.",
        "files_changed": ["src/example.py"],
        "validation": [
            {
                "command": (
                    "uv run pytest packages/roaster/tests/unit/stack/command/test_agent_output.py"
                ),
                "status": "passed",
                "output_summary": "passed",
            },
        ],
        "safety": {
            "unresolved_conflicts": False,
            "destructive_changes": False,
            "secrets_or_security_sensitive": False,
            "validation_evidence_missing": False,
            "notes": "No safety concerns.",
        },
    }


def _triage_with(mutator: str) -> str:
    data = _valid_triage_frontmatter()
    if mutator == "unknown_schema":
        data["schema_version"] = "wrong.v1"
    elif mutator == "invalid_finding_enum":
        data["findings"][0]["status"] = "maybe"
    elif mutator == "duplicate_finding_id":
        data["findings"][1]["id"] = "F1"
    elif mutator == "duplicate_batch_slug":
        data["batches"].append(deepcopy(data["batches"][0]))
    elif mutator == "unknown_finding_id":
        data["batches"][0]["finding_ids"] = ["missing"]
    elif mutator == "accepted_unassigned":
        data["batches"][0]["finding_ids"] = []
    elif mutator == "unknown_dependency":
        data["batches"][0]["dependencies"] = ["missing-batch"]
    elif mutator == "dependency_cycle":
        data["batches"].append(
            {
                **deepcopy(data["batches"][0]),
                "slug": "batch-two",
                "finding_ids": [],
                "dependencies": ["batch-one"],
            }
        )
        data["batches"][0]["dependencies"] = ["batch-two"]
    elif mutator == "merged_missing_target":
        data["findings"][1]["merged_into"] = None
    elif mutator == "merged_unknown_target":
        data["findings"][1]["merged_into"] = "missing"
    return _frontmatter_source(data)


def test_parse_triage_output_uses_frontmatter_and_preserves_body() -> None:
    body = "## Explanation\n\nThe prose can say status: rejected without changing YAML decisions.\n"

    parsed = parse_triage_output_result(_frontmatter_source(_valid_triage_frontmatter(), body=body))

    assert isinstance(parsed, StackTriageOutput)
    assert parsed.summary == "Triage summary"
    assert parsed.findings[0].id == "F1"
    assert parsed.findings[0].status == "accepted"
    assert parsed.findings[1].status == "merged"
    assert parsed.batches[0].slug == "batch-one"
    assert parsed.body == body


@pytest.mark.parametrize(
    ("source", "message"),
    [
        ("No frontmatter\n", "must begin"),
        ("---\nschema_version: [\n---\n", "not valid YAML"),
        ("---\n- item\n---\n", "YAML mapping"),
        (_frontmatter_source({"summary": "missing schema"}), "schema_version"),
        (_triage_with("unknown_schema"), "unsupported schema_version"),
        (_triage_with("invalid_finding_enum"), "must be one of"),
        (_triage_with("duplicate_finding_id"), "duplicate triage finding id"),
        (_triage_with("duplicate_batch_slug"), "duplicate triage batch slug"),
        (_triage_with("unknown_finding_id"), "unknown finding id"),
        (_triage_with("accepted_unassigned"), "not assigned to any batch"),
        (_triage_with("unknown_dependency"), "depends on unknown batch"),
        (_triage_with("dependency_cycle"), "dependency cycle"),
        (_triage_with("merged_missing_target"), "must declare `merged_into`"),
        (_triage_with("merged_unknown_target"), "unknown merged_into"),
    ],
)
def test_parse_triage_output_rejects_invalid_contracts(source: str, message: str) -> None:
    parsed = parse_triage_output_result(source)

    assert isinstance(parsed, StackAgentOutputParseError)
    assert message in parsed.message


def _resolver_with(mutator: str) -> str:
    data = _valid_resolver_frontmatter()
    if mutator == "unknown_schema":
        data["schema_version"] = "wrong.v1"
    elif mutator == "invalid_status_enum":
        data["status"] = "done"
    elif mutator == "non_completed":
        data["status"] = "blocked"
    elif mutator == "missing_validation_evidence":
        data["validation"] = []
    elif mutator == "failed_validation":
        data["validation"][0]["status"] = "failed"
    elif mutator == "skipped_validation":
        data["validation"][0]["status"] = "skipped"
    elif mutator == "true_safety_flag":
        data["safety"]["destructive_changes"] = True
    return _frontmatter_source(data)


def test_parse_resolver_output_uses_frontmatter_and_preserves_body() -> None:
    body = "## Explanation\n\nThe body can claim status: failed; YAML is authoritative.\n"

    parsed = parse_resolver_output_result(
        _frontmatter_source(_valid_resolver_frontmatter(), body=body),
        expected_batch_slug="batch-one",
    )

    assert isinstance(parsed, StackResolverOutput)
    assert parsed.batch_slug == "batch-one"
    assert parsed.status == "completed"
    assert parsed.validation[0].status == "passed"
    assert parsed.safety.unresolved_conflicts is False
    assert parsed.body == body


@pytest.mark.parametrize(
    ("source", "message"),
    [
        ("No frontmatter\n", "must begin"),
        ("---\nschema_version: [\n---\n", "not valid YAML"),
        (_frontmatter_source({"schema_version": "wrong.v1"}), "unsupported schema_version"),
        (_resolver_with("unknown_schema"), "unsupported schema_version"),
        (_resolver_with("invalid_status_enum"), "must be one of"),
        (_resolver_with("non_completed"), "must be `completed`"),
        (_resolver_with("missing_validation_evidence"), "validation evidence"),
        (_resolver_with("failed_validation"), "validation command failed"),
        (_resolver_with("skipped_validation"), "was skipped"),
        (_resolver_with("true_safety_flag"), "destructive_changes"),
    ],
)
def test_parse_resolver_output_rejects_invalid_contracts(source: str, message: str) -> None:
    parsed = parse_resolver_output_result(source, expected_batch_slug="batch-one")

    assert isinstance(parsed, StackAgentOutputParseError)
    assert message in parsed.message


def test_parse_resolver_output_rejects_expected_batch_mismatch() -> None:
    parsed = parse_resolver_output_result(
        _frontmatter_source(_valid_resolver_frontmatter()),
        expected_batch_slug="other-batch",
    )

    assert isinstance(parsed, StackAgentOutputParseError)
    assert "batch slug mismatch" in parsed.message
