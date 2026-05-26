from __future__ import annotations

from asdl_core.gt.types import StackInfo


def collect_stack_branches(
    stack: StackInfo, current: str, trunk: str, downstack_only: bool = False
) -> tuple[str, ...]:
    """Return every branch in the stack except current and trunk.

    Walks ``stack.ancestors`` then ``stack.descendants``, dropping any entry
    equal to ``current`` or ``trunk``, deduping while preserving order.

    When ``downstack_only`` is ``True``, only ``stack.ancestors`` (the
    trunk → immediate-parent-of-current downstack chain) is walked;
    ``stack.descendants`` (upstack) is skipped. This matches the scope of
    ``gt restack --downstack``.
    """
    branches = stack.ancestors if downstack_only else (*stack.ancestors, *stack.descendants)
    seen: set[str] = set()
    out: list[str] = []
    for branch in branches:
        if branch == current or branch == trunk:
            continue
        if branch in seen:
            continue
        seen.add(branch)
        out.append(branch)
    return tuple(out)
