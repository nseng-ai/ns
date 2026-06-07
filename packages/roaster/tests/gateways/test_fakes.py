from __future__ import annotations

from pathlib import Path

from asdl_core.clinkr.non_ideal_state import error_type_for
from roaster.gateways.agent_runner.fake import FakeAgentRunnerGateway
from roaster.gateways.agent_runner.gateway import (
    AgentRunCompleted,
    AgentRunnerExecutionFailed,
    AgentRunnerRequest,
)
from roaster.gateways.local_diff.fake import FakeLocalDiffGateway
from roaster.gateways.review_catalog.fake import FakeReviewCatalogGateway
from roaster.harness.fake import FakeHarnessRuntime
from roaster.harness.invocation import HarnessReviewRequest
from roaster.models import (
    BaseRefUnavailable,
    DiffReviewTarget,
    FindingsReview,
    LocalDiff,
    ReviewCatalog,
    ReviewDefinition,
    ReviewDefinitionNotFound,
    ReviewExecutionResponse,
    ReviewFinding,
    ReviewsDirMissing,
    ReviewSource,
    RoasterFailure,
)


def _agent_request() -> AgentRunnerRequest:
    return AgentRunnerRequest(
        kind="triage",
        prompt_resource="stack_triage.md",
        prompt_override=None,
        model="sonnet",
        cwd=Path("/repo"),
        input_markdown="# Input\n",
        allowed_tools=("Read", "Bash"),
    )


def _request(*, review_name: str = "Dignified Python") -> HarnessReviewRequest:
    return HarnessReviewRequest(
        harness_name="claude-code",
        model="sonnet",
        review_definition=ReviewDefinition(
            name=review_name,
            description="Review Python diffs for style violations.",
            instructions="Flag concrete issues in the diff.",
            default_model="sonnet",
        ),
        target=DiffReviewTarget(
            kind="diff",
            local_diff=LocalDiff(
                base_ref="master",
                diff_text="diff --git a/app.py b/app.py\n+print('hello')\n",
            ),
        ),
        review_format="findings",
    )


def test_fake_agent_runner_returns_configured_response_and_records_requests() -> None:
    response = AgentRunCompleted(output_markdown="---\nschema_version: roaster.stack.triage.v1\n")
    gateway = FakeAgentRunnerGateway(responses=(response,))

    result = gateway.run_agent(_agent_request())

    assert result is response
    assert gateway.requests == (_agent_request(),)
    assert gateway.responses == (response,)


def test_fake_agent_runner_returns_configured_error() -> None:
    error = AgentRunnerExecutionFailed(message="runner failed")
    gateway = FakeAgentRunnerGateway(errors=(error,))

    result = gateway.run_agent(_agent_request())

    assert result is error
    assert gateway.errors == (error,)


def test_fake_load_review_source_returns_configured_source() -> None:
    reviews_dir = Path("/repo/reviews")
    gateway = FakeReviewCatalogGateway(
        review_sources_by_key={"standards/dignified-python": "# Dignified Python"},
        reviews_dir=reviews_dir,
    )

    result = gateway.load_review_source(key="standards/dignified-python")

    assert isinstance(result, ReviewSource)
    assert result.key == "standards/dignified-python"
    assert result.path == reviews_dir / "standards" / "dignified-python.md"
    assert result.source == "# Dignified Python"
    assert gateway.requested_review_keys == ("standards/dignified-python",)


def test_fake_load_review_source_returns_configured_failure() -> None:
    failure = ReviewDefinitionNotFound(path=Path("/missing.md"), message="missing")
    gateway = FakeReviewCatalogGateway(
        review_source_failures_by_key={"missing": failure},
    )

    result = gateway.load_review_source(key="missing")

    assert result is failure


def test_fake_load_review_source_returns_not_found_for_unknown_key() -> None:
    gateway = FakeReviewCatalogGateway()

    result = gateway.load_review_source(key="missing")

    assert isinstance(result, RoasterFailure)
    assert error_type_for(result) == "review_definition_not_found"


def test_fake_list_review_keys_infers_from_sources() -> None:
    gateway = FakeReviewCatalogGateway(
        review_sources_by_key={
            "dignified-python": "# Dignified Python",
            "python/typing": "# Typing",
        }
    )

    catalog = gateway.list_review_keys()

    assert isinstance(catalog, ReviewCatalog)
    assert catalog.keys == ("dignified-python", "python/typing")
    assert catalog.reviews_dir == Path("/repo/reviews")


def test_fake_list_review_keys_returns_configured_keys() -> None:
    gateway = FakeReviewCatalogGateway(
        review_sources_by_key={"ignored": "# Ignored"},
        review_keys=("alpha", "python/typing"),
    )

    catalog = gateway.list_review_keys()

    assert isinstance(catalog, ReviewCatalog)
    assert catalog.keys == ("alpha", "python/typing")


def test_fake_list_review_keys_returns_configured_failure() -> None:
    failure = ReviewsDirMissing(message="nope")
    gateway = FakeReviewCatalogGateway(list_review_keys_failure=failure)

    result = gateway.list_review_keys()

    assert result is failure


def test_fake_load_diff_returns_configured_diff() -> None:
    gateway = FakeLocalDiffGateway(
        diffs_by_base_ref={
            "master": LocalDiff(
                base_ref="master",
                diff_text="diff --git a/app.py b/app.py\n+print('hello')\n",
            )
        }
    )

    result = gateway.load_diff(base_ref="master")

    assert isinstance(result, LocalDiff)
    assert result.base_ref == "master"
    assert gateway.requested_base_refs == ("master",)


def test_fake_load_diff_returns_default_failure() -> None:
    failure = BaseRefUnavailable(message="no base")
    gateway = FakeLocalDiffGateway(default_diff=failure)

    result = gateway.load_diff(base_ref=None)

    assert result is failure
    assert gateway.requested_base_refs == (None,)


def test_fake_list_harnesses_returns_configured_path() -> None:
    harness_runtime = FakeHarnessRuntime(paths_by_binary={"claude": "/usr/local/bin/claude"})

    detections = harness_runtime.list_harnesses()

    assert len(detections) == 1
    detection = detections[0]
    assert detection.name == "claude-code"
    assert detection.binary == "claude"
    assert detection.available is True
    assert detection.path == "/usr/local/bin/claude"


def test_fake_list_harnesses_reports_binary_absent() -> None:
    harness_runtime = FakeHarnessRuntime()

    detections = harness_runtime.list_harnesses()

    assert len(detections) == 1
    detection = detections[0]
    assert detection.name == "claude-code"
    assert detection.binary == "claude"
    assert detection.available is False
    assert detection.path is None


def test_fake_run_review_returns_configured_response() -> None:
    finding = ReviewFinding.diff_line(
        path="app.py",
        line=1,
        severity="warning",
        summary="Avoid print in library code",
        details="Use click.echo() instead.",
    )
    harness_runtime = FakeHarnessRuntime(
        responses_by_review_name={
            "Dignified Python": ReviewExecutionResponse(payload=FindingsReview(findings=(finding,)))
        }
    )

    result = harness_runtime.run_review(_request())

    assert isinstance(result, ReviewExecutionResponse)
    assert isinstance(result.payload, FindingsReview)
    assert result.payload.findings == (finding,)
    assert harness_runtime.executed_requests[0].review_definition.name == "Dignified Python"
