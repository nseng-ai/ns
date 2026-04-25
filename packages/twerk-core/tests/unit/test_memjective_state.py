from __future__ import annotations

import json

from twerk_core.brmem.fake import FakeBranchMemoryGateway
from twerk_core.memjective.state import (
    MemjectiveState,
    StateAbsent,
    StateInvalid,
    load_state,
    parse_state,
)


def _seed(gateway: FakeBranchMemoryGateway, slug: str, payload: object) -> None:
    gateway.put("memjective-state", f"{slug}/state.json", "master", json.dumps(payload))


def _valid_payload(slug: str = "widget") -> dict[str, object]:
    return {
        "version": 1,
        "slug": slug,
        "root": {
            "namespace": "memjectives",
            "branch": "master",
            "path": f"{slug}/body.md",
        },
        "entries": [],
    }


def test_absent_state_loads_as_empty_legacy_state() -> None:
    gateway = FakeBranchMemoryGateway()

    result = load_state(slug="widget", brmem_gateway=gateway)

    assert result == StateAbsent()


def test_invalid_json_reports_invalid_state() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("memjective-state", "widget/state.json", "master", "{not json")

    result = load_state(slug="widget", brmem_gateway=gateway)

    assert isinstance(result, StateInvalid)
    assert result.reason.startswith("state.json is not valid JSON")


def test_unsupported_version_is_rejected() -> None:
    gateway = FakeBranchMemoryGateway()
    payload = _valid_payload()
    payload["version"] = 999
    _seed(gateway, "widget", payload)

    result = load_state(slug="widget", brmem_gateway=gateway)

    assert isinstance(result, StateInvalid)
    assert "999" in result.reason


def test_slug_mismatch_is_rejected() -> None:
    gateway = FakeBranchMemoryGateway()
    payload = _valid_payload(slug="other")
    _seed(gateway, "widget", payload)

    result = load_state(slug="widget", brmem_gateway=gateway)

    assert isinstance(result, StateInvalid)
    assert "other" in result.reason
    assert "widget" in result.reason


def test_duplicate_entry_ids_are_rejected() -> None:
    gateway = FakeBranchMemoryGateway()
    payload = _valid_payload()
    payload["entries"] = [
        {"id": "pr-7", "title": "first"},
        {"id": "pr-7", "title": "second"},
    ]
    _seed(gateway, "widget", payload)

    result = load_state(slug="widget", brmem_gateway=gateway)

    assert isinstance(result, StateInvalid)
    assert "pr-7" in result.reason


def test_raw_entry_payload_is_preserved() -> None:
    gateway = FakeBranchMemoryGateway()
    payload = _valid_payload()
    entry = {
        "id": "pr-1",
        "title": "Initial slice",
        "url": "https://example.com/pull/1",
    }
    payload["entries"] = [entry]
    _seed(gateway, "widget", payload)

    result = load_state(slug="widget", brmem_gateway=gateway)

    assert isinstance(result, MemjectiveState)
    assert result.entries[0].raw == entry


def test_happy_path_populates_state_root_and_entries() -> None:
    gateway = FakeBranchMemoryGateway()
    payload = _valid_payload()
    payload["entries"] = [
        {"id": "pr-1", "title": "first"},
        {"id": "pr-2", "title": "second"},
        {"id": "pr-3", "title": "third"},
    ]
    _seed(gateway, "widget", payload)

    result = load_state(slug="widget", brmem_gateway=gateway)

    assert isinstance(result, MemjectiveState)
    assert result.version == 1
    assert result.slug == "widget"
    assert result.root.namespace == "memjectives"
    assert result.root.branch == "master"
    assert result.root.path == "widget/body.md"
    assert len(result.entries) == 3
    assert [entry.id for entry in result.entries] == ["pr-1", "pr-2", "pr-3"]


def test_parse_state_invalid_top_level_object() -> None:
    result = parse_state(slug="widget", content="[]")

    assert isinstance(result, StateInvalid)
    assert result.reason == "state.json must be a JSON object"
