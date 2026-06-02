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

import fnmatch
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import NamedTuple

from brmem.gateway import (
    BranchMemoryGateway,
    BrmemCopyConflictError,
    EntryDiagnostic,
    KeyNotFoundError,
)
from brmem.key_validation import validate_key
from brmem.ref_layout import (
    BASE_NAMESPACE,
    EntryRef,
    entry_ref_sort_key,
    ref_name_for_entry,
    validate_branch_name,
    validate_namespace,
)
from brmem.validation import validate_key_glob

_FAKE_EPOCH = datetime(2026, 1, 1, tzinfo=UTC)


class EntryKey(NamedTuple):
    namespace: str
    key: str
    branch: str


class _SnapshotKey(NamedTuple):
    namespace: str
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
        self._put_calls: list[tuple[str, str, str, str]] = []
        self._next_commit_number = 1

        for entry_key, content in (initial_entries or {}).items():
            validate_namespace(entry_key.namespace)
            validate_key(entry_key.key)
            validate_branch_name(entry_key.branch)
            self._put(entry_key.namespace, entry_key.key, entry_key.branch, content)

    def list_entries(
        self,
        *,
        namespace: str,
        key: str | None = None,
        branch: str | None = None,
    ) -> list[EntryRef]:
        validate_namespace(namespace)
        return self._collect_entries(
            all_namespaces=False,
            namespace=namespace,
            key=key,
            branch=branch,
        )

    def list_all_entries(
        self,
        *,
        key: str | None = None,
        branch: str | None = None,
    ) -> list[EntryRef]:
        return self._collect_entries(
            all_namespaces=True,
            namespace=BASE_NAMESPACE,
            key=key,
            branch=branch,
        )

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
        commit_sha = self._put(namespace, key, branch, content)
        self._put_calls.append((namespace, key, branch, content))
        return commit_sha

    def delete(
        self,
        namespace: str,
        key: str,
        branch: str,
    ) -> str:
        validate_namespace(namespace)
        validate_key(key)
        validate_branch_name(branch)

        snapshot_key = _SnapshotKey(namespace, branch)
        parent = self._snapshot_heads.get(snapshot_key)
        if parent is None:
            raise KeyNotFoundError(namespace, key, branch)
        tree = dict(self._commits[parent].tree)
        if key not in tree:
            raise KeyNotFoundError(namespace, key, branch)
        del tree[key]

        sha = f"fake-{self._next_commit_number:04d}"
        commit_date = (_FAKE_EPOCH + timedelta(seconds=self._next_commit_number)).isoformat()
        self._next_commit_number += 1

        self._commits[sha] = _Snapshot(
            tree=tuple(_TreeEntry(k, s) for k, s in sorted(tree.items())),
            parent=parent,
        )
        self._commit_dates_by_sha[sha] = commit_date
        self._snapshot_heads[snapshot_key] = sha
        return sha

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

        commit_sha = self._resolve_target(namespace, branch, at)
        if commit_sha is None:
            return None
        content_sha = dict(self._commits[commit_sha].tree).get(key)
        if content_sha is None:
            return None
        return self._contents_by_sha[content_sha]

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

    def get_entry_updated_at(self, namespace: str, key: str, branch: str) -> str | None:
        validate_namespace(namespace)
        validate_key(key)
        validate_branch_name(branch)

        commit_sha = self._snapshot_heads.get(_SnapshotKey(namespace, branch))
        if commit_sha is None:
            return None

        head = self._commits.get(commit_sha)
        if head is None:
            return None
        if key not in dict(head.tree):
            return None

        while commit_sha is not None:
            snapshot = self._commits.get(commit_sha)
            if snapshot is None:
                return None

            current_tree = dict(snapshot.tree)
            current_content_sha = current_tree.get(key)
            if current_content_sha is None:
                return None

            parent_content_sha = None
            if snapshot.parent is not None:
                parent = self._commits.get(snapshot.parent)
                if parent is None:
                    return None
                parent_content_sha = dict(parent.tree).get(key)

            if current_content_sha != parent_content_sha:
                return self._commit_dates_by_sha.get(commit_sha)

            commit_sha = snapshot.parent

        return None

    def copy_entries(
        self,
        *,
        namespace: str,
        from_branch: str,
        to_branch: str,
        overwrite: bool,
        key_glob: str | None,
    ) -> tuple[EntryRef, ...]:
        validate_namespace(namespace)
        validate_branch_name(from_branch)
        validate_branch_name(to_branch)
        if key_glob is not None:
            validate_key_glob(key_glob)

        source_head = self._snapshot_heads.get(_SnapshotKey(namespace, from_branch))
        if source_head is None:
            return ()

        dest_key = _SnapshotKey(namespace, to_branch)
        dest_head = self._snapshot_heads.get(dest_key)

        if key_glob is None:
            if dest_head is not None:
                dest_entries = tuple(sorted(self._commits[dest_head].tree))
                if dest_entries and not overwrite:
                    # Conflict is Entry-based: surface every key currently on
                    # the destination snapshot that would be replaced.
                    conflicts = tuple(
                        EntryRef(
                            namespace=namespace,
                            key=tree_entry.key,
                            branch=to_branch,
                            ref_name=ref_name_for_entry(namespace, tree_entry.key, to_branch),
                        )
                        for tree_entry in dest_entries
                    )
                    raise BrmemCopyConflictError(conflicts)

            self._snapshot_heads[dest_key] = source_head

            return tuple(
                EntryRef(
                    namespace=namespace,
                    key=tree_entry.key,
                    branch=to_branch,
                    ref_name=ref_name_for_entry(namespace, tree_entry.key, to_branch),
                )
                for tree_entry in sorted(self._commits[source_head].tree)
            )

        source_matching = [
            tree_entry
            for tree_entry in self._commits[source_head].tree
            if fnmatch.fnmatchcase(tree_entry.key, key_glob)
        ]
        if not source_matching:
            return ()

        dest_tree = self._commits[dest_head].tree if dest_head is not None else ()
        dest_matching = [
            tree_entry for tree_entry in dest_tree if fnmatch.fnmatchcase(tree_entry.key, key_glob)
        ]
        dest_non_matching = [
            tree_entry
            for tree_entry in dest_tree
            if not fnmatch.fnmatchcase(tree_entry.key, key_glob)
        ]

        if dest_matching and not overwrite:
            conflicts = tuple(
                EntryRef(
                    namespace=namespace,
                    key=tree_entry.key,
                    branch=to_branch,
                    ref_name=ref_name_for_entry(namespace, tree_entry.key, to_branch),
                )
                for tree_entry in sorted(dest_matching)
            )
            raise BrmemCopyConflictError(conflicts)

        merged: dict[str, str] = {entry.key: entry.content_sha for entry in dest_non_matching}
        for entry in source_matching:
            merged[entry.key] = entry.content_sha

        sha = f"fake-{self._next_commit_number:04d}"
        commit_date = (_FAKE_EPOCH + timedelta(seconds=self._next_commit_number)).isoformat()
        self._next_commit_number += 1

        self._commits[sha] = _Snapshot(
            tree=tuple(_TreeEntry(k, s) for k, s in sorted(merged.items())),
            parent=dest_head,
        )
        self._commit_dates_by_sha[sha] = commit_date
        self._snapshot_heads[dest_key] = sha

        return tuple(
            EntryRef(
                namespace=namespace,
                key=entry.key,
                branch=to_branch,
                ref_name=ref_name_for_entry(namespace, entry.key, to_branch),
            )
            for entry in sorted(source_matching)
        )

    # -- internals -----------------------------------------------------------

    def _collect_entries(
        self,
        *,
        all_namespaces: bool,
        namespace: str,
        key: str | None,
        branch: str | None,
    ) -> list[EntryRef]:
        if key is not None:
            validate_key(key)
        if branch is not None:
            validate_branch_name(branch)

        entries: list[EntryRef] = []
        for snapshot_key, head_sha in self._snapshot_heads.items():
            if not all_namespaces and snapshot_key.namespace != namespace:
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

        entries.sort(key=entry_ref_sort_key)
        return entries

    def _put(self, namespace: str, key: str, branch: str, content: str) -> str:
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

    def _resolve_target(self, namespace: str, branch: str, at: str | None) -> str | None:
        if at is None:
            return self._snapshot_heads.get(_SnapshotKey(namespace, branch))
        return at if at in self._commits else None
