"""Session source interface."""

from __future__ import annotations

from abc import ABC, abstractmethod

from asdl_core.sessions.types import SessionQuery, SessionQueryResult, SessionSourceInfo


class SessionSource(ABC):
    """Readable source of harness session facts."""

    @property
    @abstractmethod
    def source_info(self) -> SessionSourceInfo:
        """Return adapter identity without filesystem or subprocess work."""

    @abstractmethod
    def query(self, query: SessionQuery) -> SessionQueryResult:
        """Return sessions and non-fatal warnings for the query."""
