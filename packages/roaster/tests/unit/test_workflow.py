from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

import pytest

from asdl_core.clinkr.non_ideal_state import error_type_for
from roaster.gateways.local_diff.fake import FakeLocalDiffGateway
from roaster.gateways.review_catalog.fake import FakeReviewCatalogGateway
from roaster.harness.fake import FakeHarnessRuntime
from roaster.models import (
    DiffReviewTarget,
    DocumentReviewTarget,
    FindingsReview,
    LocalDiff,
    LocalReviewResult,
    MatchingReviewSelectionResult,
    ModelNotSupportedByHarness,
    ResolvedReviewRunPlan,
    ReviewContextFragment,
    ReviewExecutionResponse,
    ReviewFormat,
    RoasterFailure,
)
from roaster.workflow import ENV_HARNESS, list_matching_reviews, run_review_by_key

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
    paths_by_binary: dict[str, str] | None = None,
    default_response: ReviewExecutionResponse | RoasterFailure | None = None,
    default_diff: LocalDiff | None = None,
) -> _Fakes:
    if review_sources_by_key is None:
        review_sources_by_key = {REVIEW_KEY: SAMPLE_SOURCE}
    if paths_by_binary is None:
        paths_by_binary = {"claude": "/usr/local/bin/claude"}
    catalog = FakeReviewCatalogGateway(
        review_sources_by_key=review_sources_by_key,
        reviews_dir=Path("/repo/reviews"),
    )
    diff = FakeLocalDiffGateway(
        default_diff=default_diff
        or LocalDiff(
            base_ref="master",
            diff_text="diff --git a/app.py b/app.py\n+print('hello')\n",
            changed_paths=("app.py",),
        ),
    )
    harness_runtime = FakeHarnessRuntime(
        paths_by_binary=paths_by_binary,
        default_response=default_response
        or ReviewExecutionResponse(payload=FindingsReview(findings=())),
    )
    return _Fakes(catalog=catalog, diff=diff, harness_runtime=harness_runtime)


def _run(
    *,
    key: str = REVIEW_KEY,
    requested_model: str | None = None,
    requested_base_ref: str | None = None,
    requested_harness: str | None = None,
    requested_format: ReviewFormat = "findings",
    fakes: _Fakes | None = None,
    document_target: DocumentReviewTarget | None = None,
    context_fragments: tuple[ReviewContextFragment, ...] = (),
    progress: Callable[[ResolvedReviewRunPlan], None] | None = None,
) -> LocalReviewResult | RoasterFailure:
    if fakes is None:
        fakes = _fakes()
    return run_review_by_key(
        key=key,
        requested_model=requested_model,
        requested_base_ref=requested_base_ref,
        requested_harness=requested_harness,
        requested_format=requested_format,
        catalog=fakes.catalog,
        diff=fakes.diff,
        harness_runtime=fakes.harness_runtime,
        requested_document_target=document_target,
        context_fragments=context_fragments,
        progress=progress,
    )


def _list_matching(
    *,
    requested_base_ref: str | None = None,
    fakes: _Fakes | None = None,
) -> MatchingReviewSelectionResult | RoasterFailure:
    if fakes is None:
        fakes = _fakes()
    return list_matching_reviews(
        requested_base_ref=requested_base_ref,
        catalog=fakes.catalog,
        diff=fakes.diff,
    )


def test_runs_end_to_end_auto_selecting_single_detected_harness() -> None:
    fakes = _fakes()

    result = _run(fakes=fakes)

    assert isinstance(result, LocalReviewResult)
    assert result.review_name == REVIEW_KEY
    assert result.model == "sonnet"
    assert result.base_ref == "master"
    executed = fakes.harness_runtime.executed_requests[0]
    assert executed.harness_name == "claude-code"
    assert executed.review_definition.name == REVIEW_KEY
    assert executed.review_definition.description == "Review Python diffs."
    assert executed.review_definition.instructions == "Flag concrete issues."
    assert isinstance(executed.target, DiffReviewTarget)
    assert executed.target.local_diff.base_ref == "master"
    assert "diff --git a/app.py b/app.py" in executed.target.local_diff.diff_text


def test_document_target_runs_without_loading_diff() -> None:
    fakes = _fakes()
    target = DocumentReviewTarget(
        kind="document",
        content="# Plan\n\nDo the thing.",
        label="plan.md",
        source_path="plan.md",
    )
    fragments = (ReviewContextFragment(label="inline context 1", content="Implementation plan."),)

    result = _run(fakes=fakes, document_target=target, context_fragments=fragments)

    assert isinstance(result, LocalReviewResult)
    assert result.base_ref is None
    assert result.target_kind == "document"
    assert result.target_label == "plan.md"
    assert result.context_fragments == fragments
    assert fakes.diff.requested_base_refs == ()
    executed = fakes.harness_runtime.executed_requests[0]
    assert executed.target is target
    assert executed.context_fragments == fragments


def test_nested_key_preserves_subpath_in_review_name() -> None:
    fakes = _fakes(review_sources_by_key={"python/typing": SAMPLE_SOURCE})

    result = _run(key="python/typing", fakes=fakes)

    assert isinstance(result, LocalReviewResult)
    assert result.review_name == "python/typing"
    assert fakes.harness_runtime.executed_requests[0].review_definition.name == "python/typing"


def test_explicit_harness_flag_wins() -> None:
    fakes = _fakes()

    _run(requested_harness="claude-code", fakes=fakes)

    assert fakes.harness_runtime.executed_requests[0].harness_name == "claude-code"


def test_env_var_overrides_auto_detection(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(ENV_HARNESS, "claude-code")
    fakes = _fakes(paths_by_binary={})

    _run(fakes=fakes)

    assert fakes.harness_runtime.executed_requests[0].harness_name == "claude-code"


def test_unknown_harness_is_rejected() -> None:
    result = _run(
        requested_harness="banana",
        fakes=_fakes(paths_by_binary={}),
    )

    assert isinstance(result, RoasterFailure)
    assert error_type_for(result) == "harness_unknown"


def test_no_harness_detected_surfaces_install_hint() -> None:
    result = _run(fakes=_fakes(paths_by_binary={}))

    assert isinstance(result, RoasterFailure)
    assert error_type_for(result) == "harness_not_configured"
    assert "No harness detected" in result.message


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


def test_format_is_threaded_onto_semantic_harness_request() -> None:
    fakes = _fakes()

    _run(requested_format="text", fakes=fakes)

    executed = fakes.harness_runtime.executed_requests[0]
    assert executed.review_format == "text"


def test_run_review_by_key_reports_resolved_run_plan_before_execution() -> None:
    plans: list[ResolvedReviewRunPlan] = []
    fakes = _fakes()

    _run(fakes=fakes, progress=plans.append)

    assert plans == [
        ResolvedReviewRunPlan(
            review_name=REVIEW_KEY,
            model="sonnet",
            harness="claude-code",
            base_ref="master",
            changed_path_count=1,
            target_label="current branch diff",
        )
    ]


def test_list_matching_reviews_selects_only_reviews_matching_changed_paths() -> None:
    python_source = (
        "---\n"
        "description: Review Python diffs.\n"
        "default_model: sonnet\n"
        "when_changed:\n"
        "  - '**/*.py'\n"
        "---\n"
        "\n"
        "Flag Python issues.\n"
    )
    ts_source = (
        "---\n"
        "description: Review TypeScript diffs.\n"
        "default_model: haiku\n"
        "when_changed:\n"
        "  - '**/*.ts'\n"
        "---\n"
        "\n"
        "Flag TypeScript issues.\n"
    )
    fakes = _fakes(
        review_sources_by_key={"dignified-python": python_source, "typescript-style": ts_source},
        default_diff=LocalDiff(
            base_ref="master",
            diff_text="diff --git a/src/app.ts b/src/app.ts\n+const x = 1;\n",
            changed_paths=("src/app.ts",),
        ),
    )

    result = _list_matching(fakes=fakes)

    assert isinstance(result, MatchingReviewSelectionResult)
    assert [review.key for review in result.selected_reviews] == ["typescript-style"]
    assert result.selected_reviews[0].default_model == "haiku"
    assert [review.key for review in result.skipped_reviews] == ["dignified-python"]
    assert result.skipped_reviews[0].default_model == "sonnet"
    assert fakes.harness_runtime.executed_requests == ()


def test_list_matching_reviews_returns_noop_result_when_no_reviews_match() -> None:
    source = (
        "---\n"
        "description: Review Python diffs.\n"
        "default_model: sonnet\n"
        "when_changed:\n"
        "  - '**/*.py'\n"
        "---\n"
        "\n"
        "Flag Python issues.\n"
    )
    fakes = _fakes(
        review_sources_by_key={REVIEW_KEY: source},
        default_diff=LocalDiff(
            base_ref="master",
            diff_text="diff --git a/src/app.ts b/src/app.ts\n+const x = 1;\n",
            changed_paths=("src/app.ts",),
        ),
    )

    result = _list_matching(fakes=fakes)

    assert isinstance(result, MatchingReviewSelectionResult)
    assert result.selected_reviews == ()
    assert [review.key for review in result.skipped_reviews] == [REVIEW_KEY]
    assert fakes.harness_runtime.executed_requests == ()


def test_unsupported_default_model_failure_propagates_after_harness_selection() -> None:
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
            message="Model 'gpt-5-mini' is not supported by harness 'claude-code'."
        ),
    )

    result = _run(fakes=fakes)

    assert isinstance(result, RoasterFailure)
    assert error_type_for(result) == "model_not_supported_by_harness"
    assert fakes.harness_runtime.executed_requests[0].model == "gpt-5-mini"
