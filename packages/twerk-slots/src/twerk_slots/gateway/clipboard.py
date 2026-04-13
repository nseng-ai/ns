"""Abstract gateway for system clipboard writes.

Kept separate from storage/git gateways so the clipboard side effect of
``slot checkout`` can be stubbed in tests.
"""

from __future__ import annotations

from abc import ABC, abstractmethod


class ClipboardGateway(ABC):
    """Write text to the system clipboard."""

    @abstractmethod
    def copy(self, text: str) -> bool:
        """Copy ``text`` to the clipboard. Return False if the backend is
        unavailable (e.g., ``pbcopy`` missing on non-macOS hosts) or failed."""
