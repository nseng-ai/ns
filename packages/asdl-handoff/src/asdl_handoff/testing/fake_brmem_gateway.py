"""In-memory fake for the handoff-owned Branch Memory gateway."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import NamedTuple

from asdl_handoff.cli.handoff.brmem_gateway import (
    HandoffEntryDiagnostic,
    HandoffEntryRef,
    KeyNotFoundError,
    check_branch_name,
    check_key,
    entry_ref_sort_key,
    ref_name_for_entry,
    validate_namespace,
)

_FAKE_EPOCH = datetime(2026, 1, 1, tzinfo=UTC)


class EntryKey(NamedTuple):
    namespace: str
    key: str
    branch: str


@dataclass(frozen=True)
class _EntryState:
    content: str
    content_sha: str
    updated_at: str


class FakeHandoffBrmemGateway:
    """Small fake that preserves handoff tests' Branch Memory conveniences."""

    def __init__(self, *, initial_entries: dict[EntryKey, str] | None = None) -> None:
        self._entries: dict[EntryKey, _EntryState] = {}
        self._head_by_snapshot: dict[tuple[str, str], str] = {}
        self._head_date_by_snapshot: dict[tuple[str, str], str] = {}
        self._next_commit_number = 1

        for entry_key, content in (initial_entries or {}).items():
            self.put(entry_key.namespace, entry_key.key, entry_key.branch, content)

    def list_entries(self, *, namespace: str, branch: str | None) -> list[HandoffEntryRef]:
        validate_namespace(namespace)
        if branch is not None:
            _validate_branch(branch)
        entries = [
            HandoffEntryRef(
                namespace=entry_key.namespace,
                key=entry_key.key,
                branch=entry_key.branch,
                entry_locator=ref_name_for_entry(
                    entry_key.namespace,
                    entry_key.key,
                    entry_key.branch,
                ),
            )
            for entry_key in self._entries
            if entry_key.namespace == namespace and (branch is None or entry_key.branch == branch)
        ]
        entries.sort(key=entry_ref_sort_key)
        return entries

    def put(self, namespace: str, key: str, branch: str, content: str) -> str:
        validate_namespace(namespace)
        _validate_key(key)
        _validate_branch(branch)
        commit_sha, commit_date = self._next_commit()
        content_sha = f"content-{commit_sha}"
        entry_key = EntryKey(namespace, key, branch)
        self._entries[entry_key] = _EntryState(
            content=content,
            content_sha=content_sha,
            updated_at=commit_date,
        )
        snapshot_key = (namespace, branch)
        self._head_by_snapshot[snapshot_key] = commit_sha
        self._head_date_by_snapshot[snapshot_key] = commit_date
        return commit_sha

    def get(self, namespace: str, key: str, branch: str) -> str | None:
        validate_namespace(namespace)
        _validate_key(key)
        _validate_branch(branch)
        entry = self._entries.get(EntryKey(namespace, key, branch))
        if entry is None:
            return None
        return entry.content

    def check(self, namespace: str, key: str, branch: str) -> HandoffEntryDiagnostic | None:
        validate_namespace(namespace)
        _validate_key(key)
        _validate_branch(branch)
        entry = self._entries.get(EntryKey(namespace, key, branch))
        if entry is None:
            return None
        snapshot_key = (namespace, branch)
        return HandoffEntryDiagnostic(
            head_sha=self._head_by_snapshot[snapshot_key],
            head_date=self._head_date_by_snapshot[snapshot_key],
            blob_sha=f"blob-{entry.content_sha}",
            size_bytes=len(entry.content.encode("utf-8")),
        )

    def get_entry_updated_at(self, namespace: str, key: str, branch: str) -> str | None:
        validate_namespace(namespace)
        _validate_key(key)
        _validate_branch(branch)
        entry = self._entries.get(EntryKey(namespace, key, branch))
        if entry is None:
            return None
        return entry.updated_at

    def delete(self, namespace: str, key: str, branch: str) -> str:
        validate_namespace(namespace)
        _validate_key(key)
        _validate_branch(branch)
        entry_key = EntryKey(namespace, key, branch)
        if entry_key not in self._entries:
            raise KeyNotFoundError(namespace, key, branch)
        del self._entries[entry_key]
        commit_sha, commit_date = self._next_commit()
        snapshot_key = (namespace, branch)
        self._head_by_snapshot[snapshot_key] = commit_sha
        self._head_date_by_snapshot[snapshot_key] = commit_date
        return commit_sha

    def _next_commit(self) -> tuple[str, str]:
        commit_sha = f"fake-{self._next_commit_number:04d}"
        commit_date = (_FAKE_EPOCH + timedelta(seconds=self._next_commit_number)).isoformat()
        self._next_commit_number += 1
        return commit_sha, commit_date


def _validate_key(key: str) -> None:
    failure = check_key(key)
    if failure is not None:
        raise ValueError(failure)


def _validate_branch(branch: str) -> None:
    failure = check_branch_name(branch)
    if failure is not None:
        raise ValueError(failure)
