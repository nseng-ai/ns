from __future__ import annotations

import pytest

from twerk_core.clinkr.non_ideal_state import error_type_for
from twerk_reviewer.harness.claude.adapter import CLAUDE_CODE_ADAPTER, CLAUDE_CODE_NAME
from twerk_reviewer.harness_registry import HARNESS_ADAPTERS, resolve_adapter
from twerk_reviewer.models import ReviewerFailure


def test_claude_code_adapter_is_registered() -> None:
    assert HARNESS_ADAPTERS[CLAUDE_CODE_NAME] is CLAUDE_CODE_ADAPTER
    assert CLAUDE_CODE_ADAPTER.binary == "claude"


def test_resolve_adapter_returns_registered_adapter() -> None:
    assert resolve_adapter("claude-code") is CLAUDE_CODE_ADAPTER


def test_resolve_adapter_returns_failure_for_unknown_name() -> None:
    result = resolve_adapter("banana")
    assert isinstance(result, ReviewerFailure)
    assert error_type_for(result) == "harness_unknown"
    assert "claude-code" in result.message


def test_harness_registry_is_read_only() -> None:
    with pytest.raises(TypeError):
        HARNESS_ADAPTERS["new"] = CLAUDE_CODE_ADAPTER  # type: ignore[index]
