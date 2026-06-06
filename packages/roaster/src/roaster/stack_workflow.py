"""Orchestration for roaster Graphite stack workflows."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

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
    StackDashboardPublication,
    StackDashboardPublicationError,
    publish_stack_dashboard,
    render_stack_dashboard,
)
from roaster.stack_dashboard_projection import (
    build_stack_dashboard_rows,
    build_stack_dashboard_state,
    stack_dashboard_pr_number,
)
from roaster.stack_dry_run import (
    StackDryRunResult,
    batch_summaries,
    dry_run_actions,
    dry_run_locators,
    finding_summaries,
    reviewer_summaries,
)
from roaster.stack_graphite import (
    StackBatchOrderingError,
    generated_branch_for_batch,
    order_stack_triage_batches,
)
from roaster.stack_markers import render_stack_dashboard_marker
from roaster.stack_models import (
    GeneratedStackBranch,
    StackBatchStatus,
    StackDashboardRow,
    StackGeneratedBranchStatus,
    StackResolverOutput,
    StackRunArtifactLocator,
    StackRunBatchState,
    StackRunDashboardPublication,
    StackRunFailureContext,
    StackRunManifest,
    StackRunSubmission,
    StackTriageBatch,
    StackWorkflowRequest,
    StackWorkflowResult,
)
from roaster.stack_profile import StackProfile
from roaster.stack_resolver_input import render_stack_resolver_input
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
from roaster.stack_triage_view import (
    finding_status_count,
    triage_batches,
    triage_summary,
)

STACK_RESOLVER_PROMPT_RESOURCE = "stack_resolver.md"
RESOLVER_ALLOWED_TOOLS = ("Read", "Edit", "MultiEdit", "Write", "Bash")


@dataclass(frozen=True)
class StackWorkflowFailure:
    """A non-ideal result for stack dry-run orchestration."""

    error_type: str
    message: str


@dataclass(frozen=True)
class StackAttachContext:
    """Resolved target branch, attach tip, and dashboard PR for a mutating stack run."""

    target_branch: str
    attach_tip: str
    target_pr: str


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

    dry_run_batches = triage_batches(triage_result)
    manifest = StackRunManifest(
        profile_slug=profile.slug,
        run_slug=selection.run_slug,
        impl_branch_slug=impl_branch_slug,
        base_ref=request.base_ref,
        target_branch=target_branch,
        target_pr=request.target_pr,
        batch_slugs=tuple(batch.slug for batch in dry_run_batches),
        batch_states=_initial_batch_states(dry_run_batches),
    )
    dashboard_markdown = render_stack_dashboard(
        build_stack_dashboard_state(
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
        accepted_count=finding_status_count(triage_result, status="accepted"),
        rejected_count=finding_status_count(triage_result, status="rejected"),
        superseded_count=finding_status_count(triage_result, status="merged"),
        model=request.model,
        agent_model=request.agent_model,
        harness=request.harness,
        triage_prompt=request.triage_prompt,
        resolver_prompt=request.resolver_prompt,
        triage_summary=triage_summary(triage_result),
        reviewer_runs=reviewer_summaries(triage_result),
        findings=finding_summaries(triage_result),
        batches=batch_summaries(triage_result),
        actions=dry_run_actions(triage_result),
        manifest=manifest,
        locators=dry_run_locators(
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

    ordered_result = order_stack_triage_batches(triage_batches(triage_result))
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
        batch_states=_initial_batch_states(ordered_batches),
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
        implementation_pr_number=stack_dashboard_pr_number(attach_context.target_pr),
        artifact_plan=artifact_plan,
        triage_result=triage_result,
        batches=ordered_batches,
        resolver_outputs=(),
        generated_branches=(),
        activity_entry="Prepared roaster stack run before generated branch mutation.",
    )
    if isinstance(initial_dashboard, StackWorkflowFailure):
        return initial_dashboard
    manifest = _manifest_with_dashboard_publication(
        manifest,
        publication=initial_dashboard,
        target_pr=attach_context.target_pr,
        profile_slug=profile.slug,
    )
    manifest_write_failure = _write_manifest(
        branch_memory=branch_memory,
        impl_branch=attach_context.target_branch,
        manifest=manifest,
    )
    if manifest_write_failure is not None:
        return manifest_write_failure

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
        manifest = _manifest_with_batch_state(
            manifest,
            batch=batch,
            status="running",
            generated_branch=branch,
            generated_branch_status="planned",
        )
        manifest_write_failure = _write_manifest(
            branch_memory=branch_memory,
            impl_branch=attach_context.target_branch,
            manifest=manifest,
        )
        if manifest_write_failure is not None:
            return manifest_write_failure

        exists_result = graphite_stack.branch_exists(cwd=cwd, branch_name=branch.branch_name)
        if isinstance(exists_result, GraphiteStackFailure):
            failure = StackWorkflowFailure(
                error_type=exists_result.error_type,
                message=exists_result.message,
            )
            record_failure = _write_batch_failure(
                branch_memory=branch_memory,
                impl_branch=attach_context.target_branch,
                manifest=manifest,
                batch=batch,
                failure=failure,
                generated_branch=branch,
            )
            return record_failure or failure
        assert isinstance(exists_result, GraphiteBranchExists)

        if exists_result.exists:
            checkout_result = graphite_stack.checkout_branch(
                cwd=cwd,
                branch_name=branch.branch_name,
            )
            checkout_failure = _graphite_failure(checkout_result)
            if checkout_failure is not None:
                record_failure = _write_batch_failure(
                    branch_memory=branch_memory,
                    impl_branch=attach_context.target_branch,
                    manifest=manifest,
                    batch=batch,
                    failure=checkout_failure,
                    generated_branch=branch,
                )
                return record_failure or checkout_failure

        resolver_result = agent_runner.run_agent(
            AgentRunnerRequest(
                kind="resolver",
                prompt_resource=STACK_RESOLVER_PROMPT_RESOURCE,
                prompt_override=request.resolver_prompt,
                model=request.agent_model,
                cwd=cwd,
                input_markdown=render_stack_resolver_input(
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
            failure = StackWorkflowFailure(
                error_type=error_type_for(resolver_result),
                message=resolver_result.message,
            )
            record_failure = _write_batch_failure(
                branch_memory=branch_memory,
                impl_branch=attach_context.target_branch,
                manifest=manifest,
                batch=batch,
                failure=failure,
                generated_branch=branch,
            )
            return record_failure or failure

        resolver_locator = _persist_resolver_output(
            branch_memory=branch_memory,
            impl_branch=attach_context.target_branch,
            impl_branch_slug=impl_branch_slug,
            profile_slug=profile.slug,
            run_slug=selection.run_slug,
            batch_slug=batch.slug,
            output_markdown=resolver_result.output_markdown,
        )
        if isinstance(resolver_locator, StackWorkflowFailure):
            return resolver_locator
        manifest = _manifest_with_batch_state(
            manifest,
            batch=batch,
            status="running",
            generated_branch=branch,
            generated_branch_status="planned",
            resolver_locator=resolver_locator,
        )
        manifest_write_failure = _write_manifest(
            branch_memory=branch_memory,
            impl_branch=attach_context.target_branch,
            manifest=manifest,
        )
        if manifest_write_failure is not None:
            return manifest_write_failure

        resolver_output = parse_resolver_output_result(
            resolver_result.output_markdown,
            expected_batch_slug=batch.slug,
        )
        if isinstance(resolver_output, StackAgentOutputParseError):
            failure = StackWorkflowFailure(
                error_type="stack_resolver_invalid_output",
                message=(
                    f"Resolver agent output for {batch.slug!r} was invalid: "
                    f"{resolver_output.message}"
                ),
            )
            record_failure = _write_batch_failure(
                branch_memory=branch_memory,
                impl_branch=attach_context.target_branch,
                manifest=manifest,
                batch=batch,
                failure=failure,
                generated_branch=branch,
                resolver_locator=resolver_locator,
            )
            return record_failure or failure

        if exists_result.exists:
            mutation_result = graphite_stack.update_generated_branch(
                cwd=cwd,
                branch_name=branch.branch_name,
                batch_title=batch.title,
            )
            generated_branch_status: StackGeneratedBranchStatus = "updated"
        else:
            mutation_result = graphite_stack.create_generated_branch(
                cwd=cwd,
                branch_name=branch.branch_name,
                batch_title=batch.title,
            )
            generated_branch_status = "created"
        mutation_failure = _graphite_failure(mutation_result)
        if mutation_failure is not None:
            record_failure = _write_batch_failure(
                branch_memory=branch_memory,
                impl_branch=attach_context.target_branch,
                manifest=manifest,
                batch=batch,
                failure=mutation_failure,
                generated_branch=branch,
                resolver_locator=resolver_locator,
            )
            return record_failure or mutation_failure

        generated_branches.append(branch)
        resolver_outputs.append(resolver_output)
        manifest = manifest.model_copy(update={"generated_branches": tuple(generated_branches)})
        manifest = _manifest_with_batch_state(
            manifest,
            batch=batch,
            status="completed",
            generated_branch=branch,
            generated_branch_status=generated_branch_status,
            resolver_locator=resolver_locator,
            resolver_output=resolver_output,
        )
        manifest_write_failure = _write_manifest(
            branch_memory=branch_memory,
            impl_branch=attach_context.target_branch,
            manifest=manifest,
        )
        if manifest_write_failure is not None:
            return manifest_write_failure

        dashboard_rows = build_stack_dashboard_rows(
            batches=ordered_batches,
            resolver_outputs=tuple(resolver_outputs),
            generated_branches=tuple(generated_branches),
        )
        batch_dashboard = _publish_dashboard(
            pr_gateway=pr_gateway,
            profile=profile,
            request=resolved_request,
            implementation_branch=attach_context.target_branch,
            implementation_pr_number=stack_dashboard_pr_number(attach_context.target_pr),
            artifact_plan=artifact_plan,
            triage_result=triage_result,
            batches=ordered_batches,
            resolver_outputs=tuple(resolver_outputs),
            generated_branches=tuple(generated_branches),
            activity_entry=f"Resolved batch `{batch.slug}` on `{branch.branch_name}`.",
        )
        if isinstance(batch_dashboard, StackWorkflowFailure):
            return batch_dashboard
        manifest = _manifest_with_dashboard_publication(
            manifest,
            publication=batch_dashboard,
            target_pr=attach_context.target_pr,
            profile_slug=profile.slug,
        )
        manifest_write_failure = _write_manifest(
            branch_memory=branch_memory,
            impl_branch=attach_context.target_branch,
            manifest=manifest,
        )
        if manifest_write_failure is not None:
            return manifest_write_failure

    submit_result = graphite_stack.submit_generated_stack(cwd=cwd)
    submit_failure = _graphite_failure(submit_result)
    if submit_failure is not None:
        manifest = _manifest_with_submission_failure(manifest, submit_failure)
        manifest_write_failure = _write_manifest(
            branch_memory=branch_memory,
            impl_branch=attach_context.target_branch,
            manifest=manifest,
        )
        if manifest_write_failure is not None:
            return manifest_write_failure
        return submit_failure

    manifest = manifest.model_copy(update={"submission": StackRunSubmission(status="submitted")})
    manifest_write_failure = _write_manifest(
        branch_memory=branch_memory,
        impl_branch=attach_context.target_branch,
        manifest=manifest,
    )
    if manifest_write_failure is not None:
        return manifest_write_failure

    final_dashboard = _publish_dashboard(
        pr_gateway=pr_gateway,
        profile=profile,
        request=resolved_request,
        implementation_branch=attach_context.target_branch,
        implementation_pr_number=stack_dashboard_pr_number(attach_context.target_pr),
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
    manifest = _manifest_with_dashboard_publication(
        manifest,
        publication=final_dashboard,
        target_pr=attach_context.target_pr,
        profile_slug=profile.slug,
    )
    manifest_write_failure = _write_manifest(
        branch_memory=branch_memory,
        impl_branch=attach_context.target_branch,
        manifest=manifest,
    )
    if manifest_write_failure is not None:
        return manifest_write_failure

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
        stack = graphite_stack.resolve_attach_tip(cwd=cwd, target_branch=target_branch)
        if isinstance(stack, GraphiteStackFailure):
            return StackWorkflowFailure(error_type=stack.error_type, message=stack.message)
        assert isinstance(stack, GraphiteAttachTip)
        return StackAttachContext(
            target_branch=stack.target_branch,
            attach_tip=stack.attach_tip,
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


def _initial_batch_states(batches: tuple[StackTriageBatch, ...]) -> tuple[StackRunBatchState, ...]:
    return tuple(
        StackRunBatchState(
            batch_slug=batch.slug,
            title=batch.title,
            status="pending",
            summary=batch.summary,
        )
        for batch in batches
    )


def _manifest_with_batch_state(
    manifest: StackRunManifest,
    *,
    batch: StackTriageBatch,
    status: StackBatchStatus,
    generated_branch: GeneratedStackBranch | None = None,
    generated_branch_status: StackGeneratedBranchStatus | None = None,
    resolver_locator: StackRunArtifactLocator | None = None,
    resolver_output: StackResolverOutput | None = None,
    failure: StackWorkflowFailure | None = None,
) -> StackRunManifest:
    updated_state = StackRunBatchState(
        batch_slug=batch.slug,
        title=batch.title,
        status=status,
        generated_branch=generated_branch,
        generated_branch_status=generated_branch_status,
        resolver_locator=resolver_locator,
        resolver_status=resolver_output.status if resolver_output is not None else None,
        summary=resolver_output.summary if resolver_output is not None else batch.summary,
        validation_summary=(
            _validation_summary(resolver_output) if resolver_output is not None else None
        ),
        failure=_failure_context(failure),
    )
    states_by_slug = {state.batch_slug: state for state in manifest.batch_states}
    states_by_slug[batch.slug] = updated_state
    batch_states = tuple(states_by_slug[batch_slug] for batch_slug in manifest.batch_slugs)
    return manifest.model_copy(update={"batch_states": batch_states})


def _write_batch_failure(
    *,
    branch_memory: BranchMemoryGateway,
    impl_branch: str,
    manifest: StackRunManifest,
    batch: StackTriageBatch,
    failure: StackWorkflowFailure,
    generated_branch: GeneratedStackBranch | None = None,
    resolver_locator: StackRunArtifactLocator | None = None,
) -> StackWorkflowFailure | None:
    failed_manifest = _manifest_with_batch_state(
        manifest,
        batch=batch,
        status="failed",
        generated_branch=generated_branch,
        generated_branch_status="planned" if generated_branch is not None else None,
        resolver_locator=resolver_locator,
        failure=failure,
    )
    return _write_manifest(
        branch_memory=branch_memory,
        impl_branch=impl_branch,
        manifest=failed_manifest,
    )


def _manifest_with_dashboard_publication(
    manifest: StackRunManifest,
    *,
    publication: StackDashboardPublication,
    target_pr: str,
    profile_slug: str,
) -> StackRunManifest:
    return manifest.model_copy(
        update={
            "dashboard_publication": StackRunDashboardPublication(
                marker=render_stack_dashboard_marker(profile_slug),
                target_pr=target_pr,
                action=publication.action,
                comment_id=publication.comment.id,
                comment_url=publication.comment.url,
            )
        }
    )


def _manifest_with_submission_failure(
    manifest: StackRunManifest,
    failure: StackWorkflowFailure,
) -> StackRunManifest:
    return manifest.model_copy(
        update={
            "submission": StackRunSubmission(
                status="failed",
                failure=_failure_context(failure),
            )
        }
    )


def _failure_context(failure: StackWorkflowFailure | None) -> StackRunFailureContext | None:
    if failure is None:
        return None
    return StackRunFailureContext(error_type=failure.error_type, message=failure.message)


def _artifact_locator(locator: StackRunLocator) -> StackRunArtifactLocator:
    return StackRunArtifactLocator(
        namespace=locator.namespace,
        key=locator.key,
        branch=locator.branch,
    )


def _validation_summary(output: StackResolverOutput) -> str:
    return "; ".join(
        f"{validation.command}: {validation.status} ({validation.output_summary})"
        for validation in output.validation
    )


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
) -> StackRunArtifactLocator | StackWorkflowFailure:
    try:
        locator = write_stack_run_resolver(
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
    return _artifact_locator(locator)


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
) -> StackDashboardPublication | StackWorkflowFailure:
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
        state=build_stack_dashboard_state(
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
    return publication
