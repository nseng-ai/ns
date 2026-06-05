"""Dry-run orchestration for roaster Graphite stack workflows."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from asdl_core.clinkr.models import ClinkrModel
from asdl_core.gh.pr_gateway import PRGateway
from brmem.gateway import BranchMemoryGateway
from roaster.gateways.agent_runner.gateway import AgentRunnerGateway
from roaster.gateways.local_diff.gateway import LocalDiffGateway
from roaster.gateways.review_catalog.gateway import ReviewCatalogGateway
from roaster.harness.invocation import HarnessRuntime
from roaster.stack_dashboard import (
    RejectedStackFinding,
    StackDashboardBatch,
    StackDashboardCounts,
    StackDashboardState,
    render_stack_dashboard,
)
from roaster.stack_markers import render_stack_dashboard_marker
from roaster.stack_models import StackRunManifest, StackTriageFinding, StackWorkflowRequest
from roaster.stack_profile import StackProfile
from roaster.stack_run_storage import (
    StackRunArtifactPlan,
    StackRunLocator,
    StackRunStorageError,
    select_stack_run_slug,
    stack_run_artifact_plan,
)
from roaster.stack_slugs import StackSlugError, validate_branch_memory_segment
from roaster.stack_triage import StackTriageFailure, StackTriageResult, run_stack_triage


@dataclass(frozen=True)
class StackWorkflowFailure:
    """A non-ideal result for stack dry-run orchestration."""

    error_type: str
    message: str


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


def run_stack_workflow_dry_run(
    *,
    profile: StackProfile,
    request: StackWorkflowRequest,
    cwd: Path,
    catalog: ReviewCatalogGateway,
    diff: LocalDiffGateway,
    harness_runtime: HarnessRuntime,
    agent_runner: AgentRunnerGateway | None,
    branch_memory: BranchMemoryGateway | None,
    pr_gateway: PRGateway | None = None,
) -> StackDryRunResult | StackWorkflowFailure:
    """Execute deterministic read-only stack planning for ``roaster stack run --dry-run``."""
    _ = pr_gateway
    if not request.dry_run:
        return StackWorkflowFailure(
            error_type="stack_orchestration_not_implemented",
            message="non-dry-run stack orchestration is not implemented yet; pass --dry-run",
        )

    if branch_memory is None:
        return StackWorkflowFailure(
            error_type="stack_branch_memory_unavailable",
            message="Branch Memory gateway is unavailable for roaster stack run planning.",
        )
    if agent_runner is None:
        return StackWorkflowFailure(
            error_type="agent_runner_unavailable",
            message="Roaster stack agent runner is unavailable for dry-run triage planning.",
        )

    target_branch = _resolve_target_branch(request)
    if isinstance(target_branch, StackWorkflowFailure):
        return target_branch

    impl_branch_slug = _impl_branch_slug(target_branch)
    if isinstance(impl_branch_slug, StackWorkflowFailure):
        return impl_branch_slug

    try:
        selection = select_stack_run_slug(
            branch_memory,
            impl_branch=target_branch,
            impl_branch_slug=impl_branch_slug,
            profile_slug=profile.slug,
            run_slug_stem=f"{impl_branch_slug}-{profile.slug}",
            new_run=request.new_run,
            run_slug=request.run_slug,
        )
        artifact_plan = stack_run_artifact_plan(
            impl_branch=target_branch,
            impl_branch_slug=impl_branch_slug,
            profile_slug=profile.slug,
            run_slug=selection.run_slug,
        )
    except StackRunStorageError as exc:
        return StackWorkflowFailure(error_type="stack_run_storage_invalid", message=str(exc))

    resolved_request = request.model_copy(
        update={"target_branch": target_branch, "run_slug": selection.run_slug}
    )
    triage_result = run_stack_triage(
        profile=profile,
        request=resolved_request,
        cwd=cwd,
        catalog=catalog,
        diff=diff,
        harness_runtime=harness_runtime,
        agent_runner=agent_runner,
    )
    if isinstance(triage_result, StackTriageFailure):
        return StackWorkflowFailure(
            error_type=triage_result.error_type,
            message=triage_result.message,
        )

    manifest = StackRunManifest(
        profile_slug=profile.slug,
        run_slug=selection.run_slug,
        impl_branch_slug=impl_branch_slug,
        base_ref=request.base_ref,
        target_branch=target_branch,
        target_pr=request.target_pr,
        batch_slugs=tuple(batch.slug for batch in _triage_batches(triage_result)),
    )
    dashboard_markdown = render_stack_dashboard(
        _dashboard_state(
            profile=profile,
            request=resolved_request,
            target_branch=target_branch,
            artifact_plan=artifact_plan,
            triage_result=triage_result,
        )
    )

    return StackDryRunResult(
        profile_slug=profile.slug,
        profile_path=str(profile.path),
        guidance_char_count=len(profile.guidance),
        target_branch=target_branch,
        target_pr=request.target_pr,
        impl_branch_slug=impl_branch_slug,
        base_ref=request.base_ref,
        run_slug=selection.run_slug,
        resumes_existing_run=selection.resumes_existing_run,
        dry_run=True,
        new_run=request.new_run,
        reviewers=request.reviewers,
        reviewer_run_count=len(triage_result.collection.reviewer_runs),
        reviewer_failure_count=len(triage_result.collection.reviewer_failures),
        finding_count=triage_result.collection.finding_count,
        accepted_count=_finding_status_count(triage_result, status="accepted"),
        rejected_count=_finding_status_count(triage_result, status="rejected"),
        superseded_count=_finding_status_count(triage_result, status="merged"),
        model=request.model,
        agent_model=request.agent_model,
        harness=request.harness,
        triage_prompt=request.triage_prompt,
        resolver_prompt=request.resolver_prompt,
        triage_summary=_triage_summary(triage_result),
        reviewer_runs=_reviewer_summaries(triage_result),
        findings=_finding_summaries(triage_result),
        batches=_batch_summaries(triage_result),
        actions=_actions(triage_result),
        manifest=manifest,
        locators=_locators(
            artifact_plan=artifact_plan,
            batch_slugs=manifest.batch_slugs,
            target_pr=request.target_pr,
            dashboard_marker=render_stack_dashboard_marker(profile.slug),
        ),
        dashboard_marker=render_stack_dashboard_marker(profile.slug),
        dashboard_markdown_char_count=len(dashboard_markdown),
    )


def _resolve_target_branch(request: StackWorkflowRequest) -> str | StackWorkflowFailure:
    if request.target_branch is not None and request.target_branch.strip():
        return request.target_branch.strip()
    return StackWorkflowFailure(
        error_type="stack_target_branch_required",
        message=(
            "roaster stack dry-run needs --target-branch until live Graphite target stack "
            "discovery is implemented."
        ),
    )


def _impl_branch_slug(target_branch: str) -> str | StackWorkflowFailure:
    candidate = re.sub(r"[^A-Za-z0-9._-]+", "-", target_branch.replace("/", "-").strip())
    candidate = re.sub(r"-+", "-", candidate).strip("-._")
    if not candidate:
        return StackWorkflowFailure(
            error_type="stack_impl_branch_slug_invalid",
            message="Target branch cannot be converted to a safe implementation branch slug.",
        )
    try:
        return validate_branch_memory_segment(candidate, label="implementation branch slug")
    except StackSlugError as exc:
        return StackWorkflowFailure(error_type="stack_impl_branch_slug_invalid", message=str(exc))


def _triage_batches(result: StackTriageResult):
    if result.triage is None:
        return ()
    return result.triage.batches


def _triage_findings(result: StackTriageResult) -> tuple[StackTriageFinding, ...]:
    if result.triage is None:
        return ()
    return result.triage.findings


def _finding_status_count(result: StackTriageResult, *, status: str) -> int:
    return sum(1 for finding in _triage_findings(result) if finding.status == status)


def _triage_summary(result: StackTriageResult) -> str | None:
    if result.triage is None:
        return None
    return result.triage.summary


def _reviewer_summaries(result: StackTriageResult) -> tuple[StackDryRunReviewerSummary, ...]:
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


def _finding_summaries(result: StackTriageResult) -> tuple[StackDryRunFindingSummary, ...]:
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
        for finding in _triage_findings(result)
    )


def _batch_summaries(result: StackTriageResult) -> tuple[StackDryRunBatchSummary, ...]:
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
        for batch in _triage_batches(result)
    )


def _actions(result: StackTriageResult) -> tuple[StackDryRunAction, ...]:
    actions = [
        StackDryRunAction(
            action_type="preview-run-artifacts",
            mutating=False,
            description="Compute Branch Memory and dashboard locators without writing them.",
        )
    ]
    for batch in _triage_batches(result):
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


def _locators(
    *,
    artifact_plan: StackRunArtifactPlan,
    batch_slugs: tuple[str, ...],
    target_pr: str | None,
    dashboard_marker: str,
) -> tuple[StackDryRunLocator, ...]:
    locators = [
        _branch_memory_locator("index", artifact_plan.index),
        _branch_memory_locator("manifest", artifact_plan.manifest),
        _branch_memory_locator("triage", artifact_plan.triage),
    ]
    for batch_slug in batch_slugs:
        locators.append(
            _branch_memory_locator(
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


def _branch_memory_locator(kind: str, locator: StackRunLocator) -> StackDryRunLocator:
    return StackDryRunLocator(
        kind=kind,
        namespace=locator.namespace,
        key=locator.key,
        branch=locator.branch,
    )


def _dashboard_state(
    *,
    profile: StackProfile,
    request: StackWorkflowRequest,
    target_branch: str,
    artifact_plan: StackRunArtifactPlan,
    triage_result: StackTriageResult,
) -> StackDashboardState:
    return StackDashboardState(
        profile_slug=profile.slug,
        run_slug=request.run_slug or "unknown-run",
        implementation_branch=target_branch,
        manifest_locator=artifact_plan.manifest,
        implementation_pr_number=_pr_number(request.target_pr),
        implementation_pr_url=_pr_url(request.target_pr),
        reviewer_run_count=len(triage_result.collection.reviewer_runs),
        finding_count=triage_result.collection.finding_count,
        counts=StackDashboardCounts(
            accepted=_finding_status_count(triage_result, status="accepted"),
            rejected=_finding_status_count(triage_result, status="rejected"),
            superseded=_finding_status_count(triage_result, status="merged"),
            submitted=0,
            failed=0,
            blocked=0,
        ),
        batches=tuple(
            StackDashboardBatch(
                slug=batch.slug,
                title=batch.title,
                finding_ids=batch.finding_ids,
                confidence=batch.confidence,
                risk=batch.risk,
                summary=batch.summary,
            )
            for batch in _triage_batches(triage_result)
        ),
        rejected_findings=tuple(
            RejectedStackFinding(
                finding_id=finding.id,
                summary=finding.summary,
                rationale=finding.rationale,
            )
            for finding in _triage_findings(triage_result)
            if finding.status == "rejected"
        ),
    )


def _pr_number(target_pr: str | None) -> int | None:
    if target_pr is None:
        return None
    if target_pr.isdigit():
        return int(target_pr)
    match = re.search(r"/(?:pull|issues)/(\d+)(?:\D*)$", target_pr)
    if match is None:
        return None
    return int(match.group(1))


def _pr_url(target_pr: str | None) -> str | None:
    if target_pr is None:
        return None
    if target_pr.startswith("http://") or target_pr.startswith("https://"):
        return target_pr
    return None
