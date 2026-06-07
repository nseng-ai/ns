"""Reviewer collection and triage-agent boundary for roaster stack workflows."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import TypeAlias

from asdl_core.clinkr.non_ideal_state import error_type_for
from roaster.gateways.agent_runner.gateway import (
    AgentRunCompleted,
    AgentRunnerGateway,
    AgentRunnerRequest,
)
from roaster.gateways.local_diff.gateway import LocalDiffGateway
from roaster.gateways.review_catalog.gateway import ReviewCatalogGateway
from roaster.harness.invocation import HarnessRuntime
from roaster.models import (
    FindingsReview,
    LocalReviewResult,
    ReviewFinding,
    ReviewUsage,
    RoasterFailure,
)
from roaster.stack.command.agent_output import (
    StackAgentOutputParseError,
    parse_triage_output_result,
)
from roaster.stack.common.run_models import StackWorkflowRequest
from roaster.stack.core.contracts import StackTriageOutput
from roaster.stack.core.profile import StackProfile
from roaster.workflow import list_matching_reviews, run_review_by_key

STACK_TRIAGE_PROMPT_RESOURCE = "stack_triage.md"
TRIAGE_ALLOWED_TOOLS = ("Read", "Bash")


@dataclass(frozen=True)
class StackReviewerRun:
    """Findings and metadata collected from one reviewer invocation."""

    key: str
    review_name: str
    review_path: str
    model: str
    base_ref: str | None
    findings: tuple[ReviewFinding, ...]
    usage: ReviewUsage | None = None


@dataclass(frozen=True)
class StackReviewerFailure:
    """A reviewer selected by matching failed during collection."""

    key: str
    error_type: str
    message: str


@dataclass(frozen=True)
class StackReviewCollection:
    """Reviewer collection result used as triage input."""

    explicit_reviewers: tuple[str, ...]
    selected_reviewers: tuple[str, ...]
    reviewer_runs: tuple[StackReviewerRun, ...]
    reviewer_failures: tuple[StackReviewerFailure, ...]
    summary: str

    @property
    def finding_count(self) -> int:
        """Return total collected findings."""
        return sum(len(run.findings) for run in self.reviewer_runs)


@dataclass(frozen=True)
class StackTriageFailure:
    """A non-ideal state for stack reviewer collection or triage."""

    message: str
    error_type: str


@dataclass(frozen=True)
class StackTriageResult:
    """Result of reviewer collection and optional triage parsing."""

    collection: StackReviewCollection
    triage: StackTriageOutput | None
    agent_output_markdown: str | None = None


StackReviewCollectionResult: TypeAlias = StackReviewCollection | StackTriageFailure
StackTriageRunResult: TypeAlias = StackTriageResult | StackTriageFailure


def collect_stack_review_findings(
    *,
    request: StackWorkflowRequest,
    catalog: ReviewCatalogGateway,
    diff: LocalDiffGateway,
    harness_runtime: HarnessRuntime,
) -> StackReviewCollectionResult:
    """Collect findings from explicit reviewers or changed-path matching reviewers."""
    explicit_reviewers = request.reviewers
    if explicit_reviewers:
        selected_reviewers = explicit_reviewers
    else:
        selection = list_matching_reviews(
            requested_base_ref=request.base_ref,
            catalog=catalog,
            diff=diff,
        )
        if isinstance(selection, RoasterFailure):
            return _failure_from_roaster_failure(selection)
        selected_reviewers = tuple(review.key for review in selection.selected_reviews)
        if not selected_reviewers:
            return StackReviewCollection(
                explicit_reviewers=(),
                selected_reviewers=(),
                reviewer_runs=(),
                reviewer_failures=(),
                summary="No matching roaster reviewers selected; zero findings collected.",
            )

    reviewer_runs: list[StackReviewerRun] = []
    reviewer_failures: list[StackReviewerFailure] = []
    for key in selected_reviewers:
        result = run_review_by_key(
            key=key,
            requested_model=request.model,
            requested_base_ref=request.base_ref,
            requested_harness=request.harness,
            requested_format="findings",
            catalog=catalog,
            diff=diff,
            harness_runtime=harness_runtime,
        )
        if isinstance(result, RoasterFailure):
            if explicit_reviewers:
                return StackTriageFailure(
                    error_type=f"reviewer_{error_type_for(result)}",
                    message=f"Explicit reviewer {key!r} failed: {result.message}",
                )
            reviewer_failures.append(
                StackReviewerFailure(
                    key=key,
                    error_type=error_type_for(result),
                    message=result.message,
                )
            )
            continue

        if not isinstance(result.payload, FindingsReview):
            failure = StackTriageFailure(
                error_type="reviewer_non_findings_payload",
                message=f"Reviewer {key!r} did not return a findings payload.",
            )
            if explicit_reviewers:
                return failure
            reviewer_failures.append(
                StackReviewerFailure(
                    key=key,
                    error_type=failure.error_type,
                    message=failure.message,
                )
            )
            continue

        reviewer_runs.append(_reviewer_run_from_result(key=key, result=result))

    return StackReviewCollection(
        explicit_reviewers=explicit_reviewers,
        selected_reviewers=selected_reviewers,
        reviewer_runs=tuple(reviewer_runs),
        reviewer_failures=tuple(reviewer_failures),
        summary=_collection_summary(
            reviewer_runs=tuple(reviewer_runs),
            reviewer_failures=tuple(reviewer_failures),
        ),
    )


def run_stack_triage(
    *,
    profile: StackProfile,
    request: StackWorkflowRequest,
    cwd: Path,
    catalog: ReviewCatalogGateway,
    diff: LocalDiffGateway,
    harness_runtime: HarnessRuntime,
    agent_runner: AgentRunnerGateway,
) -> StackTriageRunResult:
    """Collect stack review findings and parse the triage agent output."""
    collection = collect_stack_review_findings(
        request=request,
        catalog=catalog,
        diff=diff,
        harness_runtime=harness_runtime,
    )
    if isinstance(collection, StackTriageFailure):
        return collection

    if not collection.selected_reviewers:
        return StackTriageResult(collection=collection, triage=None, agent_output_markdown=None)

    agent_result = agent_runner.run_agent(
        AgentRunnerRequest(
            kind="triage",
            prompt_resource=STACK_TRIAGE_PROMPT_RESOURCE,
            prompt_override=request.triage_prompt,
            model=request.agent_model,
            cwd=cwd,
            input_markdown=build_triage_input_markdown(
                profile=profile,
                request=request,
                collection=collection,
            ),
            allowed_tools=TRIAGE_ALLOWED_TOOLS,
        )
    )
    if not isinstance(agent_result, AgentRunCompleted):
        return StackTriageFailure(
            error_type=error_type_for(agent_result),
            message=agent_result.message,
        )

    triage = parse_triage_output_result(agent_result.output_markdown)
    if isinstance(triage, StackAgentOutputParseError):
        return StackTriageFailure(
            error_type="stack_triage_invalid_output",
            message=f"Triage agent output was invalid: {triage.message}",
        )

    return StackTriageResult(
        collection=collection,
        triage=triage,
        agent_output_markdown=agent_result.output_markdown,
    )


def build_triage_input_markdown(
    *,
    profile: StackProfile,
    request: StackWorkflowRequest,
    collection: StackReviewCollection,
) -> str:
    """Render loose profile guidance and reviewer findings for the triage agent."""
    lines = [
        "# Roaster Stack Triage Input",
        "",
        "## Profile",
        "",
        f"- Slug: `{profile.slug}`",
        f"- Path: `{profile.path}`",
        "- Guidance: raw markdown; do not parse headings or prose deterministically.",
        "",
        "```markdown",
        profile.guidance.rstrip(),
        "```",
        "",
        "## Run / Target Context",
        "",
        f"- Target branch: {_value_or_dash(request.target_branch)}",
        f"- Target PR: {_value_or_dash(request.target_pr)}",
        f"- Base ref: {_value_or_dash(request.base_ref)}",
        f"- Run slug: {_value_or_dash(request.run_slug)}",
        f"- Dry run requested: {request.dry_run}",
        f"- New run requested: {request.new_run}",
        "",
        "## Reviewer Selection",
        "",
        f"- Explicit reviewers: {_tuple_or_dash(collection.explicit_reviewers)}",
        f"- Selected reviewers: {_tuple_or_dash(collection.selected_reviewers)}",
        f"- Summary: {collection.summary}",
        "",
        "## Reviewer Findings",
        "",
    ]

    if not collection.reviewer_runs:
        lines.extend(["No reviewer findings were collected.", ""])

    for run in collection.reviewer_runs:
        lines.extend(_reviewer_run_markdown(run))

    if collection.reviewer_failures:
        lines.extend(["## Reviewer Failures", ""])
        for failure in collection.reviewer_failures:
            lines.extend(
                [
                    f"### `{failure.key}`",
                    "",
                    f"- Error type: `{failure.error_type}`",
                    f"- Message: {failure.message}",
                    "",
                ]
            )

    return "\n".join(lines).rstrip() + "\n"


def _reviewer_run_from_result(*, key: str, result: LocalReviewResult) -> StackReviewerRun:
    assert isinstance(result.payload, FindingsReview)
    return StackReviewerRun(
        key=key,
        review_name=result.review_name,
        review_path=result.review_path,
        model=result.model,
        base_ref=result.base_ref,
        findings=result.payload.findings,
        usage=result.usage,
    )


def _failure_from_roaster_failure(failure: RoasterFailure) -> StackTriageFailure:
    return StackTriageFailure(error_type=error_type_for(failure), message=failure.message)


def _collection_summary(
    *,
    reviewer_runs: tuple[StackReviewerRun, ...],
    reviewer_failures: tuple[StackReviewerFailure, ...],
) -> str:
    finding_count = sum(len(run.findings) for run in reviewer_runs)
    summary = f"Collected {finding_count} finding(s) from {len(reviewer_runs)} reviewer run(s)."
    if reviewer_failures:
        summary += f" {len(reviewer_failures)} selected reviewer(s) failed."
    return summary


def _reviewer_run_markdown(run: StackReviewerRun) -> list[str]:
    lines = [
        f"### `{run.key}`",
        "",
        f"- Review name: {run.review_name}",
        f"- Review path: `{run.review_path}`",
        f"- Model: `{run.model}`",
        f"- Base ref: `{_value_or_dash(run.base_ref)}`",
        f"- Finding count: {len(run.findings)}",
        *_usage_markdown(run.usage),
        "",
    ]
    if not run.findings:
        lines.extend(["No findings.", ""])
        return lines

    for index, finding in enumerate(run.findings, start=1):
        lines.extend(
            [
                f"#### Finding {index}",
                "",
                f"- Path: `{_value_or_dash(finding.path)}`",
                f"- Line: {_line_or_dash(finding.line)}",
                f"- Severity: `{finding.severity}`",
                f"- Summary: {finding.summary}",
                "- Details:",
                "",
                "```text",
                finding.details.rstrip(),
                "```",
                "",
            ]
        )
    return lines


def _usage_markdown(usage: ReviewUsage | None) -> list[str]:
    if usage is None:
        return ["- Usage: not reported"]
    return [
        "- Usage:",
        f"  - input_tokens: {usage.input_tokens}",
        f"  - output_tokens: {usage.output_tokens}",
        f"  - cache_creation_input_tokens: {usage.cache_creation_input_tokens}",
        f"  - cache_read_input_tokens: {usage.cache_read_input_tokens}",
        f"  - total_input_tokens: {usage.total_input_tokens}",
        f"  - total_cost_usd: {usage.total_cost_usd}",
        f"  - duration_ms: {usage.duration_ms}",
        f"  - num_turns: {usage.num_turns}",
    ]


def _value_or_dash(value: str | None) -> str:
    if value is None or not value:
        return "-"
    return value


def _tuple_or_dash(values: tuple[str, ...]) -> str:
    if not values:
        return "-"
    return ", ".join(values)


def _line_or_dash(line: int | None) -> str:
    if line is None:
        return "-"
    return str(line)
