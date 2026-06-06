"""DTOs for skill-first ``roaster stack exec`` commands."""

from __future__ import annotations

from asdl_core.clinkr.models import ClinkrModel
from roaster.stack.core.contracts import (
    ResolverStatus,
    ResolverValidationStatus,
    StackConfidence,
    StackRisk,
)


class StackSkillTriageFindingInput(ClinkrModel):
    """One finding classified by the skill-first triage step."""

    id: str
    source_review: str
    path: str | None = None
    line: int | None = None
    severity: str
    summary: str
    details: str | None = None
    status: str = "accepted"
    rationale: str = ""
    merged_into: str | None = None
    confidence: StackConfidence = "medium"
    risk: StackRisk = "behavioral"


class StackSkillTriageBatchInput(ClinkrModel):
    """One resolver batch declared by the skill-first triage step."""

    slug: str
    title: str
    summary: str = ""
    finding_ids: tuple[str, ...]
    dependencies: tuple[str, ...] = ()
    confidence: StackConfidence
    risk: StackRisk
    resolver_mandate: str = ""
    validation_requirements: tuple[str, ...]
    expected_paths: tuple[str, ...]


class StackSkillTriageInput(ClinkrModel):
    """Complete skill-first triage payload read from stdin."""

    summary: str = ""
    findings: tuple[StackSkillTriageFindingInput, ...] = ()
    batches: tuple[StackSkillTriageBatchInput, ...]


class StackSkillResolverValidationInput(ClinkrModel):
    """Validation evidence reported by the resolver agent."""

    command: str
    status: ResolverValidationStatus
    output_summary: str = ""


class StackSkillResolverSafetyInput(ClinkrModel):
    """Advisory resolver judgment flags."""

    destructive: bool = False
    security_sensitive: bool = False
    notes: str = ""


class StackSkillResolverInput(ClinkrModel):
    """Resolver result payload read from stdin by ``record-batch``."""

    status: ResolverStatus
    summary: str
    files_changed: tuple[str, ...] = ()
    validation: tuple[StackSkillResolverValidationInput, ...] = ()
    safety: StackSkillResolverSafetyInput = StackSkillResolverSafetyInput()
