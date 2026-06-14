from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from asdl_core.clinkr.non_ideal_state import error_type_for
from roaster.gateways.local_diff.fake import FakeLocalDiffGateway
from roaster.gateways.review_catalog.fake import FakeReviewCatalogGateway
from roaster.harness.fake import FakeHarnessRuntime
from roaster.models import (
    DiffReviewTarget,
    FindingsReview,
    LocalDiff,
    LocalReviewResult,
    ModelNotSupportedByHarness,
    ResolvedReviewRunPlan,
    ReviewExecutionResponse,
    RoasterFailure,
)
from roaster.workflow import run_review_by_key

REVIEW_KEY = "dignified-python"
SAMPLE_SOURCE = (
    "---\ndescription: Review Python diffs.\ndefault_model: sonnet\n---\n\nFlag concrete issues.\n"
)


@dataclass(frozen=True)
class _Fakes:
    catalog: FakeReviewCatalogGateway
    diff: FakeLocalDiffGateway
    harness_runtime: FakeHarnessRuntime


def _fakes(
    *,
    review_sources_by_key: dict[str, str] | None = None,
    default_response: ReviewExecutionResponse | RoasterFailure | None = None,
    default_diff: LocalDiff | None = None,
) -> _Fakes:
    if review_sources_by_key is None:
        review_sources_by_key = {REVIEW_KEY: SAMPLE_SOURCE}
    catalog = FakeReviewCatalogGateway(
        review_sources_by_key=review_sources_by_key,
        reviews_dir=Path("/repo/reviews"),
    )
    diff = FakeLocalDiffGateway(
        default_diff=default_diff
        or LocalDiff(
            base_ref="master",
            diff_text="diff --git a/app.py b/app.py\n+print('hello')\n",
        ),
    )
    harness_runtime = FakeHarnessRuntime(
        default_response=default_response
        or ReviewExecutionResponse(payload=FindingsReview(findings=())),
    )
    return _Fakes(catalog=catalog, diff=diff, harness_runtime=harness_runtime)


def _run(
    *,
    key: str = REVIEW_KEY,
    requested_model: str | None = None,
    requested_base_ref: str | None = None,
    fakes: _Fakes | None = None,
    progress: Callable[[ResolvedReviewRunPlan], None] | None = None,
) -> LocalReviewResult | RoasterFailure:
    if fakes is None:
        fakes = _fakes()
    return run_review_by_key(
        key=key,
        requested_model=requested_model,
        requested_base_ref=requested_base_ref,
        catalog=fakes.catalog,
        diff=fakes.diff,
        harness_runtime=fakes.harness_runtime,
        progress=progress,
    )


def test_runs_end_to_end_against_diff_with_claude_code() -> None:
    fakes = _fakes()

    result = _run(fakes=fakes)

    assert isinstance(result, LocalReviewResult)
    assert result.review_name == REVIEW_KEY
    assert result.model == "sonnet"
    assert result.base_ref == "master"
    executed = fakes.harness_runtime.executed_requests[0]
    assert executed.review_definition.name == REVIEW_KEY
    assert executed.review_definition.description == "Review Python diffs."
    assert executed.review_definition.instructions == "Flag concrete issues."
    assert isinstance(executed.target, DiffReviewTarget)
    assert executed.target.local_diff.base_ref == "master"
    assert "diff --git a/app.py b/app.py" in executed.target.local_diff.diff_text


def test_nested_key_preserves_subpath_in_review_name() -> None:
    fakes = _fakes(review_sources_by_key={"python/typing": SAMPLE_SOURCE})

    result = _run(key="python/typing", fakes=fakes)

    assert isinstance(result, LocalReviewResult)
    assert result.review_name == "python/typing"
    assert fakes.harness_runtime.executed_requests[0].review_definition.name == "python/typing"


def test_unknown_key_returns_failure_before_execution() -> None:
    fakes = _fakes(review_sources_by_key={})

    result = _run(key="nope", fakes=fakes)

    assert isinstance(result, RoasterFailure)
    assert error_type_for(result) == "review_definition_not_found"
    assert fakes.harness_runtime.executed_requests == ()


def test_model_flag_overrides_default_model() -> None:
    fakes = _fakes()

    _run(requested_model="opus", fakes=fakes)

    assert fakes.harness_runtime.executed_requests[0].model == "opus"


def test_run_review_by_key_reports_resolved_run_plan_before_execution() -> None:
    plans: list[ResolvedReviewRunPlan] = []
    fakes = _fakes()

    _run(fakes=fakes, progress=plans.append)

    assert plans == [
        ResolvedReviewRunPlan(
            review_name=REVIEW_KEY,
            model="sonnet",
            base_ref="master",
            changed_path_count=1,
        )
    ]


def test_post_metadata_harness_failure_propagates_roaster_failure() -> None:
    source = (
        "---\n"
        "description: Review Python diffs.\n"
        "default_model: gpt-5-mini\n"
        "---\n"
        "\n"
        "Flag concrete issues.\n"
    )
    fakes = _fakes(
        review_sources_by_key={REVIEW_KEY: source},
        default_response=ModelNotSupportedByHarness(
            message="Model 'gpt-5-mini' is not supported by Claude Code."
        ),
    )

    result = _run(fakes=fakes)

    assert isinstance(result, ModelNotSupportedByHarness)
    assert result.message == "Model 'gpt-5-mini' is not supported by Claude Code."
    assert fakes.harness_runtime.executed_requests[0].model == "gpt-5-mini"
