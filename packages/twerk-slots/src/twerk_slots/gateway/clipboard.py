"""Abstract gateway for system clipboard writes.

Kept separate from storage/git gateways so the clipboard side effect of
``slot checkout`` can be stubbed in tests.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass(frozen=True)
class ClipboardCopySuccess:
    """The clipboard write succeeded."""


@dataclass(frozen=True)
class ClipboardCopyFailure:
    """The clipboard write failed.

    ``reason`` is a stable machine-readable tag (e.g. ``"backend_missing"``,
    ``"subprocess_error"``) so callers can branch on it. ``detail`` is a
    human-readable description suitable for surfacing in the UI or logs.
    """

    reason: str
    detail: str


ClipboardCopyResult = ClipboardCopySuccess | ClipboardCopyFailure


class ClipboardGateway(ABC):
    """Write text to the system clipboard."""

    @abstractmethod
    def copy(self, text: str) -> ClipboardCopyResult:
        """Copy ``text`` to the clipboard.

        Returns :class:`ClipboardCopySuccess` on success, or a
        :class:`ClipboardCopyFailure` describing why the write failed
        (missing backend on non-macOS hosts, non-zero ``pbcopy`` exit, etc.).
        """
