"""In-memory FakeClipboardGateway used by slots tests."""

from __future__ import annotations

from twerk_slots.gateway.clipboard import ClipboardGateway


class FakeClipboardGateway(ClipboardGateway):
    """ClipboardGateway that records the last copied text.

    Set ``should_succeed=False`` to simulate a missing or failing
    ``pbcopy`` backend.
    """

    def __init__(self, *, should_succeed: bool = True) -> None:
        self._should_succeed = should_succeed
        self.last_copied: str | None = None
        self.copy_calls: int = 0

    def copy(self, text: str) -> bool:
        self.copy_calls += 1
        if not self._should_succeed:
            return False
        self.last_copied = text
        return True
