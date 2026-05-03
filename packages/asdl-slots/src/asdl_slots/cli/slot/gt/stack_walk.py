from __future__ import annotations

from asdl_core.gt.types import StackInfo


def collect_stack_branches(stack: StackInfo, current: str, trunk: str) -> tuple[str, ...]:
    """Return every branch in the stack except current and trunk.

    Walks ``stack.ancestors`` then ``stack.descendants``, dropping any entry
    equal to ``current`` or ``trunk``, deduping while preserving order.
    """
    seen: set[str] = set()
    out: list[str] = []
    for branch in (*stack.ancestors, *stack.descendants):
        if branch == current or branch == trunk:
            continue
        if branch in seen:
            continue
        seen.add(branch)
        out.append(branch)
    return tuple(out)
