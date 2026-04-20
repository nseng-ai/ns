"""In-memory fake branch memory gateway."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from twerk_core.brmem.gateway import (
    ArtifactDiagnostic,
    BranchMemoryGateway,
    EntryDiagnostic,
    EntryRef,
    ref_name_for_entry,
    validate_artifact_path,
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
        initial_entries: dict[_EntryKey, dict[str, str]] | None = None,
    ) -> None:
        self._snapshots_by_sha: dict[str, dict[str, str]] = {}
        self._head_by_entry: dict[_EntryKey, str] = {}
        self._commit_dates_by_sha: dict[str, str] = {}
        self._put_calls: list[tuple[str, str, str, str, str]] = []
        self._next_commit_number = 1

        for entry_key, artifacts in (initial_entries or {}).items():
            namespace, key, branch = entry_key
            validate_namespace(namespace)
            validate_key(key)
            validate_branch_name(branch)
            snapshot: dict[str, str] = {}
            for path, content in artifacts.items():
                validate_artifact_path(path)
                snapshot[path] = content
            self._head_by_entry[entry_key] = self._record_snapshot(snapshot)

    # -- entry-level --------------------------------------------------------

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

    def check_entry(
        self,
        namespace: str,
        key: str,
        branch: str,
    ) -> EntryDiagnostic | None:
        validate_namespace(namespace)
        validate_key(key)
        validate_branch_name(branch)

        head = self._head_by_entry.get((namespace, key, branch))
        if head is None:
            return None
        return EntryDiagnostic(
            head_sha=head,
            head_date=self._commit_dates_by_sha[head],
            artifact_count=len(self._snapshots_by_sha[head]),
        )

    # -- artifact-level -----------------------------------------------------

    def put_artifact(
        self,
        namespace: str,
        key: str,
        branch: str,
        path: str,
        content: str,
    ) -> str:
        validate_namespace(namespace)
        validate_key(key)
        validate_branch_name(branch)
        validate_artifact_path(path)

        entry_key = (namespace, key, branch)
        snapshot = dict(self._snapshot_for_entry(entry_key))
        snapshot[path] = content
        commit_sha = self._record_snapshot(snapshot)
        self._head_by_entry[entry_key] = commit_sha
        self._put_calls.append((namespace, key, branch, path, content))
        return commit_sha

    def get_artifact(
        self,
        namespace: str,
        key: str,
        branch: str,
        path: str,
        *,
        at: str | None = None,
    ) -> str | None:
        validate_namespace(namespace)
        validate_key(key)
        validate_branch_name(branch)
        validate_artifact_path(path)

        if at is None:
            head = self._head_by_entry.get((namespace, key, branch))
            if head is None:
                return None
            return self._snapshots_by_sha[head].get(path)

        snapshot = self._snapshots_by_sha.get(at)
        if snapshot is None:
            return None
        return snapshot.get(path)

    def list_artifacts(
        self,
        namespace: str,
        key: str,
        branch: str,
        *,
        at: str | None = None,
    ) -> list[str]:
        validate_namespace(namespace)
        validate_key(key)
        validate_branch_name(branch)

        if at is None:
            snapshot = self._snapshot_for_entry((namespace, key, branch))
        else:
            snapshot = self._snapshots_by_sha.get(at, {})
        return sorted(snapshot.keys())

    def check_artifact(
        self,
        namespace: str,
        key: str,
        branch: str,
        path: str,
        *,
        at: str | None = None,
    ) -> ArtifactDiagnostic | None:
        validate_namespace(namespace)
        validate_key(key)
        validate_branch_name(branch)
        validate_artifact_path(path)

        if at is None:
            target_sha = self._head_by_entry.get((namespace, key, branch))
        else:
            target_sha = at if at in self._snapshots_by_sha else None
        if target_sha is None:
            return None

        snapshot = self._snapshots_by_sha[target_sha]
        if path not in snapshot:
            return None

        content = snapshot[path]
        return ArtifactDiagnostic(
            blob_sha=f"blob-{target_sha}-{path}",
            size_bytes=len(content.encode("utf-8")),
            last_commit_sha=target_sha,
            last_commit_date=self._commit_dates_by_sha[target_sha],
        )

    # -- internals ----------------------------------------------------------

    def _record_snapshot(self, snapshot: dict[str, str]) -> str:
        commit_sha = f"fake-{self._next_commit_number:04d}"
        commit_date = (_FAKE_EPOCH + timedelta(seconds=self._next_commit_number)).isoformat()
        self._next_commit_number += 1
        self._snapshots_by_sha[commit_sha] = dict(snapshot)
        self._commit_dates_by_sha[commit_sha] = commit_date
        return commit_sha

    def _snapshot_for_entry(self, entry_key: _EntryKey) -> dict[str, str]:
        head = self._head_by_entry.get(entry_key)
        if head is None:
            return {}
        return self._snapshots_by_sha[head]
