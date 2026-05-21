"""Gateway for the external environment used to run local reviews."""

from __future__ import annotations

from abc import ABC, abstractmethod

from asdl_reviewer.models import (
    BaseRefUnavailable,
    HarnessDetection,
    LocalDiff,
    ReviewCatalog,
    ReviewerFailure,
    ReviewExecutionRequest,
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
    def detect_harness(self, *, name: str, binary: str) -> HarnessDetection:
        """Return whether one harness binary is available on PATH."""

    @abstractmethod
    def run_review(
        self,
        request: ReviewExecutionRequest,
    ) -> ReviewExecutionResponse | ReviewerFailure:
        """Execute a review request or return a typed failure."""
