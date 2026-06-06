"""Pure views over roaster stack triage results."""

from __future__ import annotations

from roaster.stack.command.triage import StackTriageResult
from roaster.stack.core.contracts import (
    StackTriageBatch,
    StackTriageFinding,
)


def triage_batches(result: StackTriageResult) -> tuple[StackTriageBatch, ...]:
    """Return triaged resolver batches, or none when no triage agent ran."""
    if result.triage is None:
        return ()
    return result.triage.batches


def triage_findings(result: StackTriageResult) -> tuple[StackTriageFinding, ...]:
    """Return triaged findings, or none when no triage agent ran."""
    if result.triage is None:
        return ()
    return result.triage.findings


def finding_status_count(result: StackTriageResult, *, status: str) -> int:
    """Count triaged findings with a specific status."""
    return sum(1 for finding in triage_findings(result) if finding.status == status)


def triage_summary(result: StackTriageResult) -> str | None:
    """Return the triage summary when an agent produced triage output."""
    if result.triage is None:
        return None
    return result.triage.summary
