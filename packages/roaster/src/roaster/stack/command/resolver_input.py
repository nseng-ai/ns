"""Resolver input rendering for roaster stack workflows."""

from __future__ import annotations

from roaster.stack.command.triage import StackTriageResult
from roaster.stack.command.triage_view import triage_findings
from roaster.stack.common.run_models import (
    StackRunManifest,
    StackWorkflowRequest,
)
from roaster.stack.core.contracts import (
    GeneratedStackBranch,
    StackTriageBatch,
)
from roaster.stack.core.profile import StackProfile


def render_stack_resolver_input(
    *,
    profile: StackProfile,
    request: StackWorkflowRequest,
    batch: StackTriageBatch,
    triage_result: StackTriageResult,
    manifest: StackRunManifest,
    branch: GeneratedStackBranch,
    existing_branch: bool,
) -> str:
    """Render profile, batch, and finding context for the resolver agent."""
    finding_ids = set(batch.finding_ids)
    lines = [
        "# Roaster Stack Resolver Input",
        "",
        f"- Profile: `{profile.slug}` (`{profile.path}`)",
        f"- Target branch: `{request.target_branch}`",
        f"- Target PR: `{request.target_pr}`",
        f"- Run slug: `{manifest.run_slug}`",
        f"- Batch slug: `{batch.slug}`",
        f"- Generated branch: `{branch.branch_name}`",
        f"- Existing generated branch: {existing_branch}",
        "",
        "## Profile Guidance",
        "",
        "```markdown",
        profile.guidance.rstrip(),
        "```",
        "",
        "## Batch Mandate",
        "",
        f"- Title: {batch.title}",
        f"- Summary: {batch.summary}",
        f"- Confidence: `{batch.confidence}`",
        f"- Risk: `{batch.risk}`",
        "- Resolver mandate:",
        "",
        "```text",
        batch.resolver_mandate.rstrip(),
        "```",
        "",
        "## Required Validation",
        "",
    ]
    if batch.validation_requirements:
        lines.extend(f"- {requirement}" for requirement in batch.validation_requirements)
    else:
        lines.append("- Choose and run the smallest relevant local validation.")
    lines.extend(["", "## Findings in This Batch", ""])
    for finding in triage_findings(triage_result):
        if finding.id in finding_ids:
            lines.extend(
                [
                    f"### `{finding.id}`",
                    "",
                    f"- Source review: `{finding.source_review}`",
                    f"- Path: {_value_or_dash(finding.path)}",
                    f"- Line: {_line_or_dash(finding.line)}",
                    f"- Severity: `{finding.severity}`",
                    f"- Summary: {finding.summary}",
                    f"- Details: {_value_or_dash(finding.details)}",
                    "",
                ]
            )
    return "\n".join(lines).rstrip() + "\n"


def _value_or_dash(value: object | None) -> str:
    if value is None:
        return "-"
    text = str(value)
    if not text:
        return "-"
    return text


def _line_or_dash(line: int | None) -> str:
    if line is None:
        return "-"
    return str(line)
