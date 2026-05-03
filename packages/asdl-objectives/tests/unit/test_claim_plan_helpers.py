"""Unit tests for the pure helpers in ``exec.claim_plan``.

The helpers under test are private but doing their own dedicated coverage
keeps the slug-cascade rules and dataclass shape grep-able and easy to
evolve without spinning up the full Click harness.
"""

from __future__ import annotations

from asdl_objectives.exec.claim_plan import (
    PLAN_SCHEMA,
    CandidateBranch,
    ClaimPlan,
    ClaimPlanAmbiguity,
    ClaimPlanError,
    ClaimPlanResult,
    PlanSource,
    SlugAlternative,
    _classify_slug_candidates,
    _normalize_slug,
)


def test_normalize_slug_none_passes_through() -> None:
    assert _normalize_slug(None) is None


def test_normalize_slug_empty_string_becomes_none() -> None:
    assert _normalize_slug("") is None
    assert _normalize_slug("   ") is None


def test_normalize_slug_trims_and_strips_addressing() -> None:
    assert _normalize_slug(" widget-rewrite ") == "widget-rewrite"
    # `<slug>/<file>` addressing collapses to slug.
    assert _normalize_slug("widget-rewrite/body.md") == "widget-rewrite"


def test_classify_slug_candidates_single() -> None:
    assert _classify_slug_candidates(slugs=("alpha",), available_on_branch="feat/x") == "alpha"


def test_classify_slug_candidates_multiple_returns_ambiguity() -> None:
    outcome = _classify_slug_candidates(
        slugs=("alpha", "beta"),
        available_on_branch="feat/parent",
    )
    # The `_AmbiguityOutcome` wrapper carries a `ClaimPlanAmbiguity`.
    assert hasattr(outcome, "ambiguity")
    amb = outcome.ambiguity  # type: ignore[union-attr]
    assert isinstance(amb, ClaimPlanAmbiguity)
    assert amb.reason == "ambiguous_slug_candidates"
    assert {alt.slug for alt in amb.slug_alternatives} == {"alpha", "beta"}
    assert all(alt.available_on_branch == "feat/parent" for alt in amb.slug_alternatives)


# ---------------------------------------------------------------------------
# Round-trip: ClaimPlanResult.to_json_dict produces a stable shape with
# nested fields populated correctly.
# ---------------------------------------------------------------------------


def test_claim_plan_result_to_json_dict_for_plan_status() -> None:
    result = ClaimPlanResult(
        schema=PLAN_SCHEMA,
        canonical_branch="master",
        requested_slug="alpha",
        requested_target=None,
        requested_from_branch=None,
        requested_from_file=None,
        status="plan",
        plan=ClaimPlan(
            slug="alpha",
            target_branch="feat/x",
            source=PlanSource(
                kind="canonical",
                branch="master",
                from_file_path=None,
                label="canonical objective",
            ),
        ),
        ambiguity=None,
        error=None,
    )
    payload = result.to_json_dict()
    assert payload["status"] == "plan"
    assert payload["plan"]["slug"] == "alpha"
    assert payload["plan"]["source"]["kind"] == "canonical"
    assert payload["plan"]["source"]["branch"] == "master"
    assert payload["ambiguity"] is None
    assert payload["error"] is None


def test_claim_plan_result_to_json_dict_for_ambiguity_status() -> None:
    result = ClaimPlanResult(
        schema=PLAN_SCHEMA,
        canonical_branch="master",
        requested_slug=None,
        requested_target=None,
        requested_from_branch=None,
        requested_from_file=None,
        status="ambiguous",
        plan=None,
        ambiguity=ClaimPlanAmbiguity(
            reason="ambiguous_source_branches",
            message="two ancestors tie",
            slug_alternatives=(),
            branch_alternatives=(
                CandidateBranch(branch="feat/a", distance=2),
                CandidateBranch(branch="feat/b", distance=2),
            ),
        ),
        error=None,
    )
    payload = result.to_json_dict()
    assert payload["status"] == "ambiguous"
    amb = payload["ambiguity"]
    assert amb["reason"] == "ambiguous_source_branches"
    assert [c["branch"] for c in amb["branch_alternatives"]] == ["feat/a", "feat/b"]
    assert payload["plan"] is None
    assert payload["error"] is None


def test_claim_plan_result_to_json_dict_for_error_status() -> None:
    result = ClaimPlanResult(
        schema=PLAN_SCHEMA,
        canonical_branch="master",
        requested_slug="ghost",
        requested_target=None,
        requested_from_branch=None,
        requested_from_file=None,
        status="error",
        plan=None,
        ambiguity=None,
        error=ClaimPlanError(
            reason="explicit_slug_not_found",
            message="ghost is not anywhere",
        ),
    )
    payload = result.to_json_dict()
    assert payload["status"] == "error"
    assert payload["error"]["reason"] == "explicit_slug_not_found"
    assert payload["plan"] is None
    assert payload["ambiguity"] is None


def test_slug_alternative_round_trip() -> None:
    alt = SlugAlternative(slug="alpha", available_on_branch="feat/parent")
    assert alt.slug == "alpha"
    assert alt.available_on_branch == "feat/parent"
