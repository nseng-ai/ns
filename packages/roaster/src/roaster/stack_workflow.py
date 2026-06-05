"""Orchestration for roaster Graphite stack workflows."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from asdl_core.clinkr.models import ClinkrModel
from asdl_core.clinkr.non_ideal_state import error_type_for
from asdl_core.gh.pr_gateway import PRGateway
from brmem.gateway import BranchMemoryGateway
from roaster.gateways.agent_runner.gateway import (
    AgentRunCompleted,
    AgentRunnerGateway,
    AgentRunnerRequest,
)
from roaster.gateways.graphite_stack.gateway import (
    GraphiteAttachTip,
    GraphiteBranchExists,
    GraphiteStackCommandCompleted,
    GraphiteStackFailure,
    GraphiteStackGateway,
    GraphiteTargetStack,
)
from roaster.gateways.local_diff.gateway import LocalDiffGateway
from roaster.gateways.review_catalog.gateway import ReviewCatalogGateway
from roaster.harness.invocation import HarnessRuntime
from roaster.stack_agent_output import StackAgentOutputParseError, parse_resolver_output_result
from roaster.stack_dashboard import (
    RejectedStackFinding,
    StackDashboardBatch,
    StackDashboardCounts,
    StackDashboardPublication,
    StackDashboardPublicationError,
    StackDashboardState,
    publish_stack_dashboard,
    render_stack_dashboard,
)
from roaster.stack_graphite import (
    StackBatchOrderingError,
    generated_branch_for_batch,
    order_stack_triage_batches,
)
from roaster.stack_markers import render_stack_dashboard_marker
from roaster.stack_models import (
    GeneratedStackBranch,
    StackDashboardRow,
    StackResolverOutput,
    StackRunManifest,
    StackTriageBatch,
    StackTriageFinding,
    StackWorkflowRequest,
    StackWorkflowResult,
)
from roaster.stack_profile import StackProfile
from roaster.stack_run_storage import (
    StackRunArtifactPlan,
    StackRunIndex,
    StackRunLocator,
    StackRunStorageError,
    add_run_to_index,
    select_stack_run_slug,
    stack_run_artifact_plan,
    write_stack_run_index,
    write_stack_run_manifest,
    write_stack_run_resolver,
    write_stack_run_triage,
)
from roaster.stack_slugs import StackSlugError, validate_branch_memory_segment
from roaster.stack_triage import StackTriageFailure, StackTriageResult, run_stack_triage

STACK_RESOLVER_PROMPT_RESOURCE = "stack_resolver.md"
RESOLVER_ALLOWED_TOOLS = ("Read", "Edit", "MultiEdit", "Write", "Bash")


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


@dataclass(frozen=True)
class StackAttachContext:
    """Resolved target branch, attach tip, and dashboard PR for a mutating stack run."""

    target_branch: str
    attach_tip: str
    target_pr: str


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
    graphite_stack: GraphiteStackGateway | None = None,
) -> StackDryRunResult | StackWorkflowResult | StackWorkflowFailure:
    """Execute deterministic read-only stack planning for ``roaster stack run --dry-run``."""
    if not request.dry_run:
        return _run_stack_workflow_mutating(
            profile=profile,
            request=request,
            cwd=cwd,
            catalog=catalog,
            diff=diff,
            harness_runtime=harness_runtime,
            agent_runner=agent_runner,
            branch_memory=branch_memory,
            pr_gateway=pr_gateway,
            graphite_stack=graphite_stack,
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


def _run_stack_workflow_mutating(
    *,
    profile: StackProfile,
    request: StackWorkflowRequest,
    cwd: Path,
    catalog: ReviewCatalogGateway,
    diff: LocalDiffGateway,
    harness_runtime: HarnessRuntime,
    agent_runner: AgentRunnerGateway | None,
    branch_memory: BranchMemoryGateway | None,
    pr_gateway: PRGateway | None,
    graphite_stack: GraphiteStackGateway | None,
) -> StackWorkflowResult | StackWorkflowFailure:
    if branch_memory is None:
        return StackWorkflowFailure(
            error_type="stack_branch_memory_unavailable",
            message="Branch Memory gateway is unavailable for roaster stack run.",
        )
    if agent_runner is None:
        return StackWorkflowFailure(
            error_type="agent_runner_unavailable",
            message="Roaster stack agent runner is unavailable for resolver orchestration.",
        )
    if pr_gateway is None:
        return StackWorkflowFailure(
            error_type="stack_pr_gateway_unavailable",
            message="PR gateway is unavailable for roaster stack dashboard publication.",
        )
    if graphite_stack is None:
        return StackWorkflowFailure(
            error_type="graphite_stack_gateway_unavailable",
            message="Graphite stack gateway is unavailable for roaster stack run.",
        )

    attach_context = _resolve_attach_context(
        request=request,
        cwd=cwd,
        graphite_stack=graphite_stack,
    )
    if isinstance(attach_context, StackWorkflowFailure):
        return attach_context

    impl_branch_slug = _impl_branch_slug(attach_context.target_branch)
    if isinstance(impl_branch_slug, StackWorkflowFailure):
        return impl_branch_slug

    try:
        selection = select_stack_run_slug(
            branch_memory,
            impl_branch=attach_context.target_branch,
            impl_branch_slug=impl_branch_slug,
            profile_slug=profile.slug,
            run_slug_stem=f"{impl_branch_slug}-{profile.slug}",
            new_run=request.new_run,
            run_slug=request.run_slug,
        )
        artifact_plan = stack_run_artifact_plan(
            impl_branch=attach_context.target_branch,
            impl_branch_slug=impl_branch_slug,
            profile_slug=profile.slug,
            run_slug=selection.run_slug,
        )
    except StackRunStorageError as exc:
        return StackWorkflowFailure(error_type="stack_run_storage_invalid", message=str(exc))

    resolved_request = request.model_copy(
        update={
            "target_branch": attach_context.target_branch,
            "target_pr": attach_context.target_pr,
            "run_slug": selection.run_slug,
        }
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

    ordered_result = order_stack_triage_batches(_triage_batches(triage_result))
    if isinstance(ordered_result, StackBatchOrderingError):
        return StackWorkflowFailure(
            error_type=ordered_result.error_type,
            message=ordered_result.message,
        )
    ordered_batches = ordered_result

    manifest = StackRunManifest(
        profile_slug=profile.slug,
        run_slug=selection.run_slug,
        impl_branch_slug=impl_branch_slug,
        base_ref=request.base_ref,
        target_branch=attach_context.target_branch,
        target_pr=attach_context.target_pr,
        batch_slugs=tuple(batch.slug for batch in ordered_batches),
    )
    storage_failure = _persist_run_start(
        branch_memory=branch_memory,
        impl_branch=attach_context.target_branch,
        impl_branch_slug=impl_branch_slug,
        profile_slug=profile.slug,
        run_slug=selection.run_slug,
        index=selection.index,
        triage_result=triage_result,
        manifest=manifest,
    )
    if storage_failure is not None:
        return storage_failure

    initial_dashboard = _publish_dashboard(
        pr_gateway=pr_gateway,
        profile=profile,
        request=resolved_request,
        implementation_branch=attach_context.target_branch,
        implementation_pr_number=_pr_number(attach_context.target_pr),
        artifact_plan=artifact_plan,
        triage_result=triage_result,
        batches=ordered_batches,
        resolver_outputs=(),
        generated_branches=(),
        activity_entry="Prepared roaster stack run before generated branch mutation.",
    )
    if isinstance(initial_dashboard, StackWorkflowFailure):
        return initial_dashboard

    if not ordered_batches:
        return StackWorkflowResult(
            run_slug=selection.run_slug,
            status="completed",
            manifest=manifest,
            dashboard_rows=(),
        )

    checkout_attach = graphite_stack.checkout_branch(cwd=cwd, branch_name=attach_context.attach_tip)
    checkout_failure = _graphite_failure(checkout_attach)
    if checkout_failure is not None:
        return checkout_failure

    generated_branches: list[GeneratedStackBranch] = []
    resolver_outputs: list[StackResolverOutput] = []
    dashboard_rows: list[StackDashboardRow] = []

    for batch in ordered_batches:
        branch = generated_branch_for_batch(
            impl_branch_slug=impl_branch_slug,
            run_slug=selection.run_slug,
            batch=batch,
        )
        exists_result = graphite_stack.branch_exists(cwd=cwd, branch_name=branch.branch_name)
        if isinstance(exists_result, GraphiteStackFailure):
            return StackWorkflowFailure(
                error_type=exists_result.error_type,
                message=exists_result.message,
            )
        assert isinstance(exists_result, GraphiteBranchExists)

        if exists_result.exists:
            checkout_result = graphite_stack.checkout_branch(
                cwd=cwd,
                branch_name=branch.branch_name,
            )
            checkout_failure = _graphite_failure(checkout_result)
            if checkout_failure is not None:
                return checkout_failure

        resolver_result = agent_runner.run_agent(
            AgentRunnerRequest(
                kind="resolver",
                prompt_resource=STACK_RESOLVER_PROMPT_RESOURCE,
                prompt_override=request.resolver_prompt,
                model=request.agent_model,
                cwd=cwd,
                input_markdown=_resolver_input_markdown(
                    profile=profile,
                    request=resolved_request,
                    batch=batch,
                    triage_result=triage_result,
                    manifest=manifest,
                    branch=branch,
                    existing_branch=exists_result.exists,
                ),
                allowed_tools=RESOLVER_ALLOWED_TOOLS,
            )
        )
        if not isinstance(resolver_result, AgentRunCompleted):
            return StackWorkflowFailure(
                error_type=error_type_for(resolver_result),
                message=resolver_result.message,
            )

        resolver_output = parse_resolver_output_result(
            resolver_result.output_markdown,
            expected_batch_slug=batch.slug,
        )
        if isinstance(resolver_output, StackAgentOutputParseError):
            return StackWorkflowFailure(
                error_type="stack_resolver_invalid_output",
                message=(
                    f"Resolver agent output for {batch.slug!r} was invalid: "
                    f"{resolver_output.message}"
                ),
            )

        resolver_write_failure = _persist_resolver_output(
            branch_memory=branch_memory,
            impl_branch=attach_context.target_branch,
            impl_branch_slug=impl_branch_slug,
            profile_slug=profile.slug,
            run_slug=selection.run_slug,
            batch_slug=batch.slug,
            output_markdown=resolver_result.output_markdown,
        )
        if resolver_write_failure is not None:
            return resolver_write_failure

        if exists_result.exists:
            mutation_result = graphite_stack.update_generated_branch(
                cwd=cwd,
                branch_name=branch.branch_name,
                batch_title=batch.title,
            )
        else:
            mutation_result = graphite_stack.create_generated_branch(
                cwd=cwd,
                branch_name=branch.branch_name,
                batch_title=batch.title,
            )
        mutation_failure = _graphite_failure(mutation_result)
        if mutation_failure is not None:
            return mutation_failure

        generated_branches.append(branch)
        resolver_outputs.append(resolver_output)
        manifest = manifest.model_copy(update={"generated_branches": tuple(generated_branches)})
        manifest_write_failure = _write_manifest(
            branch_memory=branch_memory,
            impl_branch=attach_context.target_branch,
            manifest=manifest,
        )
        if manifest_write_failure is not None:
            return manifest_write_failure

        dashboard_rows = _dashboard_rows(
            batches=ordered_batches,
            resolver_outputs=tuple(resolver_outputs),
            generated_branches=tuple(generated_branches),
        )
        batch_dashboard = _publish_dashboard(
            pr_gateway=pr_gateway,
            profile=profile,
            request=resolved_request,
            implementation_branch=attach_context.target_branch,
            implementation_pr_number=_pr_number(attach_context.target_pr),
            artifact_plan=artifact_plan,
            triage_result=triage_result,
            batches=ordered_batches,
            resolver_outputs=tuple(resolver_outputs),
            generated_branches=tuple(generated_branches),
            activity_entry=f"Resolved batch `{batch.slug}` on `{branch.branch_name}`.",
        )
        if isinstance(batch_dashboard, StackWorkflowFailure):
            return batch_dashboard

    submit_result = graphite_stack.submit_generated_stack(cwd=cwd)
    submit_failure = _graphite_failure(submit_result)
    if submit_failure is not None:
        return submit_failure

    final_dashboard = _publish_dashboard(
        pr_gateway=pr_gateway,
        profile=profile,
        request=resolved_request,
        implementation_branch=attach_context.target_branch,
        implementation_pr_number=_pr_number(attach_context.target_pr),
        artifact_plan=artifact_plan,
        triage_result=triage_result,
        batches=ordered_batches,
        resolver_outputs=tuple(resolver_outputs),
        generated_branches=tuple(generated_branches),
        submitted_count=len(generated_branches),
        activity_entry="Submitted generated roaster stack.",
    )
    if isinstance(final_dashboard, StackWorkflowFailure):
        return final_dashboard

    return StackWorkflowResult(
        run_slug=selection.run_slug,
        status="completed",
        manifest=manifest,
        dashboard_rows=tuple(dashboard_rows),
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


def _resolve_attach_context(
    *,
    request: StackWorkflowRequest,
    cwd: Path,
    graphite_stack: GraphiteStackGateway,
) -> StackAttachContext | StackWorkflowFailure:
    target_branch = _explicit_target_branch(request)
    if isinstance(target_branch, str):
        target_pr = _explicit_target_pr(request)
        if target_pr is None:
            return StackWorkflowFailure(
                error_type="stack_target_pr_required",
                message="roaster stack run needs --target-pr to publish the dashboard.",
            )
        return StackAttachContext(
            target_branch=target_branch,
            attach_tip=target_branch,
            target_pr=target_pr,
        )

    stack = graphite_stack.read_current_stack(cwd=cwd)
    if isinstance(stack, GraphiteStackFailure):
        return StackWorkflowFailure(error_type=stack.error_type, message=stack.message)
    assert isinstance(stack, GraphiteTargetStack)
    target_pr = _explicit_target_pr(request) or stack.implementation_pr
    if target_pr is None:
        return StackWorkflowFailure(
            error_type="stack_target_pr_required",
            message=("roaster stack run could not resolve an implementation PR; pass --target-pr."),
        )
    return StackAttachContext(
        target_branch=stack.target_branch,
        attach_tip=stack.attach_tip,
        target_pr=target_pr,
    )


def _explicit_target_branch(request: StackWorkflowRequest) -> str | None:
    if request.target_branch is not None and request.target_branch.strip():
        return request.target_branch.strip()
    return None


def _explicit_target_pr(request: StackWorkflowRequest) -> str | None:
    if request.target_pr is not None and request.target_pr.strip():
        return request.target_pr.strip()
    return None


def _graphite_failure(
    result: GraphiteStackCommandCompleted
    | GraphiteStackFailure
    | GraphiteAttachTip
    | GraphiteBranchExists,
) -> StackWorkflowFailure | None:
    if not isinstance(result, GraphiteStackFailure):
        return None
    return StackWorkflowFailure(error_type=result.error_type, message=result.message)


def _triage_batches(result: StackTriageResult) -> tuple[StackTriageBatch, ...]:
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


def _persist_run_start(
    *,
    branch_memory: BranchMemoryGateway,
    impl_branch: str,
    impl_branch_slug: str,
    profile_slug: str,
    run_slug: str,
    index: StackRunIndex | None,
    triage_result: StackTriageResult,
    manifest: StackRunManifest,
) -> StackWorkflowFailure | None:
    try:
        next_index = add_run_to_index(
            index,
            impl_branch_slug=impl_branch_slug,
            profile_slug=profile_slug,
            run_slug=run_slug,
        )
        write_stack_run_index(branch_memory, impl_branch=impl_branch, index=next_index)
        write_stack_run_manifest(branch_memory, impl_branch=impl_branch, manifest=manifest)
        write_stack_run_triage(
            branch_memory,
            impl_branch=impl_branch,
            impl_branch_slug=impl_branch_slug,
            profile_slug=profile_slug,
            run_slug=run_slug,
            content=_triage_artifact_content(triage_result),
        )
    except Exception as exc:
        return StackWorkflowFailure(
            error_type="stack_run_storage_write_failed",
            message=f"failed to persist roaster stack run artifacts: {exc}",
        )
    return None


def _write_manifest(
    *,
    branch_memory: BranchMemoryGateway,
    impl_branch: str,
    manifest: StackRunManifest,
) -> StackWorkflowFailure | None:
    try:
        write_stack_run_manifest(branch_memory, impl_branch=impl_branch, manifest=manifest)
    except Exception as exc:
        return StackWorkflowFailure(
            error_type="stack_run_storage_write_failed",
            message=f"failed to persist roaster stack manifest: {exc}",
        )
    return None


def _persist_resolver_output(
    *,
    branch_memory: BranchMemoryGateway,
    impl_branch: str,
    impl_branch_slug: str,
    profile_slug: str,
    run_slug: str,
    batch_slug: str,
    output_markdown: str,
) -> StackWorkflowFailure | None:
    try:
        write_stack_run_resolver(
            branch_memory,
            impl_branch=impl_branch,
            impl_branch_slug=impl_branch_slug,
            profile_slug=profile_slug,
            run_slug=run_slug,
            batch_slug=batch_slug,
            content=output_markdown,
        )
    except Exception as exc:
        return StackWorkflowFailure(
            error_type="stack_run_storage_write_failed",
            message=f"failed to persist resolver output for {batch_slug!r}: {exc}",
        )
    return None


def _triage_artifact_content(result: StackTriageResult) -> str:
    if result.agent_output_markdown is not None:
        return result.agent_output_markdown
    return "# Roaster stack triage\n\nNo triage agent was run because no reviewers were selected.\n"


def _publish_dashboard(
    *,
    pr_gateway: PRGateway,
    profile: StackProfile,
    request: StackWorkflowRequest,
    implementation_branch: str,
    implementation_pr_number: int | None,
    artifact_plan: StackRunArtifactPlan,
    triage_result: StackTriageResult,
    batches: tuple[StackTriageBatch, ...],
    resolver_outputs: tuple[StackResolverOutput, ...],
    generated_branches: tuple[GeneratedStackBranch, ...],
    submitted_count: int = 0,
    activity_entry: str | None = None,
) -> StackWorkflowFailure | None:
    if implementation_pr_number is None:
        return StackWorkflowFailure(
            error_type="stack_target_pr_invalid",
            message=(
                "roaster stack run needs a numeric implementation PR for dashboard publication."
            ),
        )
    publication = publish_stack_dashboard(
        pr_gateway,
        implementation_pr_number=implementation_pr_number,
        state=_dashboard_state(
            profile=profile,
            request=request,
            target_branch=implementation_branch,
            artifact_plan=artifact_plan,
            triage_result=triage_result,
            batches=batches,
            resolver_outputs=resolver_outputs,
            generated_branches=generated_branches,
            submitted_count=submitted_count,
        ),
        activity_entry=activity_entry,
    )
    if isinstance(publication, StackDashboardPublicationError):
        return StackWorkflowFailure(
            error_type=publication.error_type,
            message=publication.message,
        )
    assert isinstance(publication, StackDashboardPublication)
    return None


def _resolver_input_markdown(
    *,
    profile: StackProfile,
    request: StackWorkflowRequest,
    batch: StackTriageBatch,
    triage_result: StackTriageResult,
    manifest: StackRunManifest,
    branch: GeneratedStackBranch,
    existing_branch: bool,
) -> str:
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
    for finding in _triage_findings(triage_result):
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


def _dashboard_rows(
    *,
    batches: tuple[StackTriageBatch, ...],
    resolver_outputs: tuple[StackResolverOutput, ...],
    generated_branches: tuple[GeneratedStackBranch, ...],
) -> list[StackDashboardRow]:
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


def _validation_summary(output: StackResolverOutput) -> str:
    return "; ".join(
        f"{validation.command}: {validation.status} ({validation.output_summary})"
        for validation in output.validation
    )


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


def _dashboard_state(
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
    dashboard_batches = _dashboard_batches(
        batches=batches or _triage_batches(triage_result),
        resolver_outputs=resolver_outputs,
        generated_branches=generated_branches,
    )
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
            for finding in _triage_findings(triage_result)
            if finding.status == "rejected"
        ),
    )


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
