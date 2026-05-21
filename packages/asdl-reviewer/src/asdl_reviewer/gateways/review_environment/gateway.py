"""Gateway for the external environment used to run local reviews."""

from __future__ import annotations

from abc import ABC, abstractmethod

from asdl_reviewer.harness.invocation import HarnessReviewRequest
from asdl_reviewer.models import (
    BaseRefUnavailable,
    HarnessDetection,
    LocalDiff,
    ReviewCatalog,
    ReviewerFailure,
    ReviewExecutionResponse,
    ReviewSource,
)


class ReviewEnvironmentGateway(ABC):
    """Load review inputs and execute reviews against the local environment."""

    @abstractmethod
    def load_review_source(self, *, key: str) -> ReviewSource | ReviewerFailure:
        """Return the markdown source for ``key`` or a typed failure."""

    @abstractmethod
    def list_review_keys(self) -> ReviewCatalog | ReviewerFailure:
        """Return all markdown review keys available in the environment."""

    @abstractmethod
    def load_diff(self, *, base_ref: str | None) -> LocalDiff | BaseRefUnavailable:
        """Return the local diff against ``base_ref`` or a typed failure."""

    @abstractmethod
    def list_harnesses(self) -> tuple[HarnessDetection, ...]:
        """Return detection information for all known harnesses."""

    @abstractmethod
    def run_review(
        self,
        request: HarnessReviewRequest,
    ) -> ReviewExecutionResponse | ReviewerFailure:
        """Execute a parsed review request or return a typed failure."""
