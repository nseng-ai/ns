"""Unit tests for the pure helpers in ``exec.reconcile_plan``.

The helper under test (``_parse_slug_argument``) is private but doing its
own dedicated coverage keeps the slug-set resolution rules grep-able and
easy to evolve without spinning up the full Click harness.
"""

from __future__ import annotations

from asdl_objectives.exec.reconcile_plan import _parse_slug_argument


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
