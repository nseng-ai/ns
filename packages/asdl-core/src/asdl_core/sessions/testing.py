"""Test utilities for session sources."""

from __future__ import annotations

from asdl_core.sessions.source import SessionSource
from asdl_core.sessions.types import (
    ParsedSession,
    SessionQuery,
    SessionQueryResult,
    SessionSourceInfo,
    SessionWarning,
)


class FakeSessionSource(SessionSource):
    """In-memory fake session source."""

    def __init__(
        self,
        *,
        source_info: SessionSourceInfo | None = None,
        sessions: tuple[ParsedSession, ...] = (),
        warnings: tuple[SessionWarning, ...] = (),
    ) -> None:
        self._source_info = source_info or SessionSourceInfo(
            harness="fake",
            adapter_name="fake",
            record_format="memory",
        )
        self._sessions = sessions
        self._warnings = warnings
        self._queries: list[SessionQuery] = []

    @property
    def source_info(self) -> SessionSourceInfo:
        return self._source_info

    def query(self, query: SessionQuery) -> SessionQueryResult:
        self._queries.append(query)
        return SessionQueryResult(
            source_info=self._source_info,
            sessions=self._sessions,
            warnings=self._warnings,
        )

    @property
    def queries(self) -> tuple[SessionQuery, ...]:
        return tuple(self._queries)
