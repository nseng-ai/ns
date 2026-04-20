"""LBYL request validation helpers for branch-memory CLI commands."""

from __future__ import annotations

from twerk_core.brmem.gateway import (
    EntryRef,
    check_branch_name,
    check_namespace,
    ref_name_for_entry,
)
from twerk_core.brmem.key_validation import check_key
from twerk_core.clinkr.command import ClinkrCommandError


def validate_entry_ref(namespace: str, key: str, branch: str) -> EntryRef | ClinkrCommandError:
    """Return a validated entry ref or a command error describing invalid inputs."""
    error = _command_error_for_checks(
        ("invalid_namespace", check_namespace(namespace)),
        ("invalid_key", check_key(key)),
        ("invalid_branch_name", check_branch_name(branch)),
    )
    if error is not None:
        return error

    return EntryRef(
        namespace=namespace,
        key=key,
        branch=branch,
        ref_name=ref_name_for_entry(namespace, key, branch),
    )


def validate_entry_filters(
    *,
    namespace: str | None = None,
    key: str | None = None,
    branch: str | None = None,
) -> ClinkrCommandError | None:
    """Validate optional list filters, collecting all failures into one error."""
    return _command_error_for_checks(
        (
            "invalid_namespace",
            None if namespace is None else check_namespace(namespace),
        ),
        ("invalid_key", None if key is None else check_key(key)),
        (
            "invalid_branch_name",
            None if branch is None else check_branch_name(branch),
        ),
    )


def _command_error_for_checks(
    *checks: tuple[str, str | None],
) -> ClinkrCommandError | None:
    failures = [(error_type, message) for error_type, message in checks if message is not None]
    if not failures:
        return None

    if len(failures) == 1:
        error_type, message = failures[0]
        return ClinkrCommandError(error_type=error_type, message=message)

    return ClinkrCommandError(
        error_type="invalid_request",
        message="\n".join(["Invalid brmem request:", *(f"- {message}" for _, message in failures)]),
    )
