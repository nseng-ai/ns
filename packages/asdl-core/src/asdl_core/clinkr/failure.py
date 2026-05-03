from __future__ import annotations


class ClinkrFailure(Exception):
    """Raise inside a `@clinkr_operation` body to signal an unrecoverable failure.

    The dispatcher catches `ClinkrFailure` at the CLI boundary and converts it
    into a `ClinkrExit.failure(...)` envelope (exit code 2). Operation and
    helper code should raise this rather than constructing `ClinkrExit` for
    failure paths; only the dispatcher and the `ok` / `negative` return paths
    should build `ClinkrExit` directly.

    Use `Ensure.true(...)` / `Ensure.truthy(...)` / `Ensure.not_none(...)` /
    `Ensure.inst(...)` / `Ensure.ideal_state(...)` for precondition guards
    instead of raising this directly when convenient — every helper raises
    `ClinkrFailure` under the hood.
    """

    def __init__(self, *, error_type: str, message: str) -> None:
        super().__init__(message)
        self.error_type = error_type
        self.message = message
