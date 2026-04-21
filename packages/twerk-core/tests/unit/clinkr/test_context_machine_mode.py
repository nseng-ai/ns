from __future__ import annotations

import click

from twerk_core.clinkr.context import (
    build_clinkr_context_object,
    is_machine_mode,
    load_clinkr_context_object,
    set_machine_mode,
)


def _root_context() -> click.Context:
    return click.Context(
        click.Command("root"),
        obj=build_clinkr_context_object(lambda: object()),
    )


def test_default_is_human_mode() -> None:
    ctx = _root_context()

    assert is_machine_mode(ctx) is False


def test_default_is_human_mode_without_clinkr_context_object() -> None:
    ctx = click.Context(click.Command("root"))

    assert is_machine_mode(ctx) is False


def test_set_machine_mode_is_observable_on_same_context() -> None:
    ctx = _root_context()

    set_machine_mode(ctx)

    assert is_machine_mode(ctx) is True


def test_set_machine_mode_falls_back_without_clinkr_context_object() -> None:
    ctx = click.Context(click.Command("root"))

    set_machine_mode(ctx)

    assert is_machine_mode(ctx) is True


def test_set_machine_mode_replaces_root_context_object_immutably() -> None:
    ctx = _root_context()
    original = load_clinkr_context_object(ctx)

    set_machine_mode(ctx)

    updated = load_clinkr_context_object(ctx)
    assert updated is not original
    assert original.machine_mode is False
    assert updated.machine_mode is True


def test_set_machine_mode_is_observable_from_child_context() -> None:
    root = _root_context()
    child = click.Context(click.Command("child"), parent=root)

    set_machine_mode(root)

    assert is_machine_mode(child) is True


def test_set_on_child_propagates_via_root_context_object() -> None:
    root = _root_context()
    child = click.Context(click.Command("child"), parent=root)

    set_machine_mode(child)

    assert is_machine_mode(root) is True
    assert is_machine_mode(child) is True


def test_independent_root_contexts_do_not_leak() -> None:
    a = click.Context(click.Command("a"), obj=build_clinkr_context_object(lambda: object()))
    b = click.Context(click.Command("b"), obj=build_clinkr_context_object(lambda: object()))

    set_machine_mode(a)

    assert is_machine_mode(a) is True
    assert is_machine_mode(b) is False
