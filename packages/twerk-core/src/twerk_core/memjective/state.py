"""Parse the machine-readable state blob for a memjective slug."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, cast

from twerk_core.brmem.gateway import BranchMemoryGateway

STATE_NAMESPACE = "memjective-state"
STATE_BRANCH = "master"
STATE_FILE = "state.json"
STATE_VERSION = 1


def state_key(slug: str) -> str:
    return f"{slug}/{STATE_FILE}"


@dataclass(frozen=True)
class StateRoot:
    namespace: str
    branch: str
    path: str


@dataclass(frozen=True)
class StateEntry:
    id: str
    raw: dict[str, Any]


@dataclass(frozen=True)
class MemjectiveState:
    version: int
    slug: str
    root: StateRoot
    entries: tuple[StateEntry, ...]


@dataclass(frozen=True)
class StateAbsent:
    pass


@dataclass(frozen=True)
class StateInvalid:
    reason: str


StateLoadResult = MemjectiveState | StateAbsent | StateInvalid


def load_state(*, slug: str, brmem_gateway: BranchMemoryGateway) -> StateLoadResult:
    content = brmem_gateway.get(STATE_NAMESPACE, state_key(slug), STATE_BRANCH)
    if content is None:
        return StateAbsent()
    return parse_state(slug=slug, content=content)


def parse_state(*, slug: str, content: str) -> MemjectiveState | StateInvalid:
    try:
        payload = json.loads(content)
    except json.JSONDecodeError as exc:
        return StateInvalid(reason=f"state.json is not valid JSON: {exc.msg}")

    if not isinstance(payload, dict):
        return StateInvalid(reason="state.json must be a JSON object")

    if "version" not in payload:
        return StateInvalid(reason="unsupported state schema version None; expected 1")
    version = payload["version"]
    if version != STATE_VERSION:
        return StateInvalid(reason=f"unsupported state schema version {version}; expected 1")

    if "slug" not in payload:
        return StateInvalid(reason=f"state.json slug None does not match requested slug {slug}")
    payload_slug = payload["slug"]
    if payload_slug != slug:
        return StateInvalid(
            reason=f"state.json slug {payload_slug} does not match requested slug {slug}"
        )

    if "root" not in payload or not isinstance(payload["root"], dict):
        return StateInvalid(reason="state.json 'root' must be an object")
    root_payload = payload["root"]
    namespace = root_payload.get("namespace")
    branch = root_payload.get("branch")
    path = root_payload.get("path")
    if not isinstance(namespace, str) or not isinstance(branch, str) or not isinstance(path, str):
        return StateInvalid(
            reason="state.json 'root' must have string 'namespace', 'branch', and 'path'"
        )

    if "entries" not in payload or not isinstance(payload["entries"], list):
        return StateInvalid(reason="state.json 'entries' must be an array")

    entries: list[StateEntry] = []
    seen_ids: set[str] = set()
    raw_entries: list[Any] = payload["entries"]
    for index, entry_payload in enumerate(raw_entries):
        if not isinstance(entry_payload, dict):
            return StateInvalid(reason=f"state.json entries[{index}] must be an object")
        entry_dict = cast(dict[str, Any], entry_payload)
        entry_id = entry_dict.get("id")
        if not isinstance(entry_id, str) or not entry_id:
            return StateInvalid(
                reason=f"state.json entries[{index}] must carry a non-empty string 'id'"
            )
        if entry_id in seen_ids:
            return StateInvalid(reason=f"state.json contains duplicate entry id {entry_id}")
        seen_ids.add(entry_id)
        entries.append(StateEntry(id=entry_id, raw=entry_dict))

    return MemjectiveState(
        version=version,
        slug=slug,
        root=StateRoot(namespace=namespace, branch=branch, path=path),
        entries=tuple(entries),
    )
