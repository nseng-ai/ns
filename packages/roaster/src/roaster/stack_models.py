"""Typed contracts for roaster Graphite stack workflows."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from asdl_core.clinkr.models import ClinkrModel

TriageFindingStatus = Literal["accepted", "rejected", "merged"]
StackConfidence = Literal["high", "medium", "low"]
StackRisk = Literal["mechanical", "behavioral", "architectural", "speculative"]
ResolverStatus = Literal["completed", "failed", "blocked"]
ResolverValidationStatus = Literal["passed", "failed", "skipped"]
StackBatchStatus = Literal["pending", "running", "completed", "failed", "blocked"]


@dataclass(frozen=True)
class StackTriageFinding:
    """One triaged review finding from authoritative YAML frontmatter."""

    id: str
    source_review: str
    path: str | None
    line: int | None
    severity: str
    summary: str
    details: str | None
    status: TriageFindingStatus
    rationale: str
    merged_into: str | None
    confidence: StackConfidence
    risk: StackRisk


@dataclass(frozen=True)
class StackTriageBatch:
    """One resolver batch selected by triage frontmatter."""

    slug: str
    title: str
    summary: str
    finding_ids: tuple[str, ...]
    dependencies: tuple[str, ...]
    confidence: StackConfidence
    risk: StackRisk
    resolver_mandate: str
    validation_requirements: tuple[str, ...]


@dataclass(frozen=True)
class StackTriageOutput:
    """Parsed triage agent output with body preserved as explanation only."""

    summary: str
    findings: tuple[StackTriageFinding, ...]
    batches: tuple[StackTriageBatch, ...]
    body: str


@dataclass(frozen=True)
class StackResolverValidation:
    """One validation command reported by a resolver agent."""

    command: str
    status: ResolverValidationStatus
    output_summary: str


@dataclass(frozen=True)
class StackResolverSafety:
    """Resolver safety flags from authoritative YAML frontmatter."""

    unresolved_conflicts: bool
    destructive_changes: bool
    secrets_or_security_sensitive: bool
    validation_evidence_missing: bool
    notes: str


@dataclass(frozen=True)
class StackResolverOutput:
    """Parsed resolver agent output with body preserved as explanation only."""

    batch_slug: str
    status: ResolverStatus
    summary: str
    files_changed: tuple[str, ...]
    validation: tuple[StackResolverValidation, ...]
    safety: StackResolverSafety
    body: str


class StackWorkflowRequest(ClinkrModel):
    """User-facing request facts for a roaster stack run."""

    profile_slug: str
    target_branch: str | None = None
    target_pr: str | None = None
    reviewers: tuple[str, ...] = ()
    model: str | None = None
    agent_model: str | None = None
    harness: str | None = None
    base_ref: str | None = None
    dry_run: bool = False
    new_run: bool = False
    run_slug: str | None = None
    triage_prompt: str | None = None
    resolver_prompt: str | None = None


class GeneratedStackBranch(ClinkrModel):
    """Generated branch identity for one resolver batch."""

    branch_name: str
    impl_branch_slug: str
    run_slug: str
    batch_slug: str


class StackMarker(ClinkrModel):
    """Durable marker shape for later branch/comment/dashboard publication."""

    marker: str
    run_slug: str
    batch_slug: str | None = None
    branch_name: str | None = None


class StackRunManifest(ClinkrModel):
    """Manifest shape for a future persisted roaster stack run."""

    schema_version: str = "roaster.stack.run-manifest.v1"
    profile_slug: str
    run_slug: str
    impl_branch_slug: str
    base_ref: str | None = None
    target_branch: str | None = None
    target_pr: str | None = None
    batch_slugs: tuple[str, ...]
    generated_branches: tuple[GeneratedStackBranch, ...] = ()
    markers: tuple[StackMarker, ...] = ()


class StackDashboardRow(ClinkrModel):
    """Dashboard row shape for one roaster stack batch."""

    run_slug: str
    batch_slug: str
    title: str
    status: StackBatchStatus
    branch_name: str | None = None
    summary: str = ""
    validation_summary: str | None = None


class StackWorkflowResult(ClinkrModel):
    """Top-level result shape for future roaster stack orchestration."""

    run_slug: str
    status: StackBatchStatus
    manifest: StackRunManifest
    dashboard_rows: tuple[StackDashboardRow, ...] = ()
