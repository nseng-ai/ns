"""Abstract interface and shared validation for branch memory.

Entries live under one of two snapshot-ref subtrees::

    refs/brmem/base/<encoded-branch>                   # ad-hoc / unnamespaced
    refs/brmem/ns/<namespace>/<encoded-branch>         # domain-owned

Each ``(namespace, branch)`` pair maps to **one** snapshot ref whose commit's
tree holds every entry as a blob at path ``<key>``. Keys keep their native
``/`` characters (nesting becomes nested subtrees); only the branch is encoded
(``/`` → ``---``) so it fits in a single ref segment. An entry exists iff its
``key`` appears in the tree of its snapshot commit.

Namespaced entries and base (ad-hoc) entries occupy disjoint ref prefixes, so
a scratch key cannot collide with a namespace name.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass

from twerk_core.brmem.key_validation import validate_key

BRMEM_REF_PREFIX = "refs/brmem"
BRMEM_BASE_SEGMENT = "base"
BRMEM_NS_SEGMENT = "ns"
_FLAT_SEPARATOR = "---"


@dataclass(frozen=True)
class EntryRef:
    """Identifies a single branch-memory entry within its snapshot.

    ``namespace`` is ``None`` for base (ad-hoc) entries. ``ref_name`` is a
    copy-pastable ``git show`` locator of the form
    ``<snapshot-ref>:<key>`` — not a real git ref. All entries in the same
    ``(namespace, branch)`` snapshot share the same ``<snapshot-ref>`` prefix.
    """

    namespace: str | None
    key: str
    branch: str
    ref_name: str


@dataclass(frozen=True)
class EntryDiagnostic:
    """Probe data for a single entry ref."""

    head_sha: str
    head_date: str
    blob_sha: str
    size_bytes: int


class InvalidBranchNameError(ValueError):
    """Raised when a branch name cannot be encoded safely into an entry ref."""

    def __init__(self, branch: str, reason: str) -> None:
        self.branch = branch
        self.reason = reason
        super().__init__(f"Invalid branch name {branch!r}: {reason}")


class InvalidNamespaceError(ValueError):
    """Raised when a namespace cannot be used in an entry ref."""

    def __init__(self, namespace: str, reason: str) -> None:
        self.namespace = namespace
        self.reason = reason
        super().__init__(f"Invalid namespace {namespace!r}: {reason}")


class BrmemCopyConflictError(Exception):
    """Raised when ``copy_entries`` finds existing destination keys and ``overwrite`` is false."""

    def __init__(self, conflicts: tuple[EntryRef, ...]) -> None:
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
    ) -> list[EntryRef]:
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
        overwrite: bool = False,
    ) -> tuple[EntryRef, ...]:
        """Atomically copy the ``namespace`` snapshot from ``from_branch`` to
        ``to_branch``.

        This is a snapshot-level operation: the destination snapshot ref is
        pointed at the **same commit SHA** as the source snapshot — no new
        blob, tree, or commit is created. When ``overwrite`` is ``False`` and
        the destination snapshot already exists, raises
        :class:`BrmemCopyConflictError` before mutating any ref. When
        ``overwrite`` is ``True``, the destination snapshot is **replaced
        entirely** (any keys that existed only on the destination are dropped,
        since the snapshot ref is reassigned). Returns the destination
        :class:`EntryRef`\\s in sorted key order.
        """


# -- ref helpers --------------------------------------------------------------


def ref_name_for_entry(namespace: str | None, key: str, branch: str) -> str:
    """Return the ``git show`` locator for the entry ``(namespace, key, branch)``.

    The locator has the form ``<snapshot-ref>:<key>`` where ``<snapshot-ref>``
    is ``refs/brmem/base/<encoded-branch>`` when ``namespace`` is ``None`` and
    ``refs/brmem/ns/<namespace>/<encoded-branch>`` otherwise. The result is
    not a real git ref — it is a copy-pastable argument for ``git show``.
    """
    validate_key(key)
    validate_branch_name(branch)
    encoded_branch = encode_branch_segment(branch)
    if namespace is None:
        return f"{BRMEM_REF_PREFIX}/{BRMEM_BASE_SEGMENT}/{encoded_branch}:{key}"
    validate_namespace(namespace)
    return f"{BRMEM_REF_PREFIX}/{BRMEM_NS_SEGMENT}/{namespace}/{encoded_branch}:{key}"


def parse_entry_ref(locator: str) -> EntryRef | None:
    """Parse a snapshot locator into an ``EntryRef`` or return ``None`` if malformed.

    Accepts the ``git show`` locator form
    ``refs/brmem/(base|ns/<namespace>)/<encoded-branch>:<key>``.
    """
    if not locator.startswith(f"{BRMEM_REF_PREFIX}/"):
        return None
    snapshot_ref, sep, key = locator.partition(":")
    if not sep or not key:
        return None

    remainder = snapshot_ref[len(BRMEM_REF_PREFIX) + 1 :]
    head, _, tail = remainder.partition("/")
    if not tail:
        return None

    if head == BRMEM_BASE_SEGMENT:
        if "/" in tail:
            return None
        encoded_branch = tail
        if not encoded_branch:
            return None
        return EntryRef(
            namespace=None,
            key=key,
            branch=decode_branch_segment(encoded_branch),
            ref_name=locator,
        )

    if head == BRMEM_NS_SEGMENT:
        namespace, _, encoded_branch = tail.partition("/")
        if not namespace or not encoded_branch or "/" in encoded_branch:
            return None
        return EntryRef(
            namespace=namespace,
            key=key,
            branch=decode_branch_segment(encoded_branch),
            ref_name=locator,
        )

    return None


# -- branch-segment encoding --------------------------------------------------


def encode_branch_segment(branch: str) -> str:
    """Encode a branch name into a single ref segment by replacing ``/`` with ``---``."""
    return branch.replace("/", _FLAT_SEPARATOR)


def decode_branch_segment(encoded: str) -> str:
    """Reverse of :func:`encode_branch_segment`."""
    return encoded.replace(_FLAT_SEPARATOR, "/")


# -- branch name --------------------------------------------------------------


def check_branch_name(branch: str) -> str | None:
    """Return a formatted error message for ``branch`` without raising, or ``None``."""
    reason = _branch_name_reason(branch)
    if reason is None:
        return None
    return f"Invalid branch name {branch!r}: {reason}"


def validate_branch_name(branch: str) -> None:
    """Reject branch names that collide with the flat ``/ -> ---`` encoding."""
    reason = _branch_name_reason(branch)
    if reason is not None:
        raise InvalidBranchNameError(branch, reason)


def _branch_name_reason(branch: str) -> str | None:
    if not branch:
        return "branch name must not be empty"
    if _FLAT_SEPARATOR in branch:
        return "branch names containing '---' cannot be encoded into refs/brmem"
    return None


# -- namespace ---------------------------------------------------------------


def validate_namespace(namespace: str) -> None:
    reason = _namespace_reason(namespace)
    if reason is not None:
        raise InvalidNamespaceError(namespace, reason)


def check_namespace(namespace: str) -> str | None:
    reason = _namespace_reason(namespace)
    if reason is None:
        return None
    return f"Invalid namespace {namespace!r}: {reason}"


def _namespace_reason(namespace: str) -> str | None:
    if not namespace:
        return "namespace must not be empty"
    if "/" in namespace:
        return "namespace must not contain '/'"
    return None
