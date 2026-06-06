from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from asdl_core.gh.pr_testing import FakePRGateway
from brmem.fake import FakeBranchMemoryGateway
from roaster.gateways.agent_runner.fake import FakeAgentRunnerGateway
from roaster.gateways.agent_runner.gateway import AgentRunCompleted, AgentRunnerUnavailable
from roaster.gateways.graphite_stack.fake import FakeGraphiteStackGateway
from roaster.gateways.graphite_stack.gateway import GraphiteStackFailure
from roaster.gateways.local_diff.fake import FakeLocalDiffGateway
from roaster.gateways.review_catalog.fake import FakeReviewCatalogGateway
from roaster.harness.fake import FakeHarnessRuntime
from roaster.models import FindingsReview, LocalDiff, ReviewExecutionResponse, ReviewFinding
from roaster.stack_models import StackWorkflowRequest, StackWorkflowResult
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


class _DashboardFailingPRGateway(FakePRGateway):
    def add_pr_discussion_comment(self, pr_number: int, body: str) -> Any:
        _ = pr_number
        _ = body
        raise RuntimeError("dashboard unavailable")


class _FailingBranchMemoryGateway(FakeBranchMemoryGateway):
    def put(self, namespace: str, key: str, branch: str, content: str) -> str:
        _ = namespace
        _ = key
        _ = branch
        _ = content
        raise RuntimeError("branch memory unavailable")


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
    data = _valid_triage_data()
    return f"---\n{yaml.safe_dump(data, sort_keys=False)}---\n## Explanation\n"


def _valid_triage_data() -> dict[str, Any]:
    return {
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


def _rejected_triage_output() -> str:
    data = _valid_triage_data()
    data["findings"][0]["status"] = "rejected"
    data["findings"][0]["rationale"] = "Not worth changing."
    data["batches"] = []
    return f"---\n{yaml.safe_dump(data, sort_keys=False)}---\n## Explanation\n"


def _valid_resolver_output(*, batch_slug: str = "avoid-print") -> str:
    data: dict[str, Any] = {
        "schema_version": "roaster.stack.resolver.v1",
        "batch_slug": batch_slug,
        "status": "completed",
        "summary": "Resolved print usage.",
        "files_changed": ["app.py"],
        "validation": [
            {
                "command": "uv run pytest packages/roaster/tests/unit/test_stack_workflow.py",
                "status": "passed",
                "output_summary": "passed",
            }
        ],
        "safety": {
            "unresolved_conflicts": False,
            "destructive_changes": False,
            "secrets_or_security_sensitive": False,
            "validation_evidence_missing": False,
            "notes": "No safety concerns.",
        },
    }
    return f"---\n{yaml.safe_dump(data, sort_keys=False)}---\n## Resolver notes\n"


def _resolver_output_with(mutator: str) -> str:
    data = yaml.safe_load(_valid_resolver_output().split("---", 2)[1])
    if mutator == "failed_status":
        data["status"] = "failed"
    elif mutator == "failed_validation":
        data["validation"][0]["status"] = "failed"
    elif mutator == "safety_flag":
        data["safety"]["unresolved_conflicts"] = True
    return f"---\n{yaml.safe_dump(data, sort_keys=False)}---\n## Resolver notes\n"


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


def test_non_dry_run_requires_graphite_gateway_before_reviewers_or_agent_run() -> None:
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
        pr_gateway=FakePRGateway(),
    )

    assert isinstance(result, StackWorkflowFailure)
    assert result.error_type == "graphite_stack_gateway_unavailable"
    assert branch_memory.counted_puts == ()
    assert harness_runtime.executed_requests == ()
    assert agent_runner.requests == ()


def test_non_dry_run_rejected_only_persists_dashboard_and_skips_generated_stack() -> None:
    branch_memory = _CountingBranchMemoryGateway()
    pr_gateway = FakePRGateway()
    graphite = FakeGraphiteStackGateway()
    agent_runner = FakeAgentRunnerGateway(
        responses=(AgentRunCompleted(output_markdown=_rejected_triage_output()),)
    )

    result = run_stack_workflow_dry_run(
        profile=_profile(),
        request=_request(dry_run=False),
        cwd=Path("/repo"),
        catalog=_catalog(),
        diff=_diff(),
        harness_runtime=_harness_runtime(),
        agent_runner=agent_runner,
        branch_memory=branch_memory,
        pr_gateway=pr_gateway,
        graphite_stack=graphite,
    )

    assert isinstance(result, StackWorkflowResult)
    assert result.status == "completed"
    assert result.manifest.batch_slugs == ()
    assert result.manifest.generated_branches == ()
    assert result.dashboard_rows == ()
    assert len(branch_memory.counted_puts) == 3
    assert len(pr_gateway.comments) == 1
    assert graphite.checkout_branch_calls == ()
    assert graphite.submit_generated_stack_calls == ()


def test_non_dry_run_resolves_batch_creates_branch_and_submits() -> None:
    branch_memory = _CountingBranchMemoryGateway()
    pr_gateway = FakePRGateway()
    graphite = FakeGraphiteStackGateway()
    agent_runner = FakeAgentRunnerGateway(
        responses=(
            AgentRunCompleted(output_markdown=_valid_triage_output()),
            AgentRunCompleted(output_markdown=_valid_resolver_output()),
        )
    )

    result = run_stack_workflow_dry_run(
        profile=_profile(),
        request=_request(dry_run=False),
        cwd=Path("/repo"),
        catalog=_catalog(),
        diff=_diff(),
        harness_runtime=_harness_runtime(),
        agent_runner=agent_runner,
        branch_memory=branch_memory,
        pr_gateway=pr_gateway,
        graphite_stack=graphite,
    )

    assert isinstance(result, StackWorkflowResult)
    assert result.manifest.generated_branches[0].branch_name == (
        "feature-target/roaster/stack-run-1/avoid-print"
    )
    assert result.dashboard_rows[0].status == "completed"
    assert result.dashboard_rows[0].validation_summary is not None
    assert agent_runner.requests[1].kind == "resolver"
    assert agent_runner.requests[1].prompt_resource == "stack_resolver.md"
    assert "Replace print with click.echo()." in agent_runner.requests[1].input_markdown
    assert graphite.checkout_branch_calls == ((Path("/repo"), "feature/target"),)
    assert graphite.create_generated_branch_calls == (
        (Path("/repo"), "feature-target/roaster/stack-run-1/avoid-print", "Avoid print"),
    )
    assert graphite.update_generated_branch_calls == ()
    assert graphite.submit_generated_stack_calls == (Path("/repo"),)
    assert len(branch_memory.counted_puts) == 5
    assert len(pr_gateway.comments) == 1
    assert len(pr_gateway.updated_comments) == 2


def test_non_dry_run_updates_existing_generated_branch() -> None:
    branch_name = "feature-target/roaster/stack-run-1/avoid-print"
    graphite = FakeGraphiteStackGateway(existing_branches={branch_name})

    result = run_stack_workflow_dry_run(
        profile=_profile(),
        request=_request(dry_run=False),
        cwd=Path("/repo"),
        catalog=_catalog(),
        diff=_diff(),
        harness_runtime=_harness_runtime(),
        agent_runner=FakeAgentRunnerGateway(
            responses=(
                AgentRunCompleted(output_markdown=_valid_triage_output()),
                AgentRunCompleted(output_markdown=_valid_resolver_output()),
            )
        ),
        branch_memory=_CountingBranchMemoryGateway(),
        pr_gateway=FakePRGateway(),
        graphite_stack=graphite,
    )

    assert isinstance(result, StackWorkflowResult)
    assert graphite.checkout_branch_calls == (
        (Path("/repo"), "feature/target"),
        (Path("/repo"), branch_name),
    )
    assert graphite.create_generated_branch_calls == ()
    assert graphite.update_generated_branch_calls == ((Path("/repo"), branch_name, "Avoid print"),)
    assert graphite.submit_generated_stack_calls == (Path("/repo"),)


def test_non_dry_run_dashboard_failure_before_mutation_is_fatal() -> None:
    graphite = FakeGraphiteStackGateway()

    result = run_stack_workflow_dry_run(
        profile=_profile(),
        request=_request(dry_run=False),
        cwd=Path("/repo"),
        catalog=_catalog(),
        diff=_diff(),
        harness_runtime=_harness_runtime(),
        agent_runner=FakeAgentRunnerGateway(
            responses=(AgentRunCompleted(output_markdown=_valid_triage_output()),)
        ),
        branch_memory=_CountingBranchMemoryGateway(),
        pr_gateway=_DashboardFailingPRGateway(),
        graphite_stack=graphite,
    )

    assert isinstance(result, StackWorkflowFailure)
    assert result.error_type == "stack_dashboard_publication_failed"
    assert graphite.checkout_branch_calls == ()
    assert graphite.create_generated_branch_calls == ()
    assert graphite.submit_generated_stack_calls == ()


def test_non_dry_run_invalid_resolver_output_stops_before_branch_mutation() -> None:
    graphite = FakeGraphiteStackGateway()

    result = run_stack_workflow_dry_run(
        profile=_profile(),
        request=_request(dry_run=False),
        cwd=Path("/repo"),
        catalog=_catalog(),
        diff=_diff(),
        harness_runtime=_harness_runtime(),
        agent_runner=FakeAgentRunnerGateway(
            responses=(
                AgentRunCompleted(output_markdown=_valid_triage_output()),
                AgentRunCompleted(output_markdown="not frontmatter\n"),
            )
        ),
        branch_memory=_CountingBranchMemoryGateway(),
        pr_gateway=FakePRGateway(),
        graphite_stack=graphite,
    )

    assert isinstance(result, StackWorkflowFailure)
    assert result.error_type == "stack_resolver_invalid_output"
    assert "must begin" in result.message
    assert graphite.create_generated_branch_calls == ()
    assert graphite.submit_generated_stack_calls == ()


def test_non_dry_run_rejects_failed_validation_and_safety_flags() -> None:
    for mutator in ("failed_status", "failed_validation", "safety_flag"):
        result = run_stack_workflow_dry_run(
            profile=_profile(),
            request=_request(dry_run=False),
            cwd=Path("/repo"),
            catalog=_catalog(),
            diff=_diff(),
            harness_runtime=_harness_runtime(),
            agent_runner=FakeAgentRunnerGateway(
                responses=(
                    AgentRunCompleted(output_markdown=_valid_triage_output()),
                    AgentRunCompleted(output_markdown=_resolver_output_with(mutator)),
                )
            ),
            branch_memory=_CountingBranchMemoryGateway(),
            pr_gateway=FakePRGateway(),
            graphite_stack=FakeGraphiteStackGateway(),
        )

        assert isinstance(result, StackWorkflowFailure)
        assert result.error_type == "stack_resolver_invalid_output"


def test_non_dry_run_branch_memory_write_failure_stops_before_dashboard_or_graphite() -> None:
    pr_gateway = FakePRGateway()
    graphite = FakeGraphiteStackGateway()

    result = run_stack_workflow_dry_run(
        profile=_profile(),
        request=_request(dry_run=False),
        cwd=Path("/repo"),
        catalog=_catalog(),
        diff=_diff(),
        harness_runtime=_harness_runtime(),
        agent_runner=FakeAgentRunnerGateway(
            responses=(AgentRunCompleted(output_markdown=_valid_triage_output()),)
        ),
        branch_memory=_FailingBranchMemoryGateway(),
        pr_gateway=pr_gateway,
        graphite_stack=graphite,
    )

    assert isinstance(result, StackWorkflowFailure)
    assert result.error_type == "stack_run_storage_write_failed"
    assert "branch memory unavailable" in result.message
    assert pr_gateway.comments == ()
    assert graphite.checkout_branch_calls == ()


def test_non_dry_run_submit_failure_stops_after_resolver_branch() -> None:
    graphite = FakeGraphiteStackGateway(
        failures_by_operation={
            "submit-generated-stack": GraphiteStackFailure(
                error_type="graphite_stack_command_failed",
                message="submit failed",
                operation="submit-generated-stack",
            )
        }
    )

    result = run_stack_workflow_dry_run(
        profile=_profile(),
        request=_request(dry_run=False),
        cwd=Path("/repo"),
        catalog=_catalog(),
        diff=_diff(),
        harness_runtime=_harness_runtime(),
        agent_runner=FakeAgentRunnerGateway(
            responses=(
                AgentRunCompleted(output_markdown=_valid_triage_output()),
                AgentRunCompleted(output_markdown=_valid_resolver_output()),
            )
        ),
        branch_memory=_CountingBranchMemoryGateway(),
        pr_gateway=FakePRGateway(),
        graphite_stack=graphite,
    )

    assert isinstance(result, StackWorkflowFailure)
    assert result.error_type == "graphite_stack_command_failed"
    assert result.message == "submit failed"
    assert graphite.create_generated_branch_calls == (
        (Path("/repo"), "feature-target/roaster/stack-run-1/avoid-print", "Avoid print"),
    )
    assert graphite.submit_generated_stack_calls == (Path("/repo"),)


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
