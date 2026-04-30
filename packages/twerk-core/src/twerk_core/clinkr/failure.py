from __future__ import annotations


class ClinkrFailure(Exception):
    """Raise inside a `@clinkr_operation` body to signal an unrecoverable failure.

    The dispatcher catches `ClinkrFailure` at the CLI boundary and converts it
    into a `ClinkrExit.failure(...)` envelope (exit code 2). Operation and
    helper code should raise this rather than constructing `ClinkrExit` for
    failure paths; only the dispatcher and the `ok` / `negative` return paths
    should build `ClinkrExit` directly.

    Use `ClinkrExit.ensure(...)` / `ClinkrExit.ensure_not_none(...)` for
    precondition guards instead of raising this directly when convenient — the
    helpers live on `ClinkrExit` so a single import covers both the return
    contract and the failure path.
    """

    def __init__(self, *, error_type: str, message: str) -> None:
        super().__init__(message)
        self.error_type = error_type
        self.message = message
