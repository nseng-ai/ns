from __future__ import annotations

import json

import pytest

from twerk_core.brmem.fake import FakeBranchMemoryGateway
from twerk_core.memjective.state import (
    MEMJECTIVE_STATE_NAMESPACE,
    MemjectiveStateError,
    load_memjective_state,
    parse_memjective_state_json,
)


def _state_payload(*, slug: str = "widget", entries: list[dict] | None = None) -> dict:
    return {
        "version": 1,
        "slug": slug,
        "root": {
            "namespace": "memjectives",
            "branch": "master",
            "path": slug,
        },
        "entries": [] if entries is None else entries,
    }


def test_parse_empty_state() -> None:
    state = parse_memjective_state_json(json.dumps(_state_payload()))

    assert state.version == 1
    assert state.slug == "widget"
    assert state.root.namespace == "memjectives"
    assert state.root.branch == "master"
    assert state.root.path == "widget"
    assert state.entries == ()


def test_parse_state_preserves_entry_payload() -> None:
    entry = {
        "id": "pr-123",
        "kind": "pull_request",
        "pr": {"number": 123, "state": "MERGED"},
        "resolution": {"status": "incorporated"},
    }

    state = parse_memjective_state_json(json.dumps(_state_payload(entries=[entry])))

    [parsed_entry] = state.entries
    assert parsed_entry.id == "pr-123"
    assert parsed_entry.kind == "pull_request"
    assert parsed_entry.pr_payload == {"number": 123, "state": "MERGED"}
    assert parsed_entry.resolution_status == "incorporated"
    assert parsed_entry.to_json_dict() == entry


def test_parse_rejects_invalid_json() -> None:
    with pytest.raises(MemjectiveStateError, match="invalid JSON"):
        parse_memjective_state_json("{not json")


def test_parse_rejects_version_mismatch() -> None:
    payload = _state_payload()
    payload["version"] = 2

    with pytest.raises(MemjectiveStateError, match="unsupported state version 2"):
        parse_memjective_state_json(json.dumps(payload))


def test_parse_rejects_schema_failure() -> None:
    payload = _state_payload()
    payload["entries"] = [{"kind": "pull_request"}]

    with pytest.raises(MemjectiveStateError, match=r"\$\.entries\[0\]\.id"):
        parse_memjective_state_json(json.dumps(payload))


def test_parse_rejects_slug_mismatch() -> None:
    with pytest.raises(MemjectiveStateError, match="does not match requested slug"):
        parse_memjective_state_json(
            json.dumps(_state_payload(slug="other")),
            expected_slug="widget",
        )


def test_load_absent_state_is_valid_empty_state() -> None:
    load = load_memjective_state(FakeBranchMemoryGateway(), slug="widget")

    assert load.status == "absent"
    assert load.key == "widget/state.json"
    assert load.error is None
    assert load.state.slug == "widget"
    assert load.state.entries == ()


def test_load_invalid_state_returns_invalid_diagnostic() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put(MEMJECTIVE_STATE_NAMESPACE, "widget/state.json", "master", "{not json")

    load = load_memjective_state(gateway, slug="widget")

    assert load.status == "invalid"
    assert "invalid JSON" in (load.error or "")
    assert load.state.slug == "widget"
    assert load.state.entries == ()
