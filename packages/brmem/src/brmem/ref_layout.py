"""Branch-memory ref layout helpers.

Entries live under one of two Snapshot Ref subtrees::

    refs/brmem/base/<encoded-branch>                   # Base Namespace
    refs/brmem/ns/<namespace>/<encoded-branch>         # workflow-owned Namespace

Each ``(namespace, branch)`` pair maps to one Snapshot Ref whose commit tree
holds every entry as a blob at path ``<key>``. Keys keep their native ``/``
characters; only the branch is encoded (``/`` -> ``---``) so it fits in one
ref segment. An Entry Locator is ``<snapshot-ref>:<key>`` and is suitable for
``git show`` but is not itself a real Git ref.
"""

from __future__ import annotations

from dataclasses import dataclass

from brmem.key_validation import validate_key

BRMEM_REF_PREFIX = "refs/brmem"
BRMEM_BASE_SEGMENT = "base"
BRMEM_NS_SEGMENT = "ns"
_FLAT_SEPARATOR = "---"


@dataclass(frozen=True)
class EntryRef:
    """Identifies a single branch-memory entry within its Snapshot.

    ``namespace`` is ``None`` for Base Namespace entries. ``ref_name`` is the
    legacy dataclass field name for the Entry Locator: a copy-pastable
    ``git show`` locator of the form ``<snapshot-ref>:<key>`` — not a real Git
    ref. All Entries in the same ``(namespace, branch)`` Snapshot share the
    same ``<snapshot-ref>`` prefix.
    """

    namespace: str | None
    key: str
    branch: str
    ref_name: str

    @property
    def entry_locator(self) -> str:
        """Return the Entry Locator carried by the legacy ``ref_name`` field."""
        return self.ref_name


@dataclass(frozen=True)
class SnapshotRef:
    """Parsed branch-memory Snapshot Ref."""

    namespace: str | None
    branch: str
    ref_name: str


class InvalidBranchNameError(ValueError):
    """Raised when a branch name cannot be encoded safely into a Snapshot Ref."""

    def __init__(self, branch: str, reason: str) -> None:
        self.branch = branch
        self.reason = reason
        super().__init__(f"Invalid branch name {branch!r}: {reason}")


class InvalidNamespaceError(ValueError):
    """Raised when a namespace cannot be used in a Snapshot Ref."""

    def __init__(self, namespace: str, reason: str) -> None:
        self.namespace = namespace
        self.reason = reason
        super().__init__(f"Invalid namespace {namespace!r}: {reason}")


def snapshot_ref_prefixes() -> tuple[str, str]:
    """Return real git ref prefixes that may contain branch-memory snapshots."""
    return (
        f"{BRMEM_REF_PREFIX}/{BRMEM_BASE_SEGMENT}/",
        f"{BRMEM_REF_PREFIX}/{BRMEM_NS_SEGMENT}/",
    )


def snapshot_ref_name(namespace: str | None, branch: str) -> str:
    """Return the snapshot ref for ``(namespace, branch)`` (no ``:key`` suffix).

    Unlike :func:`ref_name_for_entry`, this is a real git ref usable with
    ``git log``, ``git show <ref>``, etc. — useful when callers need to inspect
    commit metadata of the snapshot itself rather than read a specific key.
    """
    validate_branch_name(branch)
    encoded_branch = encode_branch_segment(branch)
    if namespace is None:
        return f"{BRMEM_REF_PREFIX}/{BRMEM_BASE_SEGMENT}/{encoded_branch}"
    validate_namespace(namespace)
    return f"{BRMEM_REF_PREFIX}/{BRMEM_NS_SEGMENT}/{namespace}/{encoded_branch}"


def ref_name_for_entry(namespace: str | None, key: str, branch: str) -> str:
    """Return the Entry Locator for ``(namespace, key, branch)``.

    The locator has the form ``<snapshot-ref>:<key>`` where ``<snapshot-ref>``
    is ``refs/brmem/base/<encoded-branch>`` when ``namespace`` is ``None`` and
    ``refs/brmem/ns/<namespace>/<encoded-branch>`` otherwise. The result is
    not a real Git ref — it is a copy-pastable argument for ``git show``.
    """
    validate_key(key)
    return f"{snapshot_ref_name(namespace, branch)}:{key}"


def parse_snapshot_ref(ref: str) -> SnapshotRef | None:
    """Parse a snapshot ref into a :class:`SnapshotRef`, or return ``None``.

    Accepts ``refs/brmem/base/<encoded-branch>`` and
    ``refs/brmem/ns/<namespace>/<encoded-branch>``. Malformed refs return
    ``None`` so callers that enumerate git refs can skip unknown legacy or
    corrupt names silently.
    """
    if not ref.startswith(f"{BRMEM_REF_PREFIX}/"):
        return None

    remainder = ref[len(BRMEM_REF_PREFIX) + 1 :]
    head, _, tail = remainder.partition("/")
    if not tail:
        return None

    if head == BRMEM_BASE_SEGMENT:
        if "/" in tail or not tail:
            return None
        return SnapshotRef(
            namespace=None,
            branch=decode_branch_segment(tail),
            ref_name=ref,
        )

    if head == BRMEM_NS_SEGMENT:
        namespace, _, encoded_branch = tail.partition("/")
        if not namespace or not encoded_branch or "/" in encoded_branch:
            return None
        return SnapshotRef(
            namespace=namespace,
            branch=decode_branch_segment(encoded_branch),
            ref_name=ref,
        )

    return None


def parse_entry_ref(locator: str) -> EntryRef | None:
    """Parse an Entry Locator into an ``EntryRef`` or return ``None`` if malformed.

    Accepts the ``git show`` locator form
    ``refs/brmem/(base|ns/<namespace>)/<encoded-branch>:<key>``.
    """
    snapshot_ref, sep, key = locator.partition(":")
    if not sep or not key:
        return None

    parsed = parse_snapshot_ref(snapshot_ref)
    if parsed is None:
        return None

    return EntryRef(
        namespace=parsed.namespace,
        key=key,
        branch=parsed.branch,
        ref_name=locator,
    )


def encode_branch_segment(branch: str) -> str:
    """Encode a branch name into a single ref segment by replacing ``/`` with ``---``."""
    return branch.replace("/", _FLAT_SEPARATOR)


def decode_branch_segment(encoded: str) -> str:
    """Reverse of :func:`encode_branch_segment`."""
    return encoded.replace(_FLAT_SEPARATOR, "/")


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


def check_namespace(namespace: str) -> str | None:
    """Return a formatted error message for ``namespace`` without raising, or ``None``."""
    reason = _namespace_reason(namespace)
    if reason is None:
        return None
    return f"Invalid namespace {namespace!r}: {reason}"


def validate_namespace(namespace: str) -> None:
    """Reject namespaces that cannot occupy one ref segment."""
    reason = _namespace_reason(namespace)
    if reason is not None:
        raise InvalidNamespaceError(namespace, reason)


def _branch_name_reason(branch: str) -> str | None:
    if not branch:
        return "branch name must not be empty"
    if _FLAT_SEPARATOR in branch:
        return "branch names containing '---' cannot be encoded into refs/brmem"
    return None


def _namespace_reason(namespace: str) -> str | None:
    if not namespace:
        return "namespace must not be empty"
    if "/" in namespace:
        return "namespace must not contain '/'"
    return None
