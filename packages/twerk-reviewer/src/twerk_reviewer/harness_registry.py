"""Registry of known harness adapters."""

from __future__ import annotations

from collections.abc import Mapping
from types import MappingProxyType

from twerk_reviewer.harness.claude.adapter import CLAUDE_CODE_ADAPTER
from twerk_reviewer.harness.codex.adapter import CODEX_ADAPTER
from twerk_reviewer.harness_adapter import HarnessAdapter
from twerk_reviewer.models import HarnessUnknown, ReviewerFailure

HARNESS_ADAPTERS: Mapping[str, HarnessAdapter] = MappingProxyType(
    {
        CLAUDE_CODE_ADAPTER.name: CLAUDE_CODE_ADAPTER,
        CODEX_ADAPTER.name: CODEX_ADAPTER,
    }
)


def resolve_adapter(name: str) -> HarnessAdapter | ReviewerFailure:
    """Look up a harness adapter by name."""
    adapter = HARNESS_ADAPTERS.get(name)
    if adapter is None:
        known = ", ".join(sorted(HARNESS_ADAPTERS))
        return HarnessUnknown(
            message=f"Unknown harness '{name}'. Known harnesses: {known}.",
        )
    return adapter
