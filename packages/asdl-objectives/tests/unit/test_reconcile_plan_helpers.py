"""Unit tests for the pure helpers in ``exec.reconcile_plan``.

The helper under test (``_parse_slug_argument``) is private but doing its
own dedicated coverage keeps the slug-set resolution rules grep-able and
easy to evolve without spinning up the full Click harness.
"""

from __future__ import annotations

from asdl_objectives.exec.reconcile_plan import _parse_slug_argument
from asdl_objectives.exec.reconcile_summary import _status_for


def test_parse_slug_argument_none_means_sweep() -> None:
    assert _parse_slug_argument(None) is None


def test_parse_slug_argument_empty_string_yields_empty_tuple() -> None:
    assert _parse_slug_argument("") == ()


def test_parse_slug_argument_whitespace_only_yields_empty_tuple() -> None:
    assert _parse_slug_argument("   ,  ,   ") == ()


def test_parse_slug_argument_dedupes_preserving_order() -> None:
    assert _parse_slug_argument("alpha,beta,alpha,gamma,beta") == (
        "alpha",
        "beta",
        "gamma",
    )


def test_parse_slug_argument_strips_whitespace_around_each_slug() -> None:
    assert _parse_slug_argument(" alpha , beta ") == ("alpha", "beta")


def test_reconcile_summary_status_conflict_wins() -> None:
    assert (
        _status_for(
            canonical_present=True,
            included_snapshot_count=1,
            conflicts=("body missing",),
            gaps=(),
        )
        == "conflict"
    )


def test_reconcile_summary_status_gap_wins_after_conflicts() -> None:
    assert (
        _status_for(
            canonical_present=False,
            included_snapshot_count=0,
            conflicts=(),
            gaps=("unknown slug",),
        )
        == "gap"
    )


def test_reconcile_summary_status_actionable_uses_pr_evidence_only() -> None:
    assert (
        _status_for(
            canonical_present=True,
            included_snapshot_count=1,
            conflicts=(),
            gaps=(),
        )
        == "actionable"
    )


def test_reconcile_summary_status_no_evidence_for_canonical_without_prs() -> None:
    assert (
        _status_for(
            canonical_present=True,
            included_snapshot_count=0,
            conflicts=(),
            gaps=(),
        )
        == "no-evidence"
    )
