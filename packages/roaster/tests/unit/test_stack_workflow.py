from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from asdl_core.gh.pr_testing import FakePRGateway
from brmem.fake import FakeBranchMemoryGateway
from roaster.gateways.agent_runner.fake import FakeAgentRunnerGateway
from roaster.gateways.agent_runner.gateway import AgentRunCompleted, AgentRunnerUnavailable
from roaster.gateways.local_diff.fake import FakeLocalDiffGateway
from roaster.gateways.review_catalog.fake import FakeReviewCatalogGateway
from roaster.harness.fake import FakeHarnessRuntime
from roaster.models import FindingsReview, LocalDiff, ReviewExecutionResponse, ReviewFinding
from roaster.stack_models import StackWorkflowRequest
from roaster.stack_profile import StackProfile
from roaster.stack_workflow import (
    StackDryRunResult,
    StackWorkflowFailure,
    run_stack_workflow_dry_run,
)

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


class _CountingBranchMemoryGateway(FakeBranchMemoryGateway):
    def __init__(self) -> None:
        super().__init__()
        self._counted_puts: list[tuple[str, str, str, str]] = []

    def put(self, namespace: str, key: str, branch: str, content: str) -> str:
        self._counted_puts.append((namespace, key, branch, content))
        return super().put(namespace, key, branch, content)

    @property
    def counted_puts(self) -> tuple[tuple[str, str, str, str], ...]:
        return tuple(self._counted_puts)


def _profile() -> StackProfile:
    return StackProfile(
        slug="thermonuclear-stack",
        path=Path("/repo/.roaster/profiles/thermonuclear-stack.md"),
        guidance="# Guidance\n",
    )


def _request(*, dry_run: bool = True) -> StackWorkflowRequest:
    return StackWorkflowRequest(
        profile_slug="thermonuclear-stack",
        target_branch="feature/target",
        target_pr="123",
        reviewers=("dignified-python",),
        model="sonnet",
        agent_model="opus",
        harness="claude-code",
        base_ref="master",
        dry_run=dry_run,
        run_slug="stack-run-1",
    )


def _catalog() -> FakeReviewCatalogGateway:
    return FakeReviewCatalogGateway(
        review_sources_by_key={"dignified-python": PYTHON_REVIEW_SOURCE}
    )


def _diff() -> FakeLocalDiffGateway:
    return FakeLocalDiffGateway(
        default_diff=LocalDiff(
            base_ref="master",
            diff_text="diff --git a/app.py b/app.py\n+print('hello')\n",
            changed_paths=("app.py",),
        )
    )


def _harness_runtime() -> FakeHarnessRuntime:
    return FakeHarnessRuntime(
        paths_by_binary={"claude": "/usr/local/bin/claude"},
        default_response=ReviewExecutionResponse(
            payload=FindingsReview(
                findings=(
                    ReviewFinding(
                        path="app.py",
                        line=12,
                        severity="warning",
                        summary="Avoid print",
                        details="Use click.echo() instead.",
                    ),
                )
            )
        ),
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


def test_dry_run_shapes_manifest_actions_and_locators_without_external_writes() -> None:
    branch_memory = _CountingBranchMemoryGateway()
    pr_gateway = FakePRGateway()
    agent_runner = FakeAgentRunnerGateway(
        responses=(AgentRunCompleted(output_markdown=_valid_triage_output()),)
    )

    result = run_stack_workflow_dry_run(
        profile=_profile(),
        request=_request(),
        cwd=Path("/repo"),
        catalog=_catalog(),
        diff=_diff(),
        harness_runtime=_harness_runtime(),
        agent_runner=agent_runner,
        branch_memory=branch_memory,
        pr_gateway=pr_gateway,
    )

    assert isinstance(result, StackDryRunResult)
    assert result.impl_branch_slug == "feature-target"
    assert result.run_slug == "stack-run-1"
    assert result.manifest.batch_slugs == ("avoid-print",)
    assert result.accepted_count == 1
    assert result.rejected_count == 0
    assert result.superseded_count == 0
    assert result.actions[0].mutating is False
    assert all(not action.mutating for action in result.actions)
    assert [locator.kind for locator in result.locators] == [
        "index",
        "manifest",
        "triage",
        "resolver:avoid-print",
        "dashboard",
    ]
    assert result.branch_memory_puts == 0
    assert result.dashboard_mutations == 0
    assert result.graphite_commands_run == 0
    assert branch_memory.counted_puts == ()
    assert pr_gateway.comments == ()
    assert pr_gateway.updated_comments == ()
    assert pr_gateway.created_reviews == ()
    assert pr_gateway.thread_replies == ()


def test_non_dry_run_fails_before_reviewers_or_agent_run() -> None:
    branch_memory = _CountingBranchMemoryGateway()
    agent_runner = FakeAgentRunnerGateway(
        responses=(AgentRunCompleted(output_markdown=_valid_triage_output()),)
    )
    harness_runtime = _harness_runtime()

    result = run_stack_workflow_dry_run(
        profile=_profile(),
        request=_request(dry_run=False),
        cwd=Path("/repo"),
        catalog=_catalog(),
        diff=_diff(),
        harness_runtime=harness_runtime,
        agent_runner=agent_runner,
        branch_memory=branch_memory,
    )

    assert isinstance(result, StackWorkflowFailure)
    assert result.error_type == "stack_orchestration_not_implemented"
    assert "pass --dry-run" in result.message
    assert branch_memory.counted_puts == ()
    assert harness_runtime.executed_requests == ()
    assert agent_runner.requests == ()


def test_explicit_reviewer_failure_is_clear_failure() -> None:
    result = run_stack_workflow_dry_run(
        profile=_profile(),
        request=_request(),
        cwd=Path("/repo"),
        catalog=FakeReviewCatalogGateway(review_sources_by_key={}),
        diff=_diff(),
        harness_runtime=_harness_runtime(),
        agent_runner=FakeAgentRunnerGateway(
            responses=(AgentRunCompleted(output_markdown=_valid_triage_output()),)
        ),
        branch_memory=_CountingBranchMemoryGateway(),
    )

    assert isinstance(result, StackWorkflowFailure)
    assert result.error_type == "reviewer_review_definition_not_found"
    assert "Explicit reviewer 'dignified-python' failed" in result.message


def test_agent_runner_unavailable_is_clear_failure() -> None:
    result = run_stack_workflow_dry_run(
        profile=_profile(),
        request=_request(),
        cwd=Path("/repo"),
        catalog=_catalog(),
        diff=_diff(),
        harness_runtime=_harness_runtime(),
        agent_runner=FakeAgentRunnerGateway(errors=(AgentRunnerUnavailable(message="no runner"),)),
        branch_memory=_CountingBranchMemoryGateway(),
    )

    assert isinstance(result, StackWorkflowFailure)
    assert result.error_type == "agent_runner_unavailable"
    assert result.message == "no runner"


def test_invalid_triage_output_is_clear_failure() -> None:
    result = run_stack_workflow_dry_run(
        profile=_profile(),
        request=_request(),
        cwd=Path("/repo"),
        catalog=_catalog(),
        diff=_diff(),
        harness_runtime=_harness_runtime(),
        agent_runner=FakeAgentRunnerGateway(
            responses=(AgentRunCompleted(output_markdown="not frontmatter\n"),)
        ),
        branch_memory=_CountingBranchMemoryGateway(),
    )

    assert isinstance(result, StackWorkflowFailure)
    assert result.error_type == "stack_triage_invalid_output"
    assert "must begin" in result.message
