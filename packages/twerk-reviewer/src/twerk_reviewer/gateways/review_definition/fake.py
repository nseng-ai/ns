"""In-memory fake for the review-definition gateway."""

from __future__ import annotations

from pathlib import Path

from twerk_reviewer.gateways.review_definition.gateway import ReviewDefinitionGateway
from twerk_reviewer.models import ReviewerFailure


class FakeReviewDefinitionGateway(ReviewDefinitionGateway):
    """Load preconfigured markdown review definitions for tests."""

    def __init__(
        self,
        *,
        sources_by_path: dict[Path, str] | None = None,
        failures_by_path: dict[Path, ReviewerFailure] | None = None,
    ) -> None:
        self._sources_by_path = dict(sources_by_path or {})
        self._failures_by_path = dict(failures_by_path or {})
        self._requested_paths: list[Path] = []

    def load_source(self, path: Path) -> str | ReviewerFailure:
        self._requested_paths.append(path)
        if path in self._failures_by_path:
            return self._failures_by_path[path]
        if path in self._sources_by_path:
            return self._sources_by_path[path]
        return ReviewerFailure(
            error_type="review_definition_not_found",
            message=f"No fake review definition configured for {path}",
        )

    @property
    def requested_paths(self) -> tuple[Path, ...]:
        """Return the paths requested during the test."""
        return tuple(self._requested_paths)
