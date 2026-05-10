"""Request-validation aggregation helper for Branch Memory CLI commands."""

from __future__ import annotations


class InvalidKeyGlobError(ValueError):
    """Raised when a ``--key-glob`` pattern cannot be used to filter Entries."""

    def __init__(self, key_glob: str, reason: str) -> None:
        self.key_glob = key_glob
        self.reason = reason
        super().__init__(f"Invalid Entry Key glob {key_glob!r}: {reason}")


def validate_key_glob(key_glob: str) -> None:
    """Raise :class:`InvalidKeyGlobError` if ``key_glob`` cannot be used safely."""
    reason = _key_glob_reason(key_glob)
    if reason is not None:
        raise InvalidKeyGlobError(key_glob, reason)


def check_key_glob(key_glob: str) -> str | None:
    """Return a formatted error message for ``key_glob`` without raising, or ``None``."""
    reason = _key_glob_reason(key_glob)
    if reason is None:
        return None
    return f"Invalid Entry Key glob {key_glob!r}: {reason}"


def _key_glob_reason(key_glob: str) -> str | None:
    # Globs are Python ``fnmatch`` patterns matched against Entry Keys. Entry
    # Keys are already restricted (see ``key_validation.py``), so the glob only needs
    # to reject bytes that would corrupt the locator or the CLI layer. Glob
    # metacharacters ``*``, ``?``, ``[``, ``]`` must remain legal.
    if not key_glob:
        return "Entry Key glob must not be empty"
    for ch in key_glob:
        if ch == "\x00":
            return "Entry Key glob must not contain NUL"
        if ch in ("\n", "\r"):
            return "Entry Key glob must not contain newline"
    return None


def first_failure(
    *checks: tuple[str, str | None],
) -> tuple[str, str] | None:
    """Return ``(error_type, message)`` for the first or aggregated failure, or ``None``.

    Each ``check`` is an ``(error_type, message_or_none)`` pair where a non-``None``
    message denotes a validation failure. When a single check fails, its
    ``(error_type, message)`` is returned unchanged. When multiple checks fail,
    the failures are collapsed into a single ``("invalid_request", <joined>)``
    pair whose message enumerates every individual failure.
    """
    failures = [(error_type, message) for error_type, message in checks if message is not None]
    if not failures:
        return None
    if len(failures) == 1:
        return failures[0]
    return (
        "invalid_request",
        "\n".join(["Invalid brmem request:", *(f"- {message}" for _, message in failures)]),
    )
