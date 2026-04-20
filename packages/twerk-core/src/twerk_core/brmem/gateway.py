"""Abstract interface and shared validation for branch memory.

The ref layout is ``refs/brmem/<namespace>/<key>/<encoded-branch>``. Each
entry ref holds a tree of artifacts. An entry exists iff its ref exists —
``put_artifact`` is the only creation path, so empty-tree entries are not
representable.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import PurePosixPath

BRMEM_REF_PREFIX = "refs/brmem"
_BRANCH_SEPARATOR = "---"
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
    """Probe data about an entry ref as a whole."""

    head_sha: str
    head_date: str
    artifact_count: int


@dataclass(frozen=True)
class ArtifactDiagnostic:
    """Probe data about a single artifact path inside an entry ref."""

    blob_sha: str
    size_bytes: int
    last_commit_sha: str
    last_commit_date: str


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


class InvalidArtifactPathError(ValueError):
    """Raised when an artifact path is not a safe relative POSIX path."""

    def __init__(self, path: str, reason: str) -> None:
        self.path = path
        self.reason = reason
        super().__init__(f"Invalid artifact path {path!r}: {reason}")


class BranchMemoryGateway(ABC):
    """Store small per-branch files outside the working tree.

    Entries are keyed by ``(namespace, key, branch)``. An entry exists iff
    its ref ``refs/brmem/<namespace>/<key>/<encoded-branch>`` exists.
    """

    # entry-level -----------------------------------------------------------

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
    def check_entry(
        self,
        namespace: str,
        key: str,
        branch: str,
    ) -> EntryDiagnostic | None:
        """Return diagnostics for the entry ref, or ``None`` if it does not exist."""

    # artifact-level --------------------------------------------------------

    @abstractmethod
    def put_artifact(
        self,
        namespace: str,
        key: str,
        branch: str,
        path: str,
        content: str,
    ) -> str:
        """Write ``content`` to ``path`` in the entry and return the new commit SHA."""

    @abstractmethod
    def get_artifact(
        self,
        namespace: str,
        key: str,
        branch: str,
        path: str,
        *,
        at: str | None = None,
    ) -> str | None:
        """Read ``path`` at ``at`` or the entry head when omitted."""

    @abstractmethod
    def list_artifacts(
        self,
        namespace: str,
        key: str,
        branch: str,
        *,
        at: str | None = None,
    ) -> list[str]:
        """Return artifact paths at ``at`` or the entry head when omitted."""

    @abstractmethod
    def check_artifact(
        self,
        namespace: str,
        key: str,
        branch: str,
        path: str,
        *,
        at: str | None = None,
    ) -> ArtifactDiagnostic | None:
        """Return diagnostics for ``path`` at ``at`` (or head), else ``None``."""


# -- ref helpers --------------------------------------------------------------


def ref_name_for_entry(namespace: str, key: str, branch: str) -> str:
    """Return the git ref used to store the entry ``(namespace, key, branch)``."""
    validate_namespace(namespace)
    validate_key(key)
    validate_branch_name(branch)
    return f"{BRMEM_REF_PREFIX}/{namespace}/{key}/{encode_branch_name(branch)}"


def parse_entry_ref(ref_name: str) -> EntryRef | None:
    """Parse a ref name into an ``EntryRef`` or return ``None`` if malformed."""
    if not ref_name.startswith(f"{BRMEM_REF_PREFIX}/"):
        return None
    remainder = ref_name[len(BRMEM_REF_PREFIX) + 1 :]
    parts = remainder.split("/")
    if len(parts) != 3:
        return None
    namespace, key, encoded_branch = parts
    if not namespace or not key or not encoded_branch:
        return None
    if namespace in _BANNED_NAMESPACES:
        return None
    branch = encoded_branch.replace(_BRANCH_SEPARATOR, "/")
    return EntryRef(
        namespace=namespace,
        key=key,
        branch=branch,
        ref_name=ref_name,
    )


# -- branch name --------------------------------------------------------------


def encode_branch_name(branch: str) -> str:
    """Encode a branch name into a flat ref-friendly key."""
    validate_branch_name(branch)
    return branch.replace("/", _BRANCH_SEPARATOR)


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
    if _BRANCH_SEPARATOR in branch:
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
    if "/" in key:
        return "key must not contain '/'"
    return None


# -- artifact path ------------------------------------------------------------


def validate_artifact_path(path: str) -> None:
    """Reject absolute or parent-traversing artifact paths."""
    reason = _artifact_path_reason(path)
    if reason is not None:
        raise InvalidArtifactPathError(path, reason)


def check_artifact_path(path: str) -> str | None:
    """Return a formatted error message for ``path`` without raising, or ``None``."""
    reason = _artifact_path_reason(path)
    if reason is None:
        return None
    return f"Invalid artifact path {path!r}: {reason}"


def _artifact_path_reason(path: str) -> str | None:
    if not path:
        return "path must not be empty"
    if ":" in path:
        return "':' is not supported in artifact paths"

    normalized = PurePosixPath(path)
    if normalized.is_absolute():
        return "path must be relative"

    normalized_text = normalized.as_posix()
    if normalized_text in {".", ""}:
        return "path must reference a location inside the entry"

    if any(part == ".." for part in normalized.parts):
        return "path must not contain '..'"

    return None
