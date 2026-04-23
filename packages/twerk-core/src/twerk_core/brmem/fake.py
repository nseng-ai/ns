"""In-memory fake branch memory gateway (snapshot-tree model).

Mirrors :class:`RealBranchMemoryGateway` at the snapshot level. Each
``(namespace, branch)`` maps to a commit sha in ``_snapshot_heads``; each
snapshot commit lives in ``_commits`` with its tree (``{key: content_sha}``)
and parent sha. Content is stored under synthetic content shas in
``_contents_by_sha``. Consecutive puts on the same ``(namespace, branch)``
link via ``parent``, giving the linear history invariant the real gateway
enforces.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import NamedTuple

from twerk_core.brmem.gateway import (
    BranchMemoryGateway,
    BrmemCopyConflictError,
    EntryDiagnostic,
    EntryRef,
    ref_name_for_entry,
    validate_branch_name,
    validate_namespace,
)
from twerk_core.brmem.key_validation import validate_key

_FAKE_EPOCH = datetime(2026, 1, 1, tzinfo=UTC)


class EntryKey(NamedTuple):
    namespace: str | None
    key: str
    branch: str


class _SnapshotKey(NamedTuple):
    namespace: str | None
    branch: str


class _TreeEntry(NamedTuple):
    key: str
    content_sha: str


@dataclass(frozen=True)
class _Snapshot:
    """Per-commit view of a snapshot: its tree and its parent."""

    tree: tuple[_TreeEntry, ...]  # sorted by key
    parent: str | None


class FakeBranchMemoryGateway(BranchMemoryGateway):
    """In-memory fake with constructor-only state and mutation tracking."""

    def __init__(
        self,
        *,
        initial_entries: dict[EntryKey, str] | None = None,
    ) -> None:
        self._contents_by_sha: dict[str, str] = {}
        self._commits: dict[str, _Snapshot] = {}
        self._snapshot_heads: dict[_SnapshotKey, str] = {}
        self._commit_dates_by_sha: dict[str, str] = {}
        self._put_calls: list[tuple[str | None, str, str, str]] = []
        self._next_commit_number = 1

        for entry_key, content in (initial_entries or {}).items():
            if entry_key.namespace is not None:
                validate_namespace(entry_key.namespace)
            validate_key(entry_key.key)
            validate_branch_name(entry_key.branch)
            self._put(entry_key.namespace, entry_key.key, entry_key.branch, content)

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
        for snapshot_key, head_sha in self._snapshot_heads.items():
            if namespace is not None and snapshot_key.namespace != namespace:
                continue
            if branch is not None and snapshot_key.branch != branch:
                continue
            for tree_entry in self._commits[head_sha].tree:
                if key is not None and tree_entry.key != key:
                    continue
                entries.append(
                    EntryRef(
                        namespace=snapshot_key.namespace,
                        key=tree_entry.key,
                        branch=snapshot_key.branch,
                        ref_name=ref_name_for_entry(
                            snapshot_key.namespace, tree_entry.key, snapshot_key.branch
                        ),
                    )
                )

        entries.sort(key=lambda e: (e.namespace or "", e.key, e.branch))
        return entries

    def put(
        self,
        namespace: str | None,
        key: str,
        branch: str,
        content: str,
    ) -> str:
        if namespace is not None:
            validate_namespace(namespace)
        validate_key(key)
        validate_branch_name(branch)
        commit_sha = self._put(namespace, key, branch, content)
        self._put_calls.append((namespace, key, branch, content))
        return commit_sha

    def get(
        self,
        namespace: str | None,
        key: str,
        branch: str,
        *,
        at: str | None = None,
    ) -> str | None:
        if namespace is not None:
            validate_namespace(namespace)
        validate_key(key)
        validate_branch_name(branch)

        commit_sha = self._resolve_target(namespace, branch, at)
        if commit_sha is None:
            return None
        content_sha = dict(self._commits[commit_sha].tree).get(key)
        if content_sha is None:
            return None
        return self._contents_by_sha[content_sha]

    def check(
        self,
        namespace: str | None,
        key: str,
        branch: str,
        *,
        at: str | None = None,
    ) -> EntryDiagnostic | None:
        if namespace is not None:
            validate_namespace(namespace)
        validate_key(key)
        validate_branch_name(branch)

        commit_sha = self._resolve_target(namespace, branch, at)
        if commit_sha is None:
            return None
        content_sha = dict(self._commits[commit_sha].tree).get(key)
        if content_sha is None:
            return None

        content = self._contents_by_sha[content_sha]
        return EntryDiagnostic(
            head_sha=commit_sha,
            head_date=self._commit_dates_by_sha[commit_sha],
            blob_sha=f"blob-{content_sha}",
            size_bytes=len(content.encode("utf-8")),
        )

    def copy_entries(
        self,
        *,
        namespace: str,
        from_branch: str,
        to_branch: str,
        overwrite: bool = False,
    ) -> tuple[EntryRef, ...]:
        validate_namespace(namespace)
        validate_branch_name(from_branch)
        validate_branch_name(to_branch)

        source_head = self._snapshot_heads.get(_SnapshotKey(namespace, from_branch))
        if source_head is None:
            return ()

        dest_head = self._snapshot_heads.get(_SnapshotKey(namespace, to_branch))
        if dest_head is not None and not overwrite:
            # Conflict is snapshot-level: surface every key currently on the
            # destination snapshot that would be replaced.
            conflicts = tuple(
                EntryRef(
                    namespace=namespace,
                    key=tree_entry.key,
                    branch=to_branch,
                    ref_name=ref_name_for_entry(namespace, tree_entry.key, to_branch),
                )
                for tree_entry in sorted(self._commits[dest_head].tree)
            )
            raise BrmemCopyConflictError(conflicts)

        self._snapshot_heads[_SnapshotKey(namespace, to_branch)] = source_head

        dest_entries = [
            EntryRef(
                namespace=namespace,
                key=tree_entry.key,
                branch=to_branch,
                ref_name=ref_name_for_entry(namespace, tree_entry.key, to_branch),
            )
            for tree_entry in sorted(self._commits[source_head].tree)
        ]
        return tuple(dest_entries)

    # -- internals -----------------------------------------------------------

    def _put(self, namespace: str | None, key: str, branch: str, content: str) -> str:
        snapshot_key = _SnapshotKey(namespace, branch)
        parent = self._snapshot_heads.get(snapshot_key)
        if parent is not None:
            tree = dict(self._commits[parent].tree)
        else:
            tree = {}

        # Allocate one sha per put and use it as both the commit sha and the
        # content-identity key inside the tree. That keeps ``blob_sha`` values
        # stable (``blob-<commit-sha>``) while still giving every write a
        # fresh identifier.
        sha = f"fake-{self._next_commit_number:04d}"
        commit_date = (_FAKE_EPOCH + timedelta(seconds=self._next_commit_number)).isoformat()
        self._next_commit_number += 1

        self._contents_by_sha[sha] = content
        tree[key] = sha

        self._commits[sha] = _Snapshot(
            tree=tuple(_TreeEntry(k, s) for k, s in sorted(tree.items())),
            parent=parent,
        )
        self._commit_dates_by_sha[sha] = commit_date
        self._snapshot_heads[snapshot_key] = sha
        return sha

    def _resolve_target(self, namespace: str | None, branch: str, at: str | None) -> str | None:
        if at is None:
            return self._snapshot_heads.get(_SnapshotKey(namespace, branch))
        return at if at in self._commits else None
