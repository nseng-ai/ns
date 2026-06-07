from __future__ import annotations

from pathlib import Path

from roaster.models import ReviewFinding
from roaster.stack.command.dashboard_projection import (
    build_stack_dashboard_rows,
    build_stack_dashboard_state,
)
from roaster.stack.command.triage import StackReviewCollection, StackReviewerRun, StackTriageResult
from roaster.stack.common.run_models import StackWorkflowRequest
from roaster.stack.common.run_storage import stack_run_artifact_plan
from roaster.stack.core.contracts import (
    GeneratedStackBranch,
    StackResolverOutput,
    StackResolverSafety,
    StackResolverValidation,
    StackTriageBatch,
    StackTriageFinding,
    StackTriageOutput,
)
from roaster.stack.core.profile import StackProfile


def _profile() -> StackProfile:
    return StackProfile(
        slug="thermonuclear-stack",
        path=Path("/repo/.roaster/profiles/thermonuclear-stack.md"),
        guidance="# Guidance\n",
    )


def _request() -> StackWorkflowRequest:
    return StackWorkflowRequest(
        profile_slug="thermonuclear-stack",
        target_branch="feature/target",
        target_pr="https://github.com/acme/widgets/pull/123",
        run_slug="stack-run-1",
    )


def _batch() -> StackTriageBatch:
    return StackTriageBatch(
        slug="avoid-print",
        title="Avoid print",
        summary="Replace print usage.",
        finding_ids=("F1",),
        dependencies=(),
        confidence="high",
        risk="mechanical",
        resolver_mandate="Replace print with click.echo().",
        validation_requirements=("uv run pytest",),
    )


def _triage_result() -> StackTriageResult:
    return StackTriageResult(
        collection=StackReviewCollection(
            explicit_reviewers=("dignified-python",),
            selected_reviewers=("dignified-python",),
            reviewer_runs=(
                StackReviewerRun(
                    key="dignified-python",
                    review_name="Dignified Python",
                    review_path="/repo/reviews/dignified-python.md",
                    model="sonnet",
                    base_ref="master",
                    findings=(
                        ReviewFinding(
                            path="app.py",
                            line=12,
                            severity="warning",
                            summary="Avoid print",
                            details="Use click.echo() instead.",
                        ),
                    ),
                ),
            ),
            reviewer_failures=(),
            summary="Collected one finding.",
        ),
        triage=StackTriageOutput(
            summary="Accepted one finding and rejected one.",
            findings=(
                StackTriageFinding(
                    id="F1",
                    source_review="dignified-python",
                    path="app.py",
                    line=12,
                    severity="warning",
                    summary="Avoid print",
                    details="Use click.echo() instead.",
                    status="accepted",
                    rationale="Concrete style issue.",
                    merged_into=None,
                    confidence="high",
                    risk="mechanical",
                ),
                StackTriageFinding(
                    id="F2",
                    source_review="dignified-python",
                    path="app.py",
                    line=20,
                    severity="info",
                    summary="Out of scope",
                    details=None,
                    status="rejected",
                    rationale="Not part of this stack.",
                    merged_into=None,
                    confidence="medium",
                    risk="speculative",
                ),
            ),
            batches=(_batch(),),
            body="## Explanation\n",
        ),
    )


def _resolver_output() -> StackResolverOutput:
    return StackResolverOutput(
        batch_slug="avoid-print",
        status="completed",
        summary="Resolved print usage.",
        files_changed=("app.py",),
        validation=(
            StackResolverValidation(
                command="uv run pytest packages/roaster/tests/unit/stack/command/test_workflow.py",
                status="passed",
                output_summary="passed",
            ),
        ),
        safety=StackResolverSafety(
            unresolved_conflicts=False,
            destructive_changes=False,
            secrets_or_security_sensitive=False,
            validation_evidence_missing=False,
            notes="No safety concerns.",
        ),
        body="## Resolver notes\n",
    )


def _generated_branch() -> GeneratedStackBranch:
    return GeneratedStackBranch(
        branch_name="feature-target/roaster/stack-run-1/avoid-print",
        impl_branch_slug="feature-target",
        run_slug="stack-run-1",
        batch_slug="avoid-print",
    )


def test_build_stack_dashboard_state_projects_run_counts_batches_and_rejections() -> None:
    state = build_stack_dashboard_state(
        profile=_profile(),
        request=_request(),
        target_branch="feature/target",
        artifact_plan=stack_run_artifact_plan(
            impl_branch="feature/target",
            impl_branch_slug="feature-target",
            profile_slug="thermonuclear-stack",
            run_slug="stack-run-1",
        ),
        triage_result=_triage_result(),
        resolver_outputs=(_resolver_output(),),
        generated_branches=(_generated_branch(),),
        submitted_count=1,
    )

    assert state.profile_slug == "thermonuclear-stack"
    assert state.run_slug == "stack-run-1"
    assert state.implementation_pr_number == 123
    assert state.implementation_pr_url == "https://github.com/acme/widgets/pull/123"
    assert state.reviewer_run_count == 1
    assert state.finding_count == 1
    assert state.counts.accepted == 1
    assert state.counts.rejected == 1
    assert state.counts.submitted == 1
    assert state.batches[0].summary == "Resolved print usage."
    assert state.batches[0].generated_branch == "feature-target/roaster/stack-run-1/avoid-print"
    assert state.batches[0].resolver_status == "completed"
    assert state.batches[0].validation_status == "passed"
    assert state.batches[0].validation_summary == (
        "uv run pytest packages/roaster/tests/unit/stack/command/test_workflow.py: passed (passed)"
    )
    assert state.rejected_findings[0].finding_id == "F2"
    assert state.rejected_findings[0].rationale == "Not part of this stack."


def test_build_stack_dashboard_rows_projects_pending_and_completed_batches() -> None:
    pending_batch = StackTriageBatch(
        slug="pending-cleanup",
        title="Pending cleanup",
        summary="Still queued.",
        finding_ids=("F3",),
        dependencies=(),
        confidence="medium",
        risk="mechanical",
        resolver_mandate="Clean up pending issue.",
        validation_requirements=(),
    )

    rows = build_stack_dashboard_rows(
        batches=(_batch(), pending_batch),
        resolver_outputs=(_resolver_output(),),
        generated_branches=(_generated_branch(),),
    )

    assert rows[0].run_slug == "stack-run-1"
    assert rows[0].batch_slug == "avoid-print"
    assert rows[0].status == "completed"
    assert rows[0].branch_name == "feature-target/roaster/stack-run-1/avoid-print"
    assert rows[0].summary == "Resolved print usage."
    assert rows[1].run_slug == "pending"
    assert rows[1].batch_slug == "pending-cleanup"
    assert rows[1].status == "pending"
    assert rows[1].branch_name is None
    assert rows[1].summary == "Still queued."
