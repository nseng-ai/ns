"""Dry-run result contracts and projections for roaster stack workflows."""

from __future__ import annotations

from asdl_core.clinkr.models import ClinkrModel
from roaster.stack_models import StackRunManifest
from roaster.stack_run_storage import StackRunArtifactPlan, StackRunLocator
from roaster.stack_triage import StackTriageResult
from roaster.stack_triage_view import triage_batches, triage_findings


class StackDryRunLocator(ClinkrModel):
    """Read-only preview of one Branch Memory or dashboard locator."""

    kind: str
    namespace: str | None = None
    key: str | None = None
    branch: str | None = None
    target_pr: str | None = None
    marker: str | None = None


class StackDryRunReviewerSummary(ClinkrModel):
    """Reviewer facts collected during a dry run."""

    key: str
    review_name: str
    review_path: str
    model: str
    base_ref: str
    finding_count: int


class StackDryRunFindingSummary(ClinkrModel):
    """Triaged finding fields surfaced in CLI/JSON output."""

    id: str
    source_review: str
    status: str
    severity: str
    path: str | None
    line: int | None
    summary: str
    rationale: str
    merged_into: str | None
    confidence: str
    risk: str


class StackDryRunBatchSummary(ClinkrModel):
    """Planned resolver batch fields surfaced in CLI/JSON output."""

    slug: str
    title: str
    summary: str
    finding_ids: tuple[str, ...]
    dependencies: tuple[str, ...]
    confidence: str
    risk: str
    resolver_mandate: str
    validation_requirements: tuple[str, ...]


class StackDryRunAction(ClinkrModel):
    """One deterministic action that would be considered after dry-run planning."""

    action_type: str
    batch_slug: str | None = None
    mutating: bool
    description: str


class StackDryRunResult(ClinkrModel):
    """Deterministic dry-run result for a roaster stack run."""

    profile_slug: str
    profile_path: str
    guidance_char_count: int
    target_branch: str
    target_pr: str | None
    impl_branch_slug: str
    base_ref: str | None
    run_slug: str
    resumes_existing_run: bool
    dry_run: bool
    new_run: bool
    reviewers: tuple[str, ...]
    reviewer_run_count: int
    reviewer_failure_count: int
    finding_count: int
    accepted_count: int
    rejected_count: int
    superseded_count: int
    model: str | None
    agent_model: str | None
    harness: str | None
    triage_prompt: str | None
    resolver_prompt: str | None
    triage_summary: str | None
    reviewer_runs: tuple[StackDryRunReviewerSummary, ...]
    findings: tuple[StackDryRunFindingSummary, ...]
    batches: tuple[StackDryRunBatchSummary, ...]
    actions: tuple[StackDryRunAction, ...]
    manifest: StackRunManifest
    locators: tuple[StackDryRunLocator, ...]
    dashboard_marker: str
    dashboard_markdown_char_count: int
    graphite_commands_run: int = 0
    branch_memory_puts: int = 0
    dashboard_mutations: int = 0


def reviewer_summaries(result: StackTriageResult) -> tuple[StackDryRunReviewerSummary, ...]:
    """Project reviewer runs into dry-run reviewer summaries."""
    return tuple(
        StackDryRunReviewerSummary(
            key=run.key,
            review_name=run.review_name,
            review_path=run.review_path,
            model=run.model,
            base_ref=run.base_ref,
            finding_count=len(run.findings),
        )
        for run in result.collection.reviewer_runs
    )


def finding_summaries(result: StackTriageResult) -> tuple[StackDryRunFindingSummary, ...]:
    """Project triaged findings into dry-run finding summaries."""
    return tuple(
        StackDryRunFindingSummary(
            id=finding.id,
            source_review=finding.source_review,
            status=finding.status,
            severity=finding.severity,
            path=finding.path,
            line=finding.line,
            summary=finding.summary,
            rationale=finding.rationale,
            merged_into=finding.merged_into,
            confidence=finding.confidence,
            risk=finding.risk,
        )
        for finding in triage_findings(result)
    )


def batch_summaries(result: StackTriageResult) -> tuple[StackDryRunBatchSummary, ...]:
    """Project triaged batches into dry-run batch summaries."""
    return tuple(
        StackDryRunBatchSummary(
            slug=batch.slug,
            title=batch.title,
            summary=batch.summary,
            finding_ids=batch.finding_ids,
            dependencies=batch.dependencies,
            confidence=batch.confidence,
            risk=batch.risk,
            resolver_mandate=batch.resolver_mandate,
            validation_requirements=batch.validation_requirements,
        )
        for batch in triage_batches(result)
    )


def dry_run_actions(result: StackTriageResult) -> tuple[StackDryRunAction, ...]:
    """Return the deterministic non-mutating actions represented by a dry run."""
    actions = [
        StackDryRunAction(
            action_type="preview-run-artifacts",
            mutating=False,
            description="Compute Branch Memory and dashboard locators without writing them.",
        )
    ]
    for batch in triage_batches(result):
        actions.append(
            StackDryRunAction(
                action_type="plan-resolver-batch",
                batch_slug=batch.slug,
                mutating=False,
                description=(
                    "Plan resolver batch only; branch creation, resolver execution, and "
                    "Graphite submission are intentionally not implemented in this dry-run slice."
                ),
            )
        )
    return tuple(actions)


def dry_run_locators(
    *,
    artifact_plan: StackRunArtifactPlan,
    batch_slugs: tuple[str, ...],
    target_pr: str | None,
    dashboard_marker: str,
) -> tuple[StackDryRunLocator, ...]:
    """Return Branch Memory and dashboard locators previewed by a dry run."""
    locators = [
        branch_memory_locator("index", artifact_plan.index),
        branch_memory_locator("manifest", artifact_plan.manifest),
        branch_memory_locator("triage", artifact_plan.triage),
    ]
    for batch_slug in batch_slugs:
        locators.append(
            branch_memory_locator(
                f"resolver:{batch_slug}",
                artifact_plan.resolver(batch_slug=batch_slug),
            )
        )
    locators.append(
        StackDryRunLocator(
            kind="dashboard",
            target_pr=target_pr,
            marker=dashboard_marker,
        )
    )
    return tuple(locators)


def branch_memory_locator(kind: str, locator: StackRunLocator) -> StackDryRunLocator:
    """Return a dry-run locator for a Branch Memory artifact location."""
    return StackDryRunLocator(
        kind=kind,
        namespace=locator.namespace,
        key=locator.key,
        branch=locator.branch,
    )
