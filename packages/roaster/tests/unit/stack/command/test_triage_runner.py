from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from roaster.gateways.agent_runner.fake import FakeAgentRunnerGateway
from roaster.gateways.agent_runner.gateway import AgentRunCompleted, AgentRunnerUnavailable
from roaster.gateways.local_diff.fake import FakeLocalDiffGateway
from roaster.gateways.review_catalog.fake import FakeReviewCatalogGateway
from roaster.harness.fake import FakeHarnessRuntime
from roaster.models import (
    FindingsReview,
    HarnessExecutionFailed,
    LocalDiff,
    ReviewExecutionResponse,
    ReviewFinding,
    ReviewUsage,
    RoasterFailure,
)
from roaster.stack.command.triage import (
    StackReviewCollection,
    StackTriageFailure,
    StackTriageResult,
    build_triage_input_markdown,
    collect_stack_review_findings,
    run_stack_triage,
)
from roaster.stack.common.run_models import StackWorkflowRequest
from roaster.stack.core.contracts import StackTriageOutput
from roaster.stack.core.profile import StackProfile

PYTHON_REVIEW_SOURCE = (
    "---\n"
    "description: Review Python diffs.\n"
    "default_model: sonnet\n"
    "when_changed:\n"
    "  - '**/*.py'\n"
    "---\n"
    "\n"
    "Flag Python issues.\n"
)
TS_REVIEW_SOURCE = (
    "---\n"
    "description: Review TypeScript diffs.\n"
    "default_model: haiku\n"
    "when_changed:\n"
    "  - '**/*.ts'\n"
    "---\n"
    "\n"
    "Flag TypeScript issues.\n"
)


@dataclass(frozen=True)
class _Fakes:
    catalog: FakeReviewCatalogGateway
    diff: FakeLocalDiffGateway
    harness_runtime: FakeHarnessRuntime
    agent_runner: FakeAgentRunnerGateway


def _finding(summary: str = "Avoid print") -> ReviewFinding:
    return ReviewFinding.diff_line(
        path="app.py",
        line=12,
        severity="warning",
        summary=summary,
        details="Use click.echo() instead.",
    )


def _usage() -> ReviewUsage:
    return ReviewUsage(
        input_tokens=10,
        output_tokens=20,
        cache_creation_input_tokens=3,
        cache_read_input_tokens=4,
        total_cost_usd=0.05,
        duration_ms=1200,
        num_turns=2,
    )


def _response(
    *findings: ReviewFinding,
    usage: ReviewUsage | None = None,
) -> ReviewExecutionResponse:
    return ReviewExecutionResponse(payload=FindingsReview(findings=findings), usage=usage)


def _request(
    *,
    reviewers: tuple[str, ...] = (),
    model: str | None = "sonnet",
    agent_model: str | None = "opus",
    triage_prompt: str | None = "custom triage prompt",
) -> StackWorkflowRequest:
    return StackWorkflowRequest(
        profile_slug="default",
        target_branch="feature/target",
        target_pr="123",
        reviewers=reviewers,
        model=model,
        agent_model=agent_model,
        harness="claude-code",
        base_ref="master",
        run_slug="run-1",
        triage_prompt=triage_prompt,
    )


def _profile() -> StackProfile:
    return StackProfile(
        slug="default",
        path=Path("/repo/.roaster/profiles/default.md"),
        guidance="# Loose guidance\n\nPrefer small batches.\n",
    )


def _fakes(
    *,
    review_sources_by_key: dict[str, str] | None = None,
    responses_by_review_name: dict[str, ReviewExecutionResponse | RoasterFailure] | None = None,
    agent_response: AgentRunCompleted | None = None,
    default_diff: LocalDiff | None = None,
) -> _Fakes:
    catalog = FakeReviewCatalogGateway(
        review_sources_by_key=review_sources_by_key
        or {"dignified-python": PYTHON_REVIEW_SOURCE, "typescript-style": TS_REVIEW_SOURCE},
        reviews_dir=Path("/repo/reviews"),
    )
    diff = FakeLocalDiffGateway(
        default_diff=default_diff
        or LocalDiff(
            base_ref="master",
            diff_text="diff --git a/app.py b/app.py\n+print('hello')\n",
            changed_paths=("app.py",),
        )
    )
    harness_runtime = FakeHarnessRuntime(
        paths_by_binary={"claude": "/usr/local/bin/claude"},
        responses_by_review_name=responses_by_review_name,
        default_response=_response(_finding(), usage=_usage()),
    )
    agent_runner = FakeAgentRunnerGateway(
        responses=(agent_response or AgentRunCompleted(output_markdown=_valid_triage_output()),)
    )
    return _Fakes(
        catalog=catalog,
        diff=diff,
        harness_runtime=harness_runtime,
        agent_runner=agent_runner,
    )


def _valid_triage_output() -> str:
    data: dict[str, Any] = {
        "schema_version": "roaster.stack.triage.v1",
        "summary": "Accepted one finding.",
        "findings": [
            {
                "id": "F1",
                "source_review": "dignified-python",
                "path": "app.py",
                "line": 12,
                "severity": "warning",
                "summary": "Avoid print",
                "details": "Use click.echo() instead.",
                "status": "accepted",
                "rationale": "Concrete style issue.",
                "merged_into": None,
                "confidence": "high",
                "risk": "mechanical",
            }
        ],
        "batches": [
            {
                "slug": "avoid-print",
                "title": "Avoid print",
                "summary": "Replace print usage.",
                "finding_ids": ["F1"],
                "dependencies": [],
                "confidence": "high",
                "risk": "mechanical",
                "resolver_mandate": "Replace print with click.echo().",
                "validation_requirements": ["uv run pytest"],
            }
        ],
    }
    return f"---\n{yaml.safe_dump(data, sort_keys=False)}---\n## Explanation\n"


def test_collect_explicit_reviewers_runs_exact_keys_including_repeats() -> None:
    fakes = _fakes()

    result = collect_stack_review_findings(
        request=_request(reviewers=("dignified-python", "dignified-python")),
        catalog=fakes.catalog,
        diff=fakes.diff,
        harness_runtime=fakes.harness_runtime,
    )

    assert isinstance(result, StackReviewCollection)
    assert result.selected_reviewers == ("dignified-python", "dignified-python")
    assert fakes.catalog.requested_review_keys == ("dignified-python", "dignified-python")
    assert [request.review_format for request in fakes.harness_runtime.executed_requests] == [
        "findings",
        "findings",
    ]


def test_collect_without_explicit_reviewers_runs_matching_review_keys() -> None:
    fakes = _fakes()

    result = collect_stack_review_findings(
        request=_request(reviewers=()),
        catalog=fakes.catalog,
        diff=fakes.diff,
        harness_runtime=fakes.harness_runtime,
    )

    assert isinstance(result, StackReviewCollection)
    assert result.selected_reviewers == ("dignified-python",)
    executed_names = [
        request.review_definition.name for request in fakes.harness_runtime.executed_requests
    ]
    assert executed_names == ["dignified-python"]


def test_collect_preserves_reviewer_usage_metadata() -> None:
    fakes = _fakes(
        responses_by_review_name={"dignified-python": _response(_finding(), usage=_usage())}
    )

    result = collect_stack_review_findings(
        request=_request(reviewers=("dignified-python",)),
        catalog=fakes.catalog,
        diff=fakes.diff,
        harness_runtime=fakes.harness_runtime,
    )

    assert isinstance(result, StackReviewCollection)
    assert result.reviewer_runs[0].usage == _usage()
    rendered = build_triage_input_markdown(
        profile=_profile(),
        request=_request(reviewers=("dignified-python",)),
        collection=result,
    )
    assert "total_input_tokens: 17" in rendered
    assert "total_cost_usd: 0.05" in rendered


def test_explicit_missing_reviewer_returns_failure() -> None:
    fakes = _fakes(review_sources_by_key={})

    result = collect_stack_review_findings(
        request=_request(reviewers=("missing",)),
        catalog=fakes.catalog,
        diff=fakes.diff,
        harness_runtime=fakes.harness_runtime,
    )

    assert isinstance(result, StackTriageFailure)
    assert result.error_type == "reviewer_review_definition_not_found"
    assert "Explicit reviewer 'missing' failed" in result.message
    assert fakes.harness_runtime.executed_requests == ()


def test_explicit_failing_reviewer_returns_failure() -> None:
    fakes = _fakes(
        responses_by_review_name={
            "dignified-python": HarnessExecutionFailed(message="review failed")
        }
    )

    result = collect_stack_review_findings(
        request=_request(reviewers=("dignified-python",)),
        catalog=fakes.catalog,
        diff=fakes.diff,
        harness_runtime=fakes.harness_runtime,
    )

    assert isinstance(result, StackTriageFailure)
    assert result.error_type == "reviewer_harness_execution_failed"
    assert "Explicit reviewer 'dignified-python' failed: review failed" in result.message


def test_matching_reviewer_failure_is_included_in_triage_input() -> None:
    fakes = _fakes(
        responses_by_review_name={
            "dignified-python": HarnessExecutionFailed(message="matching reviewer failed")
        }
    )

    result = run_stack_triage(
        profile=_profile(),
        request=_request(reviewers=()),
        cwd=Path("/repo"),
        catalog=fakes.catalog,
        diff=fakes.diff,
        harness_runtime=fakes.harness_runtime,
        agent_runner=fakes.agent_runner,
    )

    assert isinstance(result, StackTriageResult)
    assert result.collection.reviewer_failures[0].message == "matching reviewer failed"
    agent_request = fakes.agent_runner.requests[0]
    assert "## Reviewer Failures" in agent_request.input_markdown
    assert "matching reviewer failed" in agent_request.input_markdown


def test_matching_no_selection_is_zero_finding_success_without_agent_request() -> None:
    fakes = _fakes(
        default_diff=LocalDiff(
            base_ref="master",
            diff_text="diff --git a/app.ts b/app.ts\n+const x = 1;\n",
            changed_paths=("app.ts",),
        ),
        review_sources_by_key={"dignified-python": PYTHON_REVIEW_SOURCE},
    )

    result = run_stack_triage(
        profile=_profile(),
        request=_request(reviewers=()),
        cwd=Path("/repo"),
        catalog=fakes.catalog,
        diff=fakes.diff,
        harness_runtime=fakes.harness_runtime,
        agent_runner=fakes.agent_runner,
    )

    assert isinstance(result, StackTriageResult)
    assert result.triage is None
    assert result.collection.finding_count == 0
    assert "No matching roaster reviewers" in result.collection.summary
    assert fakes.agent_runner.requests == ()


def test_run_stack_triage_threads_prompt_model_context_and_parses_output() -> None:
    fakes = _fakes()

    result = run_stack_triage(
        profile=_profile(),
        request=_request(reviewers=("dignified-python",)),
        cwd=Path("/repo"),
        catalog=fakes.catalog,
        diff=fakes.diff,
        harness_runtime=fakes.harness_runtime,
        agent_runner=fakes.agent_runner,
    )

    assert isinstance(result, StackTriageResult)
    assert isinstance(result.triage, StackTriageOutput)
    assert result.triage.batches[0].slug == "avoid-print"
    agent_request = fakes.agent_runner.requests[0]
    assert agent_request.kind == "triage"
    assert agent_request.prompt_resource == "stack_triage.md"
    assert agent_request.prompt_override == "custom triage prompt"
    assert agent_request.model == "opus"
    assert agent_request.cwd == Path("/repo")
    assert agent_request.allowed_tools == ("Read", "Bash")
    assert "Prefer small batches" in agent_request.input_markdown
    assert "Avoid print" in agent_request.input_markdown
    assert "Target branch: feature/target" in agent_request.input_markdown


def test_run_stack_triage_returns_failure_for_agent_runner_error() -> None:
    fakes = _fakes()
    agent_runner = FakeAgentRunnerGateway(
        errors=(AgentRunnerUnavailable(message="No supported local runner."),)
    )

    result = run_stack_triage(
        profile=_profile(),
        request=_request(reviewers=("dignified-python",)),
        cwd=Path("/repo"),
        catalog=fakes.catalog,
        diff=fakes.diff,
        harness_runtime=fakes.harness_runtime,
        agent_runner=agent_runner,
    )

    assert isinstance(result, StackTriageFailure)
    assert result.error_type == "agent_runner_unavailable"
    assert result.message == "No supported local runner."


def test_run_stack_triage_returns_failure_for_invalid_agent_output() -> None:
    fakes = _fakes(agent_response=AgentRunCompleted(output_markdown="not frontmatter\n"))

    result = run_stack_triage(
        profile=_profile(),
        request=_request(reviewers=("dignified-python",)),
        cwd=Path("/repo"),
        catalog=fakes.catalog,
        diff=fakes.diff,
        harness_runtime=fakes.harness_runtime,
        agent_runner=fakes.agent_runner,
    )

    assert isinstance(result, StackTriageFailure)
    assert result.error_type == "stack_triage_invalid_output"
    assert "must begin" in result.message
