"""Machine-readable reconciliation state for memjectives."""

from __future__ import annotations

import json
from dataclasses import dataclass
from json import JSONDecodeError
from typing import Any, Literal

from twerk_core.brmem.gateway import BranchMemoryGateway
from twerk_core.memjective.discovery import MASTER_BRANCH
from twerk_core.memjective.gateway_access import MEMJECTIVE_NAMESPACE

MEMJECTIVE_STATE_NAMESPACE = "memjective-state"
MEMJECTIVE_STATE_VERSION = 1

MemjectiveStateLoadStatus = Literal["absent", "loaded", "invalid"]


class MemjectiveStateError(ValueError):
    """Raised when a persisted memjective state document is malformed."""


@dataclass(frozen=True)
class MemjectiveStateRoot:
    namespace: str
    branch: str
    path: str

    def to_json_dict(self) -> dict[str, str]:
        return {
            "namespace": self.namespace,
            "branch": self.branch,
            "path": self.path,
        }


@dataclass(frozen=True)
class MemjectiveStateEntry:
    id: str
    kind: str
    raw: dict[str, Any]

    @property
    def resolution_status(self) -> str | None:
        resolution = self.raw.get("resolution")
        if not isinstance(resolution, dict):
            return None
        status = resolution.get("status")
        if not isinstance(status, str):
            return None
        return status

    @property
    def pr_payload(self) -> dict[str, Any] | None:
        pr = self.raw.get("pr")
        if not isinstance(pr, dict):
            return None
        return pr

    def to_json_dict(self) -> dict[str, Any]:
        return self.raw


@dataclass(frozen=True)
class MemjectiveState:
    version: int
    slug: str
    root: MemjectiveStateRoot
    entries: tuple[MemjectiveStateEntry, ...]

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "version": self.version,
            "slug": self.slug,
            "root": self.root.to_json_dict(),
            "entries": [entry.to_json_dict() for entry in self.entries],
        }


@dataclass(frozen=True)
class MemjectiveStateLoad:
    status: MemjectiveStateLoadStatus
    key: str
    state: MemjectiveState
    error: str | None = None


def memjective_state_key(slug: str) -> str:
    return f"{slug}/state.json"


def empty_memjective_state(slug: str) -> MemjectiveState:
    return MemjectiveState(
        version=MEMJECTIVE_STATE_VERSION,
        slug=slug,
        root=MemjectiveStateRoot(
            namespace=MEMJECTIVE_NAMESPACE,
            branch=MASTER_BRANCH,
            path=slug,
        ),
        entries=(),
    )


def load_memjective_state(
    gateway: BranchMemoryGateway,
    *,
    slug: str,
) -> MemjectiveStateLoad:
    key = memjective_state_key(slug)
    content = gateway.get(MEMJECTIVE_STATE_NAMESPACE, key, MASTER_BRANCH)
    if content is None:
        return MemjectiveStateLoad(
            status="absent",
            key=key,
            state=empty_memjective_state(slug),
        )

    try:
        state = parse_memjective_state_json(content, expected_slug=slug)
    except MemjectiveStateError as error:
        return MemjectiveStateLoad(
            status="invalid",
            key=key,
            state=empty_memjective_state(slug),
            error=str(error),
        )

    return MemjectiveStateLoad(status="loaded", key=key, state=state)


def parse_memjective_state_json(
    content: str,
    *,
    expected_slug: str | None = None,
) -> MemjectiveState:
    try:
        payload = json.loads(content)
    except JSONDecodeError as error:
        raise MemjectiveStateError(f"invalid JSON: {error.msg}") from error

    data = _expect_object(payload, "$")
    return parse_memjective_state_dict(data, expected_slug=expected_slug)


def parse_memjective_state_dict(
    data: dict[str, Any],
    *,
    expected_slug: str | None = None,
) -> MemjectiveState:
    version = data.get("version")
    if not isinstance(version, int) or isinstance(version, bool):
        raise MemjectiveStateError("$.version must be an integer")
    if version != MEMJECTIVE_STATE_VERSION:
        raise MemjectiveStateError(f"unsupported state version {version}")

    slug = _expect_string(data.get("slug"), "$.slug")
    if expected_slug is not None and slug != expected_slug:
        raise MemjectiveStateError(
            f"state slug {slug!r} does not match requested slug {expected_slug!r}"
        )

    root = _parse_root(data.get("root"))
    entries = _parse_entries(data.get("entries"))

    return MemjectiveState(
        version=version,
        slug=slug,
        root=root,
        entries=entries,
    )


def _parse_root(value: Any) -> MemjectiveStateRoot:
    root = _expect_object(value, "$.root")
    return MemjectiveStateRoot(
        namespace=_expect_string(root.get("namespace"), "$.root.namespace"),
        branch=_expect_string(root.get("branch"), "$.root.branch"),
        path=_expect_string(root.get("path"), "$.root.path"),
    )


def _parse_entries(value: Any) -> tuple[MemjectiveStateEntry, ...]:
    if not isinstance(value, list):
        raise MemjectiveStateError("$.entries must be an array")

    entries: list[MemjectiveStateEntry] = []
    seen_ids: set[str] = set()
    for index, raw_entry in enumerate(value):
        path = f"$.entries[{index}]"
        entry = _expect_object(raw_entry, path)
        entry_id = _expect_string(entry.get("id"), f"{path}.id")
        kind = _expect_string(entry.get("kind"), f"{path}.kind")
        if entry_id in seen_ids:
            raise MemjectiveStateError(f"{path}.id duplicates entry {entry_id!r}")
        seen_ids.add(entry_id)
        entries.append(
            MemjectiveStateEntry(
                id=entry_id,
                kind=kind,
                raw=dict(entry),
            )
        )
    return tuple(entries)


def _expect_object(value: Any, path: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise MemjectiveStateError(f"{path} must be an object")
    return value


def _expect_string(value: Any, path: str) -> str:
    if not isinstance(value, str):
        raise MemjectiveStateError(f"{path} must be a string")
    if not value:
        raise MemjectiveStateError(f"{path} must not be empty")
    return value
