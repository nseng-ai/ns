from __future__ import annotations

from pathlib import Path

from twerk_reviewer.gateways.local_diff.fake import FakeLocalDiffGateway
from twerk_reviewer.gateways.review_definition.fake import FakeReviewDefinitionGateway
from twerk_reviewer.gateways.review_execution.fake import FakeReviewExecutionGateway
from twerk_reviewer.models import (
    FindingsReview,
    LocalDiff,
    ReviewExecutionRequest,
    ReviewExecutionResponse,
    ReviewFinding,
)


def test_review_definition_fake_returns_configured_source() -> None:
    path = Path("standards/dignified-python.md")
    gateway = FakeReviewDefinitionGateway(sources_by_path={path: "# Dignified Python"})

    result = gateway.load_source(path)

    assert result == "# Dignified Python"
    assert gateway.requested_paths == (path,)


def test_local_diff_fake_returns_configured_diff() -> None:
    gateway = FakeLocalDiffGateway(
        results_by_base_ref={
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


def test_review_execution_fake_returns_configured_response() -> None:
    finding = ReviewFinding(
        path="app.py",
        line=1,
        severity="warning",
        summary="Avoid print in library code",
        details="Use click.echo() instead.",
    )
    gateway = FakeReviewExecutionGateway(
        responses_by_review_name={
            "Dignified Python": ReviewExecutionResponse(payload=FindingsReview(findings=(finding,)))
        }
    )

    result = gateway.run_review(
        ReviewExecutionRequest(
            adapter_name="claude-code",
            model="sonnet",
            prompt="review this diff",
            system_prompt="You are a code reviewer.",
            review_format="findings",
            review_name="Dignified Python",
            review_description="Review Python diffs for style violations.",
            review_instructions="Flag concrete issues in the diff.",
            base_ref="master",
            diff_text="diff --git a/app.py b/app.py\n+print('hello')\n",
        )
    )

    assert isinstance(result, ReviewExecutionResponse)
    assert isinstance(result.payload, FindingsReview)
    assert result.payload.findings == (finding,)
    assert gateway.executed_requests[0].review_name == "Dignified Python"
