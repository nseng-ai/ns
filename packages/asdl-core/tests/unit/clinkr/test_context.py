from __future__ import annotations

from dataclasses import dataclass

import click
import pytest

from asdl_core.clinkr.context import (
    build_clinkr_context_object,
    load_clinkr_context_object,
    load_typed_context,
)


@dataclass(frozen=True)
class FakeContext:
    value: int


@dataclass(frozen=True)
class OtherContext:
    label: str


def _make_click_context(obj: object) -> click.Context:
    return click.Context(click.Command("root"), obj=obj)


def test_returns_instance_from_clinkr_context_object() -> None:
    ctx = _make_click_context(build_clinkr_context_object(lambda: FakeContext(value=7)))

    result = load_typed_context(ctx, FakeContext)

    assert result == FakeContext(value=7)


def test_loads_context_object_from_ancestor_context() -> None:
    root = click.Context(click.Command("root"))
    child_obj = build_clinkr_context_object(lambda: FakeContext(value=7))
    child = click.Context(click.Command("child"), parent=root, obj=child_obj)
    leaf = click.Context(click.Command("leaf"), parent=child)

    assert load_clinkr_context_object(leaf) is child_obj
    assert load_typed_context(leaf, FakeContext) == FakeContext(value=7)


def test_rejects_non_clinkr_context_object() -> None:
    ctx = _make_click_context(FakeContext(value=7))

    with pytest.raises(RuntimeError) as excinfo:
        load_typed_context(ctx, FakeContext)

    assert str(excinfo.value) == (
        "ctx.obj must be a ClinkrContextObject; "
        "the CLI entry point and tests are responsible for installing it."
    )


def test_rejects_none_ctx_obj() -> None:
    ctx = _make_click_context(None)

    with pytest.raises(RuntimeError) as excinfo:
        load_typed_context(ctx, FakeContext)

    assert "ClinkrContextObject" in str(excinfo.value)


def test_rejects_wrong_return_type() -> None:
    ctx = _make_click_context(build_clinkr_context_object(lambda: OtherContext(label="nope")))

    with pytest.raises(RuntimeError) as excinfo:
        load_typed_context(ctx, FakeContext)

    assert str(excinfo.value) == ("context_factory returned OtherContext, expected FakeContext.")
