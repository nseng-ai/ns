"""Abstract interface and shared validation for branch memory.

The ref layout is ``refs/brmem/<namespace>/<encoded-branch>/<key>``. The key
is the tail of the ref and keeps its native ``/`` characters; only the branch
is encoded (``/`` → ``---``) so it fits in a single ref segment. Each entry
ref holds a commit whose tree has a single ``content`` blob. An entry exists
iff its ref exists — ``put`` is the only creation path.
"""

from __future__ import annotations

import re
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
    its ref ``refs/brmem/<namespace>/<encoded-branch>/<key>`` exists. Each
    ref stores exactly one blob.
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
    return f"{BRMEM_REF_PREFIX}/{namespace}/{encode_branch_segment(branch)}/{key}"


def parse_entry_ref(ref_name: str) -> EntryRef | None:
    """Parse a ref name into an ``EntryRef`` or return ``None`` if malformed."""
    if not ref_name.startswith(f"{BRMEM_REF_PREFIX}/"):
        return None
    remainder = ref_name[len(BRMEM_REF_PREFIX) + 1 :]
    parts = remainder.split("/", 2)
    if len(parts) != 3:
        return None
    namespace, encoded_branch, key = parts
    if not namespace or not encoded_branch or not key:
        return None
    if namespace in _BANNED_NAMESPACES:
        return None
    branch = decode_branch_segment(encoded_branch)
    return EntryRef(
        namespace=namespace,
        key=key,
        branch=branch,
        ref_name=ref_name,
    )


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


_KEY_FORBIDDEN_CHARS = frozenset(" ~^?*[\\")
_KEY_SEGMENT_PATTERN = re.compile(r"[^\x00-\x1f\x7f :?*\[\\~^]+")


def _key_reason(key: str) -> str | None:
    # Keys are appended to ``refs/brmem/<namespace>/<encoded-branch>/`` to form
    # the full ref name, so every rule here mirrors a clause in git's
    # ref-format spec. See `git-check-ref-format(1)`
    # (https://git-scm.com/docs/git-check-ref-format) for the authoritative
    # list of what git will accept as a ref component.
    #
    # Specific deny rules come first so each failure mode gets a targeted
    # error message. The final `_KEY_SEGMENT_PATTERN.fullmatch` is a positive
    # allow-list restating the same character restrictions in one regex, and
    # acts as a backstop if a future edit relaxes one of the checks above.

    # `git-check-ref-format`: "They cannot be the empty string" (for a
    # component) — and we additionally disallow the key being empty overall.
    if not key:
        return "key must not be empty"
    # `git-check-ref-format`: refs "cannot end with a slash / nor contain
    # multiple consecutive slashes //". We also forbid a leading '/' so the
    # full ref never contains '//' where the key joins the branch segment.
    if key.startswith("/"):
        return "key must not start with '/'"
    if key.endswith("/"):
        return "key must not end with '/'"
    if "//" in key:
        return "key must not contain '//'"
    # `git-check-ref-format`: refs "cannot have ... colon : anywhere".
    if ":" in key:
        return "':' is not supported in keys"
    # `git-check-ref-format`: refs "cannot have ASCII control characters
    # (i.e. bytes whose values are lower than \040, or \177 DEL), space,
    # tilde ~, caret ^, or colon : anywhere", and "cannot have
    # question-mark ?, asterisk *, or open bracket [ anywhere", and
    # "cannot contain a \".
    for ch in key:
        if ch in _KEY_FORBIDDEN_CHARS:
            return f"key contains forbidden character {ch!r}"
        code = ord(ch)
        if code < 0x20 or code == 0x7F:
            return "key contains a control character"
    segments = key.split("/")
    # `git-check-ref-format`: refs "cannot have two consecutive dots ..
    # anywhere".
    if any(seg == ".." for seg in segments):
        return "key must not contain '..' segment"
    # `git-check-ref-format`: "No slash-separated component can ... end with
    # the sequence .lock."
    if any(seg.endswith(".lock") for seg in segments):
        return "key segment must not end with '.lock'"
    # Final allow-list: every segment must match the positive character
    # class derived from the above deny rules. Redundant with the specific
    # checks today, but documents the intended allowed set in one place and
    # guards against drift if a specific deny rule is ever removed.
    for seg in segments:
        if not _KEY_SEGMENT_PATTERN.fullmatch(seg):
            return f"key segment {seg!r} is not in the allowed character set"
    return None
