"""Key validation for branch-memory entries.

Keys become path components inside the snapshot commit's tree (e.g.
``foo/body.md``). They are also serialized after a ``:`` into the
``<snapshot-ref>:<key>`` locator returned by the ref-layout helper, so
the validation here keeps keys both git-path-safe and locator-safe.
Restrictions mirror ``git-check-ref-format(1)``
(https://git-scm.com/docs/git-check-ref-format) where applicable so any key
also behaves well when used as a pathspec.
"""

from __future__ import annotations

import functools
import re

_KEY_FORBIDDEN_CHARS = frozenset(" ~^?*[\\")


@functools.cache
def _get_key_segment_pattern() -> re.Pattern[str]:
    return re.compile(r"[^\x00-\x1f\x7f :?*\[\\~^]+")


class InvalidKeyError(ValueError):
    """Raised when a key cannot be used in an entry ref."""

    def __init__(self, key: str, reason: str) -> None:
        self.key = key
        self.reason = reason
        super().__init__(f"Invalid key {key!r}: {reason}")


def validate_key(key: str) -> None:
    reason = _key_reason(key)
    if reason is not None:
        raise InvalidKeyError(key, reason)


def check_key(key: str) -> str | None:
    reason = _key_reason(key)
    if reason is None:
        return None
    return f"Invalid key {key!r}: {reason}"


def _key_reason(key: str) -> str | None:
    # Specific deny rules come first so each failure mode gets a targeted
    # error message. The final ``_KEY_SEGMENT_PATTERN.fullmatch`` is a
    # positive allow-list restating the same character restrictions in one
    # regex, and acts as a backstop if a future edit relaxes one of the
    # checks above.

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
        if not _get_key_segment_pattern().fullmatch(seg):
            return f"key segment {seg!r} is not in the allowed character set"
    return None
