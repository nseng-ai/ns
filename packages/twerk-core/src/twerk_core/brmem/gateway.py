"""Abstract interface and shared validation for branch memory.

The ref layout is ``refs/brmem/<namespace>/<encoded-key>/<encoded-branch>``.
Each entry ref holds a commit whose tree has a single ``content`` blob. An
entry exists iff its ref exists — ``put`` is the only creation path.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass

BRMEM_REF_PREFIX = "refs/brmem"
BRMEM_CONTENT_PATH = "content"
_FLAT_SEPARATOR = "---"
_BANNED_NAMESPACES = frozenset({"brs"})


@dataclass(frozen=True)
class EntryRef:
    """Identifies a single branch-memory entry ref."""

    namespace: str
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


class InvalidKeyError(ValueError):
    """Raised when a key cannot be used in an entry ref."""

    def __init__(self, key: str, reason: str) -> None:
        self.key = key
        self.reason = reason
        super().__init__(f"Invalid key {key!r}: {reason}")


class BranchMemoryGateway(ABC):
    """Store small per-branch blobs outside the working tree.

    Entries are keyed by ``(namespace, key, branch)``. An entry exists iff
    its ref ``refs/brmem/<namespace>/<encoded-key>/<encoded-branch>`` exists.
    Each ref stores exactly one blob.
    """

    @abstractmethod
    def list_entries(
        self,
        *,
        namespace: str | None = None,
        key: str | None = None,
        branch: str | None = None,
    ) -> list[EntryRef]:
        """Return entries, optionally filtered by namespace/key/branch."""

    @abstractmethod
    def put(
        self,
        namespace: str,
        key: str,
        branch: str,
        content: str,
    ) -> str:
        """Write ``content`` as the single blob of the entry and return the new commit SHA."""

    @abstractmethod
    def get(
        self,
        namespace: str,
        key: str,
        branch: str,
        *,
        at: str | None = None,
    ) -> str | None:
        """Read the entry blob at ``at`` or the entry head when omitted."""

    @abstractmethod
    def check(
        self,
        namespace: str,
        key: str,
        branch: str,
        *,
        at: str | None = None,
    ) -> EntryDiagnostic | None:
        """Return diagnostics for the entry at ``at`` (or head), or ``None``."""


# -- ref helpers --------------------------------------------------------------


def ref_name_for_entry(namespace: str, key: str, branch: str) -> str:
    """Return the git ref used to store the entry ``(namespace, key, branch)``."""
    validate_namespace(namespace)
    validate_key(key)
    validate_branch_name(branch)
    return f"{BRMEM_REF_PREFIX}/{namespace}/{encode_flat_name(key)}/{encode_flat_name(branch)}"


def parse_entry_ref(ref_name: str) -> EntryRef | None:
    """Parse a ref name into an ``EntryRef`` or return ``None`` if malformed."""
    if not ref_name.startswith(f"{BRMEM_REF_PREFIX}/"):
        return None
    remainder = ref_name[len(BRMEM_REF_PREFIX) + 1 :]
    parts = remainder.split("/")
    if len(parts) != 3:
        return None
    namespace, encoded_key, encoded_branch = parts
    if not namespace or not encoded_key or not encoded_branch:
        return None
    if namespace in _BANNED_NAMESPACES:
        return None
    key = decode_flat_name(encoded_key)
    branch = decode_flat_name(encoded_branch)
    return EntryRef(
        namespace=namespace,
        key=key,
        branch=branch,
        ref_name=ref_name,
    )


# -- flat encoding (shared by key and branch) ---------------------------------


def encode_flat_name(name: str) -> str:
    """Encode ``name`` into a flat ref segment by replacing ``/`` with ``---``."""
    return name.replace("/", _FLAT_SEPARATOR)


def decode_flat_name(encoded: str) -> str:
    """Reverse of :func:`encode_flat_name`."""
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


# -- namespace / key ---------------------------------------------------------


def validate_namespace(namespace: str) -> None:
    reason = _namespace_reason(namespace)
    if reason is not None:
        raise InvalidNamespaceError(namespace, reason)


def check_namespace(namespace: str) -> str | None:
    reason = _namespace_reason(namespace)
    if reason is None:
        return None
    return f"Invalid namespace {namespace!r}: {reason}"


def validate_key(key: str) -> None:
    reason = _key_reason(key)
    if reason is not None:
        raise InvalidKeyError(key, reason)


def check_key(key: str) -> str | None:
    reason = _key_reason(key)
    if reason is None:
        return None
    return f"Invalid key {key!r}: {reason}"


def _namespace_reason(namespace: str) -> str | None:
    if not namespace:
        return "namespace must not be empty"
    if "/" in namespace:
        return "namespace must not contain '/'"
    if namespace in _BANNED_NAMESPACES:
        return f"'{namespace}' is a reserved namespace"
    return None


def _key_reason(key: str) -> str | None:
    if not key:
        return "key must not be empty"
    if _FLAT_SEPARATOR in key:
        return "keys containing '---' cannot be encoded into refs/brmem"
    return None
