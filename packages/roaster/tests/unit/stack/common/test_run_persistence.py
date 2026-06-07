from __future__ import annotations

from roaster.stack.common.markers import render_stack_dashboard_marker
from roaster.stack.common.run_models import (
    StackRunArtifactLocator,
    StackRunManifest,
)
from roaster.stack.common.run_persistence import (
    StackRunPersistenceFailure,
    initial_batch_states,
    manifest_with_batch_state,
    manifest_with_dashboard_publication,
    manifest_with_generated_branches,
    manifest_with_submission_failure,
    manifest_with_submission_success,
)
from roaster.stack.common.run_storage import ROASTER_RUNS_NAMESPACE
from roaster.stack.core.contracts import (
    GeneratedStackBranch,
    StackResolverOutput,
    StackResolverSafety,
    StackResolverValidation,
    StackTriageBatch,
)


def test_initial_batch_states_preserve_pending_batch_details() -> None:
    batches = (_batch("first"), _batch("second"))

    states = initial_batch_states(batches)

    assert tuple(state.batch_slug for state in states) == ("first", "second")
    assert states[0].title == "First batch"
    assert states[0].summary == "Summary for first."
    assert states[0].status == "pending"
    assert states[1].title == "Second batch"
    assert states[1].summary == "Summary for second."
    assert states[1].status == "pending"


def test_manifest_with_batch_state_updates_ordered_batch_state() -> None:
    first_batch = _batch("first")
    second_batch = _batch("second")
    manifest = _manifest(first_batch, second_batch)
    branch = _generated_branch("second")
    locator = _resolver_locator("second")

    updated = manifest_with_batch_state(
        manifest,
        batch=second_batch,
        status="completed",
        generated_branch=branch,
        generated_branch_status="created",
        resolver_locator=locator,
        resolver_output=_resolver_output("second"),
    )

    assert tuple(state.batch_slug for state in updated.batch_states) == ("first", "second")
    assert updated.batch_states[0] == manifest.batch_states[0]
    assert updated.batch_states[1].status == "completed"
    assert updated.batch_states[1].generated_branch == branch
    assert updated.batch_states[1].generated_branch_status == "created"
    assert updated.batch_states[1].resolver_locator == locator
    assert updated.batch_states[1].resolver_status == "completed"
    assert updated.batch_states[1].summary == "Resolved second."
    assert updated.batch_states[1].validation_summary == "uv run pytest: passed (ok)"


def test_manifest_with_batch_state_records_failure_context() -> None:
    batch = _batch("first")
    failure = StackRunPersistenceFailure(
        error_type="stack_resolver_invalid_output",
        message="resolver output was invalid",
    )

    updated = manifest_with_batch_state(
        _manifest(batch),
        batch=batch,
        status="failed",
        failure=failure,
    )

    assert updated.batch_states[0].status == "failed"
    assert updated.batch_states[0].failure is not None
    assert updated.batch_states[0].failure.error_type == "stack_resolver_invalid_output"
    assert updated.batch_states[0].failure.message == "resolver output was invalid"


def test_manifest_with_dashboard_publication_records_marker_and_comment_linkage() -> None:
    manifest = _manifest(_batch("first"))

    updated = manifest_with_dashboard_publication(
        manifest,
        action="updated",
        comment_id=99,
        comment_url="https://github.com/acme/widgets/pull/123#issuecomment-99",
        target_pr="123",
        profile_slug="thermonuclear-stack",
    )

    assert updated.dashboard_publication is not None
    assert updated.dashboard_publication.marker == render_stack_dashboard_marker(
        "thermonuclear-stack"
    )
    assert updated.dashboard_publication.target_pr == "123"
    assert updated.dashboard_publication.action == "updated"
    assert updated.dashboard_publication.comment_id == 99
    assert updated.dashboard_publication.comment_url == (
        "https://github.com/acme/widgets/pull/123#issuecomment-99"
    )


def test_manifest_with_submission_failure_and_success_set_submission_state() -> None:
    manifest = _manifest(_batch("first"))

    failed = manifest_with_submission_failure(
        manifest,
        StackRunPersistenceFailure(
            error_type="graphite_stack_command_failed",
            message="submit failed",
        ),
    )
    submitted = manifest_with_submission_success(failed)

    assert failed.submission.status == "failed"
    assert failed.submission.failure is not None
    assert failed.submission.failure.error_type == "graphite_stack_command_failed"
    assert failed.submission.failure.message == "submit failed"
    assert submitted.submission.status == "submitted"
    assert submitted.submission.failure is None


def test_manifest_with_generated_branches_replaces_generated_branch_list() -> None:
    branch = _generated_branch("first")

    updated = manifest_with_generated_branches(_manifest(_batch("first")), (branch,))

    assert updated.generated_branches == (branch,)


def _batch(slug: str) -> StackTriageBatch:
    return StackTriageBatch(
        slug=slug,
        title=f"{slug.title()} batch",
        summary=f"Summary for {slug}.",
        finding_ids=(f"{slug}-finding",),
        dependencies=(),
        confidence="high",
        risk="mechanical",
        resolver_mandate=f"Resolve {slug}.",
        validation_requirements=("uv run pytest",),
    )


def _manifest(*batches: StackTriageBatch) -> StackRunManifest:
    return StackRunManifest(
        profile_slug="thermonuclear-stack",
        run_slug="stack-run-1",
        impl_branch_slug="feature-target",
        target_branch="feature/target",
        target_pr="123",
        batch_slugs=tuple(batch.slug for batch in batches),
        batch_states=initial_batch_states(batches),
    )


def _generated_branch(batch_slug: str) -> GeneratedStackBranch:
    return GeneratedStackBranch(
        branch_name=f"feature-target/roaster/stack-run-1/{batch_slug}",
        impl_branch_slug="feature-target",
        run_slug="stack-run-1",
        batch_slug=batch_slug,
    )


def _resolver_locator(batch_slug: str) -> StackRunArtifactLocator:
    return StackRunArtifactLocator(
        namespace=ROASTER_RUNS_NAMESPACE,
        key=f"runs/feature-target/thermonuclear-stack/stack-run-1/batches/{batch_slug}/resolver.md",
        branch="feature/target",
    )


def _resolver_output(batch_slug: str) -> StackResolverOutput:
    return StackResolverOutput(
        batch_slug=batch_slug,
        status="completed",
        summary=f"Resolved {batch_slug}.",
        files_changed=("packages/roaster/src/roaster/stack_workflow.py",),
        validation=(
            StackResolverValidation(
                command="uv run pytest",
                status="passed",
                output_summary="ok",
            ),
        ),
        safety=StackResolverSafety(
            unresolved_conflicts=False,
            destructive_changes=False,
            secrets_or_security_sensitive=False,
            validation_evidence_missing=False,
            notes="No safety concerns.",
        ),
        body="Resolver details.",
    )
