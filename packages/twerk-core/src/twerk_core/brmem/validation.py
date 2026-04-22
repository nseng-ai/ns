"""Request-validation aggregation helper for branch-memory CLI commands."""

from __future__ import annotations


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
