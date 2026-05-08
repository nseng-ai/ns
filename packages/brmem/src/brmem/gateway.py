"""Abstract interface and gateway-specific errors for branch memory."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass

import brmem.ref_layout as ref_layout


@dataclass(frozen=True)
class EntryDiagnostic:
    """Probe data for a single entry ref."""

    head_sha: str
    head_date: str
    blob_sha: str
    size_bytes: int


class BrmemCopyConflictError(Exception):
    """Raised when ``copy_entries`` finds existing destination keys and ``overwrite`` is false."""

    def __init__(self, conflicts: tuple[ref_layout.EntryRef, ...]) -> None:
        self.conflicts = conflicts
        joined = ", ".join(entry.key for entry in conflicts)
        super().__init__(f"destination has conflicting entries: {joined}")


class KeyNotFoundError(Exception):
    """Raised when ``delete`` cannot find the entry to remove.

    Carries the ``(namespace, key, branch)`` identity so callers (in particular
    the CLI layer) can build a human-readable failure message without
    re-deriving the locator.
    """

    def __init__(self, namespace: str | None, key: str, branch: str) -> None:
        self.namespace = namespace
        self.key = key
        self.branch = branch
        ns_label = namespace if namespace is not None else "(base)"
        super().__init__(f"key {key!r} not found in namespace {ns_label} on branch {branch!r}")


class BranchMemoryGateway(ABC):
    """Store small per-branch blobs outside the working tree.

    Entries are keyed by ``(namespace, key, branch)`` where ``namespace`` may
    be ``None`` to store under the ad-hoc base subtree. Each
    ``(namespace, branch)`` pair maps to a single snapshot commit whose tree
    holds every entry as a blob at path ``key``.
    """

    @abstractmethod
    def list_entries(
        self,
        *,
        namespace: str | None = None,
        key: str | None = None,
        branch: str | None = None,
    ) -> list[ref_layout.EntryRef]:
        """Return entries, optionally filtered by namespace/key/branch.

        ``namespace=None`` means "no namespace filter" — both base and
        namespaced entries are returned.
        """

    @abstractmethod
    def put(
        self,
        namespace: str | None,
        key: str,
        branch: str,
        content: str,
    ) -> str:
        """Write ``content`` as the single blob of the entry and return the new commit SHA."""

    @abstractmethod
    def get(
        self,
        namespace: str | None,
        key: str,
        branch: str,
        *,
        at: str | None = None,
    ) -> str | None:
        """Read the entry blob at ``at`` or the entry head when omitted."""

    @abstractmethod
    def check(
        self,
        namespace: str | None,
        key: str,
        branch: str,
        *,
        at: str | None = None,
    ) -> EntryDiagnostic | None:
        """Return diagnostics for the entry at ``at`` (or head), or ``None``."""

    @abstractmethod
    def delete(
        self,
        namespace: str | None,
        key: str,
        branch: str,
    ) -> str:
        """Remove the entry and return the new snapshot commit SHA.

        Raises :class:`KeyNotFoundError` if the snapshot ref does not exist or
        the key is not present in it. Deleting the last key leaves the snapshot
        ref pointing at a commit with an empty tree — the ref is **not**
        removed.
        """

    @abstractmethod
    def copy_entries(
        self,
        *,
        namespace: str,
        from_branch: str,
        to_branch: str,
        overwrite: bool,
        key_glob: str | None,
    ) -> tuple[ref_layout.EntryRef, ...]:
        """Atomically copy entries in ``namespace`` from ``from_branch`` to ``to_branch``.

        When ``key_glob`` is ``None`` this is a snapshot-level operation: the
        destination snapshot ref is pointed at the **same commit SHA** as the
        source snapshot — no new blob, tree, or commit is created. When
        ``overwrite`` is ``False`` and the destination snapshot already exists,
        raises :class:`BrmemCopyConflictError` before mutating any ref. When
        ``overwrite`` is ``True``, the destination snapshot is **replaced
        entirely** (any keys that existed only on the destination are dropped,
        since the snapshot ref is reassigned).

        When ``key_glob`` is a non-empty ``fnmatch`` pattern, only source keys
        where ``fnmatch.fnmatchcase(key, key_glob)`` is true are copied. The
        destination tree is rebuilt as ``dest_non_matching ∪ source_matching``
        (source wins on key collision), committed, and the destination ref is
        updated in one ``update-ref`` call. Non-matching destination keys are
        always preserved regardless of ``overwrite``; ``overwrite=False`` with
        matching destination keys raises :class:`BrmemCopyConflictError`, and
        ``overwrite=True`` replaces only the matching destination keys. If no
        source keys match, the gateway returns an empty tuple without touching
        the destination ref.

        Returns destination :class:`brmem.ref_layout.EntryRef` objects in sorted key order.
        """
