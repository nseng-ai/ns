from __future__ import annotations

from pathlib import Path

from roaster.stack.command.resolver_input import render_stack_resolver_input
from roaster.stack.command.triage import StackReviewCollection, StackTriageResult
from roaster.stack.common.run_models import (
    StackRunManifest,
    StackWorkflowRequest,
)
from roaster.stack.core.contracts import (
    GeneratedStackBranch,
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
        target_pr="123",
        base_ref="master",
        run_slug="stack-run-1",
    )


def _manifest(*, batch_slugs: tuple[str, ...] = ("avoid-print",)) -> StackRunManifest:
    return StackRunManifest(
        profile_slug="thermonuclear-stack",
        run_slug="stack-run-1",
        impl_branch_slug="feature-target",
        base_ref="master",
        target_branch="feature/target",
        target_pr="123",
        batch_slugs=batch_slugs,
    )


def _branch(*, batch_slug: str = "avoid-print") -> GeneratedStackBranch:
    return GeneratedStackBranch(
        branch_name=f"feature-target/roaster/stack-run-1/{batch_slug}",
        impl_branch_slug="feature-target",
        run_slug="stack-run-1",
        batch_slug=batch_slug,
    )


def _collection() -> StackReviewCollection:
    return StackReviewCollection(
        explicit_reviewers=("dignified-python",),
        selected_reviewers=("dignified-python",),
        reviewer_runs=(),
        reviewer_failures=(),
        summary="Collected findings.",
    )


def _triage_result(
    *,
    findings: tuple[StackTriageFinding, ...],
    batches: tuple[StackTriageBatch, ...],
) -> StackTriageResult:
    return StackTriageResult(
        collection=_collection(),
        triage=StackTriageOutput(
            summary="Accepted findings.",
            findings=findings,
            batches=batches,
            body="## Explanation\n",
        ),
        agent_output_markdown="---\nsummary: Accepted findings.\n---\n",
    )


def _finding(
    finding_id: str,
    *,
    summary: str = "Avoid print",
    path: str | None = "app.py",
    line: int | None = 12,
    details: str | None = "Use click.echo().",
) -> StackTriageFinding:
    return StackTriageFinding(
        id=finding_id,
        source_review="dignified-python",
        path=path,
        line=line,
        severity="warning",
        summary=summary,
        details=details,
        status="accepted",
        rationale="Concrete style issue.",
        merged_into=None,
        confidence="high",
        risk="mechanical",
    )


def _batch(
    *,
    slug: str = "avoid-print",
    finding_ids: tuple[str, ...] = ("F1",),
    validation_requirements: tuple[str, ...] = ("uv run pytest",),
) -> StackTriageBatch:
    return StackTriageBatch(
        slug=slug,
        title="Avoid print",
        summary="Replace print usage.",
        finding_ids=finding_ids,
        dependencies=(),
        confidence="high",
        risk="mechanical",
        resolver_mandate="Replace print with click.echo().",
        validation_requirements=validation_requirements,
    )


def test_render_stack_resolver_input_includes_context_and_matching_findings() -> None:
    batch = _batch()
    result = _triage_result(
        findings=(
            _finding("F1", summary="Avoid print", details="Use click.echo()."),
            _finding("F2", summary="Unused finding", details="Do not render me."),
        ),
        batches=(batch,),
    )

    rendered = render_stack_resolver_input(
        profile=_profile(),
        request=_request(),
        batch=batch,
        triage_result=result,
        manifest=_manifest(),
        branch=_branch(),
        existing_branch=False,
    )

    assert "# Roaster Stack Resolver Input" in rendered
    assert (
        "- Profile: `thermonuclear-stack` (`/repo/.roaster/profiles/thermonuclear-stack.md`)"
        in rendered
    )
    assert "```markdown\n# Guidance\n```" in rendered
    assert "- Target branch: `feature/target`" in rendered
    assert "- Target PR: `123`" in rendered
    assert "- Run slug: `stack-run-1`" in rendered
    assert "- Batch slug: `avoid-print`" in rendered
    assert "- Generated branch: `feature-target/roaster/stack-run-1/avoid-print`" in rendered
    assert "- Existing generated branch: False" in rendered
    assert "- Title: Avoid print" in rendered
    assert "- Summary: Replace print usage." in rendered
    assert "- Confidence: `high`" in rendered
    assert "- Risk: `mechanical`" in rendered
    assert "```text\nReplace print with click.echo().\n```" in rendered
    assert "- uv run pytest" in rendered
    assert "### `F1`" in rendered
    assert "- Source review: `dignified-python`" in rendered
    assert "- Path: app.py" in rendered
    assert "- Line: 12" in rendered
    assert "- Details: Use click.echo()." in rendered
    assert "### `F2`" not in rendered
    assert "Unused finding" not in rendered
    assert rendered.endswith("\n")
    assert not rendered.endswith("\n\n")


def test_render_stack_resolver_input_uses_fallbacks_for_empty_values() -> None:
    batch = _batch(validation_requirements=())
    result = _triage_result(
        findings=(
            _finding(
                "F1",
                path=None,
                line=None,
                details=None,
            ),
        ),
        batches=(batch,),
    )

    rendered = render_stack_resolver_input(
        profile=_profile(),
        request=_request(),
        batch=batch,
        triage_result=result,
        manifest=_manifest(),
        branch=_branch(),
        existing_branch=True,
    )

    assert "- Choose and run the smallest relevant local validation." in rendered
    assert "- Existing generated branch: True" in rendered
    assert "- Path: -" in rendered
    assert "- Line: -" in rendered
    assert "- Details: -" in rendered
