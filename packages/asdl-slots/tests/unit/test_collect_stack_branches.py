from __future__ import annotations

from asdl_core.gt.types import StackInfo
from asdl_slots.cli.slot.gt.stack_walk import collect_stack_branches, collect_stack_edges


def _stack(
    *,
    ancestors: tuple[str, ...] = (),
    descendants: tuple[str, ...] = (),
    current: str = "feat/middle",
    trunk: str = "master",
) -> StackInfo:
    return StackInfo(
        trunk=trunk,
        current=current,
        ancestors=ancestors,
        children=(),
        descendants=descendants,
    )


def test_linear_stack_returns_ancestors_then_descendants() -> None:
    stack = _stack(
        ancestors=("master", "feat/base"),
        descendants=("feat/child", "feat/grandchild"),
    )

    assert collect_stack_branches(stack, current="feat/middle", trunk="master") == (
        "feat/base",
        "feat/child",
        "feat/grandchild",
    )


def test_excludes_current_and_trunk() -> None:
    stack = _stack(
        ancestors=("master", "feat/middle"),
        descendants=("feat/middle", "feat/child"),
    )

    assert collect_stack_branches(stack, current="feat/middle", trunk="master") == ("feat/child",)


def test_dedupes_when_ancestors_and_descendants_overlap() -> None:
    stack = _stack(
        ancestors=("master", "feat/base"),
        descendants=("feat/base", "feat/child"),
    )

    assert collect_stack_branches(stack, current="feat/middle", trunk="master") == (
        "feat/base",
        "feat/child",
    )


def test_empty_stack_returns_empty() -> None:
    stack = _stack(ancestors=(), descendants=())

    assert collect_stack_branches(stack, current="feat/middle", trunk="master") == ()


def test_only_trunk_in_ancestors_yields_empty() -> None:
    stack = _stack(ancestors=("master",), descendants=())

    assert collect_stack_branches(stack, current="feat/middle", trunk="master") == ()


def test_downstack_only_returns_ancestors_excluding_descendants() -> None:
    stack = _stack(
        ancestors=("master", "feat/base"),
        descendants=("feat/child", "feat/grandchild"),
    )

    assert collect_stack_branches(
        stack, current="feat/middle", trunk="master", downstack_only=True
    ) == ("feat/base",)


def test_downstack_default_false_returns_ancestors_and_descendants() -> None:
    stack = _stack(
        ancestors=("master", "feat/base"),
        descendants=("feat/child", "feat/grandchild"),
    )

    assert collect_stack_branches(
        stack, current="feat/middle", trunk="master", downstack_only=False
    ) == (
        "feat/base",
        "feat/child",
        "feat/grandchild",
    )


def test_include_current_returns_ancestors_current_then_descendants() -> None:
    stack = _stack(
        ancestors=("master", "feat/base"),
        descendants=("feat/child", "feat/grandchild"),
    )

    assert collect_stack_branches(
        stack,
        current="feat/middle",
        trunk="master",
        include_current=True,
    ) == (
        "feat/base",
        "feat/middle",
        "feat/child",
        "feat/grandchild",
    )


def test_include_current_excludes_trunk_and_dedupes() -> None:
    stack = _stack(
        ancestors=("master", "feat/base", "feat/middle"),
        descendants=("feat/base", "feat/child", "feat/middle"),
    )

    assert collect_stack_branches(
        stack,
        current="feat/middle",
        trunk="master",
        include_current=True,
    ) == (
        "feat/base",
        "feat/middle",
        "feat/child",
    )


def test_include_current_downstack_only_returns_ancestors_and_current() -> None:
    stack = _stack(
        ancestors=("master", "feat/base"),
        descendants=("feat/child", "feat/grandchild"),
    )

    assert collect_stack_branches(
        stack,
        current="feat/middle",
        trunk="master",
        downstack_only=True,
        include_current=True,
    ) == ("feat/base", "feat/middle")


def test_collect_stack_edges_returns_displayed_parent_child_edges() -> None:
    stack = _stack(
        ancestors=("master", "feat/base"),
        descendants=("feat/child", "feat/grandchild"),
    )

    assert collect_stack_edges(stack, current="feat/middle") == (
        ("master", "feat/base"),
        ("feat/base", "feat/middle"),
        ("feat/middle", "feat/child"),
        ("feat/child", "feat/grandchild"),
    )


def test_collect_stack_edges_downstack_excludes_descendant_edges() -> None:
    stack = _stack(
        ancestors=("master", "feat/base"),
        descendants=("feat/child", "feat/grandchild"),
    )

    assert collect_stack_edges(stack, current="feat/middle", downstack_only=True) == (
        ("master", "feat/base"),
        ("feat/base", "feat/middle"),
    )
