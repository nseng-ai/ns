"""In-memory fake branch memory gateway."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from twerk_core.brmem.gateway import (
    BranchMemoryGateway,
    EntryDiagnostic,
    EntryRef,
    ref_name_for_entry,
    validate_branch_name,
    validate_key,
    validate_namespace,
)

_FAKE_EPOCH = datetime(2026, 1, 1, tzinfo=UTC)

_EntryKey = tuple[str, str, str]


class FakeBranchMemoryGateway(BranchMemoryGateway):
    """In-memory fake with constructor-only state and mutation tracking."""

    def __init__(
        self,
        *,
        initial_entries: dict[_EntryKey, str] | None = None,
    ) -> None:
        self._contents_by_sha: dict[str, str] = {}
        self._head_by_entry: dict[_EntryKey, str] = {}
        self._commit_dates_by_sha: dict[str, str] = {}
        self._put_calls: list[tuple[str, str, str, str]] = []
        self._next_commit_number = 1

        for entry_key, content in (initial_entries or {}).items():
            namespace, key, branch = entry_key
            validate_namespace(namespace)
            validate_key(key)
            validate_branch_name(branch)
            self._head_by_entry[entry_key] = self._record_content(content)

    def list_entries(
        self,
        *,
        namespace: str | None = None,
        key: str | None = None,
        branch: str | None = None,
    ) -> list[EntryRef]:
        if namespace is not None:
            validate_namespace(namespace)
        if key is not None:
            validate_key(key)
        if branch is not None:
            validate_branch_name(branch)

        entries: list[EntryRef] = []
        for ns, k, br in self._head_by_entry:
            if namespace is not None and ns != namespace:
                continue
            if key is not None and k != key:
                continue
            if branch is not None and br != branch:
                continue
            entries.append(
                EntryRef(
                    namespace=ns,
                    key=k,
                    branch=br,
                    ref_name=ref_name_for_entry(ns, k, br),
                )
            )

        entries.sort(key=lambda e: (e.namespace, e.key, e.branch))
        return entries

    def put(
        self,
        namespace: str,
        key: str,
        branch: str,
        content: str,
    ) -> str:
        validate_namespace(namespace)
        validate_key(key)
        validate_branch_name(branch)

        entry_key = (namespace, key, branch)
        commit_sha = self._record_content(content)
        self._head_by_entry[entry_key] = commit_sha
        self._put_calls.append((namespace, key, branch, content))
        return commit_sha

    def get(
        self,
        namespace: str,
        key: str,
        branch: str,
        *,
        at: str | None = None,
    ) -> str | None:
        validate_namespace(namespace)
        validate_key(key)
        validate_branch_name(branch)

        if at is None:
            head = self._head_by_entry.get((namespace, key, branch))
            if head is None:
                return None
            return self._contents_by_sha[head]

        return self._contents_by_sha.get(at)

    def check(
        self,
        namespace: str,
        key: str,
        branch: str,
        *,
        at: str | None = None,
    ) -> EntryDiagnostic | None:
        validate_namespace(namespace)
        validate_key(key)
        validate_branch_name(branch)

        if at is None:
            target_sha = self._head_by_entry.get((namespace, key, branch))
        else:
            target_sha = at if at in self._contents_by_sha else None
        if target_sha is None:
            return None

        content = self._contents_by_sha[target_sha]
        return EntryDiagnostic(
            head_sha=target_sha,
            head_date=self._commit_dates_by_sha[target_sha],
            blob_sha=f"blob-{target_sha}",
            size_bytes=len(content.encode("utf-8")),
        )

    def _record_content(self, content: str) -> str:
        commit_sha = f"fake-{self._next_commit_number:04d}"
        commit_date = (_FAKE_EPOCH + timedelta(seconds=self._next_commit_number)).isoformat()
        self._next_commit_number += 1
        self._contents_by_sha[commit_sha] = content
        self._commit_dates_by_sha[commit_sha] = commit_date
        return commit_sha
