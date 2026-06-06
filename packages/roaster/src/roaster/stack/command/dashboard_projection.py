"""Pure dashboard projections for roaster stack workflow state."""

from __future__ import annotations

from roaster.stack.command.dashboard import (
    RejectedStackFinding,
    StackDashboardBatch,
    StackDashboardCounts,
    StackDashboardState,
)
from roaster.stack.command.triage import StackTriageResult
from roaster.stack.command.triage_view import finding_status_count, triage_batches, triage_findings
from roaster.stack.common.run_models import StackDashboardRow, StackWorkflowRequest
from roaster.stack.common.run_storage import StackRunArtifactPlan
from roaster.stack.core.contracts import GeneratedStackBranch, StackResolverOutput, StackTriageBatch
from roaster.stack.core.dashboard_pr import stack_dashboard_pr_number, stack_dashboard_pr_url
from roaster.stack.core.profile import StackProfile


def build_stack_dashboard_rows(
    *,
    batches: tuple[StackTriageBatch, ...],
    resolver_outputs: tuple[StackResolverOutput, ...],
    generated_branches: tuple[GeneratedStackBranch, ...],
) -> list[StackDashboardRow]:
    """Project workflow batch facts into result dashboard rows."""
    outputs_by_slug = {output.batch_slug: output for output in resolver_outputs}
    branches_by_slug = {branch.batch_slug: branch for branch in generated_branches}
    rows: list[StackDashboardRow] = []
    for batch in batches:
        output = outputs_by_slug.get(batch.slug)
        branch = branches_by_slug.get(batch.slug)
        rows.append(
            StackDashboardRow(
                run_slug=branch.run_slug if branch is not None else "pending",
                batch_slug=batch.slug,
                title=batch.title,
                status="completed" if output is not None else "pending",
                branch_name=branch.branch_name if branch is not None else None,
                summary=output.summary if output is not None else batch.summary,
                validation_summary=_validation_summary(output) if output is not None else None,
            )
        )
    return rows


def build_stack_dashboard_state(
    *,
    profile: StackProfile,
    request: StackWorkflowRequest,
    target_branch: str,
    artifact_plan: StackRunArtifactPlan,
    triage_result: StackTriageResult,
    batches: tuple[StackTriageBatch, ...] | None = None,
    resolver_outputs: tuple[StackResolverOutput, ...] = (),
    generated_branches: tuple[GeneratedStackBranch, ...] = (),
    submitted_count: int = 0,
) -> StackDashboardState:
    """Project stack run facts into renderer-ready dashboard state."""
    dashboard_batches = _dashboard_batches(
        batches=batches or triage_batches(triage_result),
        resolver_outputs=resolver_outputs,
        generated_branches=generated_branches,
    )
    return StackDashboardState(
        profile_slug=profile.slug,
        run_slug=request.run_slug or "unknown-run",
        implementation_branch=target_branch,
        manifest_locator=artifact_plan.manifest,
        implementation_pr_number=stack_dashboard_pr_number(request.target_pr),
        implementation_pr_url=stack_dashboard_pr_url(request.target_pr),
        reviewer_run_count=len(triage_result.collection.reviewer_runs),
        finding_count=triage_result.collection.finding_count,
        counts=StackDashboardCounts(
            accepted=finding_status_count(triage_result, status="accepted"),
            rejected=finding_status_count(triage_result, status="rejected"),
            superseded=finding_status_count(triage_result, status="merged"),
            submitted=submitted_count,
            failed=0,
            blocked=0,
        ),
        batches=dashboard_batches,
        rejected_findings=tuple(
            RejectedStackFinding(
                finding_id=finding.id,
                summary=finding.summary,
                rationale=finding.rationale,
            )
            for finding in triage_findings(triage_result)
            if finding.status == "rejected"
        ),
    )


def _dashboard_batches(
    *,
    batches: tuple[StackTriageBatch, ...],
    resolver_outputs: tuple[StackResolverOutput, ...],
    generated_branches: tuple[GeneratedStackBranch, ...],
) -> tuple[StackDashboardBatch, ...]:
    outputs_by_slug = {output.batch_slug: output for output in resolver_outputs}
    branches_by_slug = {branch.batch_slug: branch for branch in generated_branches}
    rendered: list[StackDashboardBatch] = []
    for batch in batches:
        output = outputs_by_slug.get(batch.slug)
        branch = branches_by_slug.get(batch.slug)
        rendered.append(
            StackDashboardBatch(
                slug=batch.slug,
                title=batch.title,
                finding_ids=batch.finding_ids,
                confidence=batch.confidence,
                risk=batch.risk,
                summary=output.summary if output is not None else batch.summary,
                generated_branch=branch.branch_name if branch is not None else None,
                resolver_status=output.status if output is not None else None,
                validation_status="passed" if output is not None else None,
                validation_summary=_validation_summary(output) if output is not None else None,
            )
        )
    return tuple(rendered)


def _validation_summary(output: StackResolverOutput) -> str:
    return "; ".join(
        f"{validation.command}: {validation.status} ({validation.output_summary})"
        for validation in output.validation
    )
