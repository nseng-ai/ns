from __future__ import annotations

from pathlib import Path

import pytest

from asdl_core.clinkr.non_ideal_state import error_type_for
from asdl_reviewer.gateways.review_environment.fake import FakeReviewEnvironmentGateway
from asdl_reviewer.models import (
    FindingsReview,
    LocalDiff,
    LocalReviewResult,
    ModelNotSupportedByHarness,
    ReviewerFailure,
    ReviewExecutionResponse,
    ReviewFormat,
)
from asdl_reviewer.workflow import ENV_HARNESS, run_review_by_key

REVIEW_KEY = "dignified-python"
SAMPLE_SOURCE = (
    "---\ndescription: Review Python diffs.\ndefault_model: sonnet\n---\n\nFlag concrete issues.\n"
)


def _review_environment(
    *,
    review_sources_by_key: dict[str, str] | None = None,
    paths_by_binary: dict[str, str] | None = None,
    default_response: ReviewExecutionResponse | ReviewerFailure | None = None,
) -> FakeReviewEnvironmentGateway:
    if review_sources_by_key is None:
        review_sources_by_key = {REVIEW_KEY: SAMPLE_SOURCE}
    if paths_by_binary is None:
        paths_by_binary = {"claude": "/usr/local/bin/claude"}
    return FakeReviewEnvironmentGateway(
        review_sources_by_key=review_sources_by_key,
        default_diff=LocalDiff(
            base_ref="master",
            diff_text="diff --git a/app.py b/app.py\n+print('hello')\n",
        ),
        default_response=default_response
        or ReviewExecutionResponse(payload=FindingsReview(findings=())),
        paths_by_binary=paths_by_binary,
        reviews_dir=Path("/repo/reviews"),
    )


def _run(
    *,
    key: str = REVIEW_KEY,
    requested_model: str | None = None,
    requested_base_ref: str | None = None,
    requested_harness: str | None = None,
    requested_format: ReviewFormat = "findings",
    review_environment: FakeReviewEnvironmentGateway | None = None,
) -> LocalReviewResult | ReviewerFailure:
    if review_environment is None:
        review_environment = _review_environment()
    return run_review_by_key(
        key=key,
        requested_model=requested_model,
        requested_base_ref=requested_base_ref,
        requested_harness=requested_harness,
        requested_format=requested_format,
        review_environment=review_environment,
    )


def test_runs_end_to_end_auto_selecting_single_detected_harness() -> None:
    review_environment = _review_environment()

    result = _run(review_environment=review_environment)

    assert isinstance(result, LocalReviewResult)
    assert result.review_name == REVIEW_KEY
    assert result.model == "sonnet"
    assert result.base_ref == "master"
    executed = review_environment.executed_requests[0]
    assert executed.harness_name == "claude-code"
    assert executed.review_definition.name == REVIEW_KEY
    assert executed.review_definition.description == "Review Python diffs."
    assert executed.review_definition.instructions == "Flag concrete issues."
    assert executed.local_diff.base_ref == "master"
    assert "diff --git a/app.py b/app.py" in executed.local_diff.diff_text


def test_nested_key_preserves_subpath_in_review_name() -> None:
    review_environment = _review_environment(
        review_sources_by_key={"python/typing": SAMPLE_SOURCE},
    )

    result = _run(key="python/typing", review_environment=review_environment)

    assert isinstance(result, LocalReviewResult)
    assert result.review_name == "python/typing"
    assert review_environment.executed_requests[0].review_definition.name == "python/typing"


def test_explicit_harness_flag_wins() -> None:
    review_environment = _review_environment()

    _run(requested_harness="claude-code", review_environment=review_environment)

    assert review_environment.executed_requests[0].harness_name == "claude-code"


def test_env_var_overrides_auto_detection(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(ENV_HARNESS, "claude-code")
    review_environment = _review_environment(paths_by_binary={})

    _run(review_environment=review_environment)

    assert review_environment.executed_requests[0].harness_name == "claude-code"


def test_unknown_harness_is_rejected() -> None:
    result = _run(
        requested_harness="banana",
        review_environment=_review_environment(paths_by_binary={}),
    )

    assert isinstance(result, ReviewerFailure)
    assert error_type_for(result) == "harness_unknown"


def test_no_harness_detected_surfaces_install_hint() -> None:
    result = _run(review_environment=_review_environment(paths_by_binary={}))

    assert isinstance(result, ReviewerFailure)
    assert error_type_for(result) == "harness_not_configured"
    assert "No harness detected" in result.message


def test_unknown_key_returns_failure_before_execution() -> None:
    review_environment = _review_environment(review_sources_by_key={})

    result = _run(key="nope", review_environment=review_environment)

    assert isinstance(result, ReviewerFailure)
    assert error_type_for(result) == "review_definition_not_found"
    assert review_environment.executed_requests == ()


def test_model_flag_overrides_default_model() -> None:
    review_environment = _review_environment()

    _run(requested_model="opus", review_environment=review_environment)

    assert review_environment.executed_requests[0].model == "opus"


def test_format_is_threaded_onto_semantic_harness_request() -> None:
    review_environment = _review_environment()

    _run(requested_format="text", review_environment=review_environment)

    executed = review_environment.executed_requests[0]
    assert executed.review_format == "text"


def test_unsupported_default_model_failure_propagates_after_harness_selection() -> None:
    source = (
        "---\n"
        "description: Review Python diffs.\n"
        "default_model: gpt-5-mini\n"
        "---\n"
        "\n"
        "Flag concrete issues.\n"
    )
    review_environment = _review_environment(
        review_sources_by_key={REVIEW_KEY: source},
        default_response=ModelNotSupportedByHarness(
            message="Model 'gpt-5-mini' is not supported by harness 'claude-code'."
        ),
    )

    result = _run(review_environment=review_environment)

    assert isinstance(result, ReviewerFailure)
    assert error_type_for(result) == "model_not_supported_by_harness"
    assert review_environment.executed_requests[0].model == "gpt-5-mini"
