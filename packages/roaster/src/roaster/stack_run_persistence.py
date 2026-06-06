"""Run manifest checkpoint helpers for roaster stack workflows."""

from __future__ import annotations

from dataclasses import dataclass

from brmem.gateway import BranchMemoryGateway
from roaster.stack_dashboard import StackDashboardPublication
from roaster.stack_markers import render_stack_dashboard_marker
from roaster.stack_models import (
    GeneratedStackBranch,
    StackBatchStatus,
    StackGeneratedBranchStatus,
    StackResolverOutput,
    StackRunArtifactLocator,
    StackRunBatchState,
    StackRunDashboardPublication,
    StackRunFailureContext,
    StackRunManifest,
    StackRunSubmission,
    StackTriageBatch,
)
from roaster.stack_run_storage import (
    ROASTER_RUNS_NAMESPACE,
    StackRunIndex,
    StackRunLocator,
    add_run_to_index,
    write_stack_run_index,
    write_stack_run_manifest,
    write_stack_run_resolver,
    write_stack_run_triage,
)
from roaster.stack_triage import StackTriageResult


@dataclass(frozen=True)
class StackRunPersistenceFailure:
    """Storage/persistence failure shape for stack run checkpoint helpers."""

    error_type: str
    message: str


def initial_batch_states(batches: tuple[StackTriageBatch, ...]) -> tuple[StackRunBatchState, ...]:
    """Build initial pending manifest state for ordered resolver batches."""
    return tuple(
        StackRunBatchState(
            batch_slug=batch.slug,
            title=batch.title,
            status="pending",
            finding_ids=batch.finding_ids,
            dependencies=batch.dependencies,
            confidence=batch.confidence,
            risk=batch.risk,
            resolver_mandate=batch.resolver_mandate,
            validation_requirements=batch.validation_requirements,
            expected_paths=batch.expected_paths,
            summary=batch.summary,
        )
        for batch in batches
    )


def manifest_with_batch_state(
    manifest: StackRunManifest,
    *,
    batch: StackTriageBatch,
    status: StackBatchStatus,
    generated_branch: GeneratedStackBranch | None = None,
    generated_branch_status: StackGeneratedBranchStatus | None = None,
    resolver_locator: StackRunArtifactLocator | None = None,
    resolver_output: StackResolverOutput | None = None,
    failure: StackRunPersistenceFailure | None = None,
) -> StackRunManifest:
    """Return ``manifest`` with one batch checkpoint replaced in manifest order."""
    updated_state = StackRunBatchState(
        batch_slug=batch.slug,
        title=batch.title,
        status=status,
        finding_ids=batch.finding_ids,
        dependencies=batch.dependencies,
        confidence=batch.confidence,
        risk=batch.risk,
        resolver_mandate=batch.resolver_mandate,
        validation_requirements=batch.validation_requirements,
        expected_paths=batch.expected_paths,
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


def write_batch_failure(
    *,
    branch_memory: BranchMemoryGateway,
    impl_branch: str,
    manifest: StackRunManifest,
    batch: StackTriageBatch,
    failure: StackRunPersistenceFailure,
    generated_branch: GeneratedStackBranch | None = None,
    resolver_locator: StackRunArtifactLocator | None = None,
) -> StackRunPersistenceFailure | None:
    """Persist a failed batch checkpoint and return any storage failure."""
    failed_manifest = manifest_with_batch_state(
        manifest,
        batch=batch,
        status="failed",
        generated_branch=generated_branch,
        generated_branch_status="planned" if generated_branch is not None else None,
        resolver_locator=resolver_locator,
        failure=failure,
    )
    return write_manifest(
        branch_memory=branch_memory,
        impl_branch=impl_branch,
        manifest=failed_manifest,
    )


def manifest_with_dashboard_publication(
    manifest: StackRunManifest,
    *,
    publication: StackDashboardPublication,
    target_pr: str,
    profile_slug: str,
) -> StackRunManifest:
    """Return ``manifest`` with durable dashboard publication linkage."""
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


def manifest_with_submission_failure(
    manifest: StackRunManifest,
    failure: StackRunPersistenceFailure,
) -> StackRunManifest:
    """Return ``manifest`` with failed generated-stack submission state."""
    return manifest.model_copy(
        update={
            "submission": StackRunSubmission(
                status="failed",
                failure=_failure_context(failure),
            )
        }
    )


def manifest_with_submission_success(manifest: StackRunManifest) -> StackRunManifest:
    """Return ``manifest`` with successful generated-stack submission state."""
    return manifest.model_copy(update={"submission": StackRunSubmission(status="submitted")})


def manifest_with_generated_branches(
    manifest: StackRunManifest,
    generated_branches: tuple[GeneratedStackBranch, ...],
) -> StackRunManifest:
    """Return ``manifest`` with the current generated branch list."""
    return manifest.model_copy(update={"generated_branches": generated_branches})


def persist_run_start(
    *,
    branch_memory: BranchMemoryGateway,
    impl_branch: str,
    impl_branch_slug: str,
    profile_slug: str,
    run_slug: str,
    index: StackRunIndex | None,
    triage_result: StackTriageResult,
    manifest: StackRunManifest,
    namespace: str = ROASTER_RUNS_NAMESPACE,
) -> StackRunPersistenceFailure | None:
    """Persist the initial run index, manifest, and triage artifact checkpoint."""
    try:
        next_index = add_run_to_index(
            index,
            impl_branch_slug=impl_branch_slug,
            profile_slug=profile_slug,
            run_slug=run_slug,
        )
        write_stack_run_index(
            branch_memory,
            impl_branch=impl_branch,
            index=next_index,
            namespace=namespace,
        )
        write_stack_run_manifest(
            branch_memory,
            impl_branch=impl_branch,
            manifest=manifest,
            namespace=namespace,
        )
        write_stack_run_triage(
            branch_memory,
            impl_branch=impl_branch,
            impl_branch_slug=impl_branch_slug,
            profile_slug=profile_slug,
            run_slug=run_slug,
            content=triage_artifact_content(triage_result),
            namespace=namespace,
        )
    except Exception as exc:
        return StackRunPersistenceFailure(
            error_type="stack_run_storage_write_failed",
            message=f"failed to persist roaster stack run artifacts: {exc}",
        )
    return None


def write_manifest(
    *,
    branch_memory: BranchMemoryGateway,
    impl_branch: str,
    manifest: StackRunManifest,
    namespace: str = ROASTER_RUNS_NAMESPACE,
) -> StackRunPersistenceFailure | None:
    """Persist one manifest checkpoint and return a workflow-shaped failure on error."""
    try:
        write_stack_run_manifest(
            branch_memory,
            impl_branch=impl_branch,
            manifest=manifest,
            namespace=namespace,
        )
    except Exception as exc:
        return StackRunPersistenceFailure(
            error_type="stack_run_storage_write_failed",
            message=f"failed to persist roaster stack manifest: {exc}",
        )
    return None


def persist_resolver_output(
    *,
    branch_memory: BranchMemoryGateway,
    impl_branch: str,
    impl_branch_slug: str,
    profile_slug: str,
    run_slug: str,
    batch_slug: str,
    output_markdown: str,
    namespace: str = ROASTER_RUNS_NAMESPACE,
) -> StackRunArtifactLocator | StackRunPersistenceFailure:
    """Persist one resolver artifact and return its manifest locator."""
    try:
        locator = write_stack_run_resolver(
            branch_memory,
            impl_branch=impl_branch,
            impl_branch_slug=impl_branch_slug,
            profile_slug=profile_slug,
            run_slug=run_slug,
            batch_slug=batch_slug,
            content=output_markdown,
            namespace=namespace,
        )
    except Exception as exc:
        return StackRunPersistenceFailure(
            error_type="stack_run_storage_write_failed",
            message=f"failed to persist resolver output for {batch_slug!r}: {exc}",
        )
    return _artifact_locator(locator)


def triage_artifact_content(result: StackTriageResult) -> str:
    """Return persisted triage artifact content for a stack run."""
    if result.agent_output_markdown is not None:
        return result.agent_output_markdown
    return "# Roaster stack triage\n\nNo triage agent was run because no reviewers were selected.\n"


def _failure_context(
    failure: StackRunPersistenceFailure | None,
) -> StackRunFailureContext | None:
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
