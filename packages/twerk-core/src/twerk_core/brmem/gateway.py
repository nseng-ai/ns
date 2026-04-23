"""Abstract interface and shared validation for branch memory.

Entries live under one of two ref subtrees::

    refs/brmem/base/<encoded-branch>/<key>             # ad-hoc / unnamespaced
    refs/brmem/ns/<namespace>/<encoded-branch>/<key>   # domain-owned

The key is the tail of the ref and keeps its native ``/`` characters; only the
branch is encoded (``/`` → ``---``) so it fits in a single ref segment. Each
entry ref holds a commit whose tree has a single ``content`` blob. An entry
exists iff its ref exists — ``put`` is the only creation path.

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
BRMEM_CONTENT_PATH = "content"
_FLAT_SEPARATOR = "---"


@dataclass(frozen=True)
class EntryRef:
    """Identifies a single branch-memory entry ref.

    ``namespace`` is ``None`` for base (ad-hoc) entries.
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


class BranchMemoryGateway(ABC):
    """Store small per-branch blobs outside the working tree.

    Entries are keyed by ``(namespace, key, branch)`` where ``namespace`` may
    be ``None`` to store under the ad-hoc base subtree. An entry exists iff
    its ref exists. Each ref stores exactly one blob.
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


# -- ref helpers --------------------------------------------------------------


def ref_name_for_entry(namespace: str | None, key: str, branch: str) -> str:
    """Return the git ref used to store the entry ``(namespace, key, branch)``."""
    validate_key(key)
    validate_branch_name(branch)
    encoded_branch = encode_branch_segment(branch)
    if namespace is None:
        return f"{BRMEM_REF_PREFIX}/{BRMEM_BASE_SEGMENT}/{encoded_branch}/{key}"
    validate_namespace(namespace)
    return f"{BRMEM_REF_PREFIX}/{BRMEM_NS_SEGMENT}/{namespace}/{encoded_branch}/{key}"


def parse_entry_ref(ref_name: str) -> EntryRef | None:
    """Parse a ref name into an ``EntryRef`` or return ``None`` if malformed."""
    if not ref_name.startswith(f"{BRMEM_REF_PREFIX}/"):
        return None
    remainder = ref_name[len(BRMEM_REF_PREFIX) + 1 :]
    head, _, tail = remainder.partition("/")
    if not tail:
        return None

    if head == BRMEM_BASE_SEGMENT:
        encoded_branch, _, key = tail.partition("/")
        if not encoded_branch or not key:
            return None
        return EntryRef(
            namespace=None,
            key=key,
            branch=decode_branch_segment(encoded_branch),
            ref_name=ref_name,
        )

    if head == BRMEM_NS_SEGMENT:
        namespace, _, rest = tail.partition("/")
        if not namespace or not rest:
            return None
        encoded_branch, _, key = rest.partition("/")
        if not encoded_branch or not key:
            return None
        return EntryRef(
            namespace=namespace,
            key=key,
            branch=decode_branch_segment(encoded_branch),
            ref_name=ref_name,
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
