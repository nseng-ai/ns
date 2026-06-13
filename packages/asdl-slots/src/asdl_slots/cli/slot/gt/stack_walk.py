from __future__ import annotations

from asdl_core.gt.types import StackInfo


def collect_stack_branches(
    stack: StackInfo,
    current: str,
    trunk: str,
    downstack_only: bool = False,
    *,
    include_current: bool = False,
) -> tuple[str, ...]:
    """Return stack branches in traversal order while excluding trunk.

    Walks ``stack.ancestors`` then, when requested, ``current``, then
    ``stack.descendants``. The trunk branch is always dropped and duplicate
    branch names are removed while preserving order. By default, ``current``
    is also excluded for free-stack callers.

    When ``downstack_only`` is ``True``, only ``stack.ancestors`` (the
    trunk → immediate-parent-of-current downstack chain) plus optionally
    ``current`` is walked; ``stack.descendants`` (upstack) is skipped. This
    matches the scope of ``gt restack --downstack``.
    """
    if downstack_only:
        branches = (*stack.ancestors, current) if include_current else stack.ancestors
    elif include_current:
        branches = (*stack.ancestors, current, *stack.descendants)
    else:
        branches = (*stack.ancestors, *stack.descendants)

    seen: set[str] = set()
    out: list[str] = []
    for branch in branches:
        if branch == trunk:
            continue
        if not include_current and branch == current:
            continue
        if branch in seen:
            continue
        seen.add(branch)
        out.append(branch)
    return tuple(out)
