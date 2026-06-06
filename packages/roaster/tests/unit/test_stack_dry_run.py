from __future__ import annotations

from roaster.models import ReviewFinding
from roaster.stack_dry_run import (
    batch_summaries,
    dry_run_actions,
    dry_run_locators,
    finding_summaries,
    reviewer_summaries,
)
from roaster.stack_models import StackTriageBatch, StackTriageFinding, StackTriageOutput
from roaster.stack_run_storage import stack_run_artifact_plan
from roaster.stack_triage import StackReviewCollection, StackReviewerRun, StackTriageResult


def _triage_result() -> StackTriageResult:
    return StackTriageResult(
        collection=StackReviewCollection(
            explicit_reviewers=("dignified-python",),
            selected_reviewers=("dignified-python",),
            reviewer_runs=(
                StackReviewerRun(
                    key="dignified-python",
                    review_name="Dignified Python",
                    review_path="reviews/dignified-python.md",
                    model="sonnet",
                    base_ref="master",
                    findings=(
                        ReviewFinding(
                            path="app.py",
                            line=12,
                            severity="warning",
                            summary="Avoid print",
                            details="Use click.echo().",
                        ),
                    ),
                ),
            ),
            reviewer_failures=(),
            summary="Collected one finding.",
        ),
        triage=StackTriageOutput(
            summary="Accepted one finding.",
            findings=(
                StackTriageFinding(
                    id="F1",
                    source_review="dignified-python",
                    path="app.py",
                    line=12,
                    severity="warning",
                    summary="Avoid print",
                    details="Use click.echo().",
                    status="accepted",
                    rationale="Concrete style issue.",
                    merged_into=None,
                    confidence="high",
                    risk="mechanical",
                ),
            ),
            batches=(
                StackTriageBatch(
                    slug="avoid-print",
                    title="Avoid print",
                    summary="Replace print usage.",
                    finding_ids=("F1",),
                    dependencies=(),
                    confidence="high",
                    risk="mechanical",
                    resolver_mandate="Replace print with click.echo().",
                    validation_requirements=("uv run pytest",),
                ),
            ),
            body="## Explanation\n",
        ),
        agent_output_markdown="---\nsummary: Accepted one finding.\n---\n",
    )


def test_dry_run_actions_preview_artifacts_and_plan_each_batch_without_mutation() -> None:
    actions = dry_run_actions(_triage_result())

    assert [action.action_type for action in actions] == [
        "preview-run-artifacts",
        "plan-resolver-batch",
    ]
    assert [action.batch_slug for action in actions] == [None, "avoid-print"]
    assert all(not action.mutating for action in actions)
    assert actions[0].description == (
        "Compute Branch Memory and dashboard locators without writing them."
    )
    assert "resolver execution" in actions[1].description


def test_dry_run_locators_preview_branch_memory_artifacts_and_dashboard_in_order() -> None:
    artifact_plan = stack_run_artifact_plan(
        impl_branch="feature/target",
        impl_branch_slug="feature-target",
        profile_slug="thermonuclear-stack",
        run_slug="stack-run-1",
    )

    locators = dry_run_locators(
        artifact_plan=artifact_plan,
        batch_slugs=("avoid-print",),
        target_pr="123",
        dashboard_marker="<!-- roaster-stack:thermonuclear-stack -->",
    )

    assert [locator.kind for locator in locators] == [
        "index",
        "manifest",
        "triage",
        "resolver:avoid-print",
        "dashboard",
    ]
    assert locators[0].key == "indexes/feature-target/thermonuclear-stack.md"
    assert locators[3].key == (
        "runs/feature-target/thermonuclear-stack/stack-run-1/batches/avoid-print/resolver.md"
    )
    assert locators[4].target_pr == "123"
    assert locators[4].marker == "<!-- roaster-stack:thermonuclear-stack -->"


def test_dry_run_summaries_preserve_reviewer_finding_and_batch_fields() -> None:
    result = _triage_result()

    reviewer = reviewer_summaries(result)[0]
    finding = finding_summaries(result)[0]
    batch = batch_summaries(result)[0]

    assert reviewer.key == "dignified-python"
    assert reviewer.review_name == "Dignified Python"
    assert reviewer.finding_count == 1
    assert finding.id == "F1"
    assert finding.source_review == "dignified-python"
    assert finding.path == "app.py"
    assert finding.confidence == "high"
    assert batch.slug == "avoid-print"
    assert batch.finding_ids == ("F1",)
    assert batch.validation_requirements == ("uv run pytest",)
