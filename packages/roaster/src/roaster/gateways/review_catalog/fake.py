"""In-memory fake for the review catalog gateway."""

from __future__ import annotations

from pathlib import Path

from roaster.gateways.review_catalog.gateway import ReviewCatalogGateway
from roaster.models import (
    ReviewCatalog,
    ReviewDefinitionNotFound,
    ReviewerFailure,
    ReviewSource,
)


class FakeReviewCatalogGateway(ReviewCatalogGateway):
    """Return configured review-catalog state without I/O."""

    def __init__(
        self,
        *,
        review_sources_by_key: dict[str, str] | None = None,
        review_source_failures_by_key: dict[str, ReviewerFailure] | None = None,
        review_keys: tuple[str, ...] | None = None,
        list_review_keys_failure: ReviewerFailure | None = None,
        reviews_dir: Path = Path("/repo/reviews"),
    ) -> None:
        self._review_sources_by_key = dict(review_sources_by_key or {})
        self._review_source_failures_by_key = dict(review_source_failures_by_key or {})
        self._review_keys = review_keys
        self._list_review_keys_failure = list_review_keys_failure
        self._reviews_dir = reviews_dir
        self._requested_review_keys: list[str] = []

    def load_review_source(self, *, key: str) -> ReviewSource | ReviewerFailure:
        self._requested_review_keys.append(key)
        if key in self._review_source_failures_by_key:
            return self._review_source_failures_by_key[key]
        if key in self._review_sources_by_key:
            return ReviewSource(
                key=key,
                path=self._reviews_dir / f"{key}.md",
                source=self._review_sources_by_key[key],
            )
        path = self._reviews_dir / f"{key}.md"
        return ReviewDefinitionNotFound(
            path=path,
            message=f"No fake review definition configured for key {key!r} at {path}.",
        )

    def list_review_keys(self) -> ReviewCatalog | ReviewerFailure:
        if self._list_review_keys_failure is not None:
            return self._list_review_keys_failure
        if self._review_keys is not None:
            keys = self._review_keys
        else:
            keys = tuple(sorted(self._review_sources_by_key))
        return ReviewCatalog(reviews_dir=self._reviews_dir, keys=keys)

    @property
    def requested_review_keys(self) -> tuple[str, ...]:
        """Return the review keys requested during the test."""
        return tuple(self._requested_review_keys)
