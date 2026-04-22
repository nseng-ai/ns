"""Context factory for the memjective CLI.

Memjectives reuse :class:`BrmemCliContext` because the memjective CLI is a
namespace-pinned veneer over brmem; both surfaces need exactly the same
``BranchMemoryGateway`` and ``GitGateway``. Keep this module thin — no
duplication of brmem gateway wiring.
"""

from __future__ import annotations

from twerk_core.brmem.context import BrmemCliContext, build_brmem_context


def build_memjective_context() -> BrmemCliContext:
    """Assemble a :class:`BrmemCliContext` for the memjective CLI."""
    return build_brmem_context()
