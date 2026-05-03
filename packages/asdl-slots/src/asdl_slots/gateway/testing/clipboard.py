"""In-memory FakeClipboardGateway used by slots tests."""

from __future__ import annotations

from asdl_slots.gateway.clipboard import (
    ClipboardCopyFailure,
    ClipboardCopyResult,
    ClipboardCopySuccess,
    ClipboardGateway,
)

_DEFAULT_FAKE_FAILURE = ClipboardCopyFailure(
    reason="backend_missing",
    detail="Fake clipboard configured to fail.",
)


class FakeClipboardGateway(ClipboardGateway):
    """ClipboardGateway that records the last copied text.

    Set ``should_succeed=False`` to simulate a missing or failing
    ``pbcopy`` backend. Pass ``failure=`` to control which
    :class:`ClipboardCopyFailure` is returned.
    """

    def __init__(
        self,
        *,
        should_succeed: bool = True,
        failure: ClipboardCopyFailure | None = None,
    ) -> None:
        self._should_succeed = should_succeed
        self._failure = failure if failure is not None else _DEFAULT_FAKE_FAILURE
        self.last_copied: str | None = None
        self.copy_calls: int = 0

    def copy(self, text: str) -> ClipboardCopyResult:
        self.copy_calls += 1
        if not self._should_succeed:
            return self._failure
        self.last_copied = text
        return ClipboardCopySuccess()
