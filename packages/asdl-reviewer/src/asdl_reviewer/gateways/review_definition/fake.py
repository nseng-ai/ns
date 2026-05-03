"""In-memory fake for the review-definition gateway."""

from __future__ import annotations

from pathlib import Path

from asdl_reviewer.gateways.review_definition.gateway import ReviewDefinitionGateway
from asdl_reviewer.models import (
    ReviewDefinitionNotAFile,
    ReviewDefinitionNotFound,
    ReviewerFailure,
    ReviewKeyInvalid,
)

FakeReviewDefinitionFailure = ReviewDefinitionNotFound | ReviewDefinitionNotAFile


class FakeReviewDefinitionGateway(ReviewDefinitionGateway):
    """Load preconfigured markdown review definitions for tests."""

    def __init__(
        self,
        *,
        sources_by_path: dict[Path, str] | None = None,
        failures_by_path: dict[Path, FakeReviewDefinitionFailure] | None = None,
        keys_by_reviews_dir: dict[Path, tuple[str, ...]] | None = None,
        list_failures: dict[Path, ReviewerFailure] | None = None,
    ) -> None:
        self._sources_by_path = dict(sources_by_path or {})
        self._failures_by_path = dict(failures_by_path or {})
        self._keys_by_reviews_dir = dict(keys_by_reviews_dir or {})
        self._list_failures = dict(list_failures or {})
        self._requested_paths: list[Path] = []

    def load_source(
        self,
        path: Path,
    ) -> str | ReviewDefinitionNotFound | ReviewDefinitionNotAFile:
        self._requested_paths.append(path)
        if path in self._failures_by_path:
            return self._failures_by_path[path]
        if path in self._sources_by_path:
            return self._sources_by_path[path]
        return ReviewDefinitionNotFound(
            path=path,
            message=f"No fake review definition configured for {path}",
        )

    def list_reviews(self, reviews_dir: Path) -> tuple[str, ...] | ReviewerFailure:
        if reviews_dir in self._list_failures:
            return self._list_failures[reviews_dir]
        if reviews_dir in self._keys_by_reviews_dir:
            return self._keys_by_reviews_dir[reviews_dir]
        inferred: list[str] = []
        for path in self._sources_by_path:
            try:
                relative = path.relative_to(reviews_dir)
            except ValueError:
                continue
            if relative.suffix != ".md":
                continue
            inferred.append(relative.with_suffix("").as_posix())
        return tuple(sorted(inferred))

    def resolve_key(self, reviews_dir: Path, key: str) -> Path | ReviewerFailure:
        normalized = key.strip()
        if not normalized:
            return ReviewKeyInvalid(
                message="Review key must not be empty.",
            )
        path = reviews_dir / f"{normalized}.md"
        if path in self._sources_by_path:
            return path
        return ReviewDefinitionNotFound(
            path=path,
            message=f"No review found for key {key!r} at {path}.",
        )

    @property
    def requested_paths(self) -> tuple[Path, ...]:
        """Return the paths requested during the test."""
        return tuple(self._requested_paths)
