"""Gateway for running a review via a local executor command."""

from __future__ import annotations

from abc import ABC, abstractmethod

from twerk_reviewer.models import (
    ExecutorCommandInvalid,
    ExecutorCommandMissing,
    ReviewExecutionFailed,
    ReviewExecutionInvalidJson,
    ReviewExecutionInvalidResponse,
    ReviewExecutionRequest,
    ReviewExecutionResponse,
)

ReviewExecutionFailure = (
    ExecutorCommandInvalid
    | ExecutorCommandMissing
    | ReviewExecutionFailed
    | ReviewExecutionInvalidJson
    | ReviewExecutionInvalidResponse
)


class ReviewExecutionGateway(ABC):
    """Run a review request and return structured findings."""

    @abstractmethod
    def run_review(
        self,
        request: ReviewExecutionRequest,
    ) -> ReviewExecutionResponse | ReviewExecutionFailure:
        """Return structured review findings or a typed failure.

        Raises:
            ReviewExecutorInvocationError: If the executor subprocess cannot
                be invoked at all (e.g. missing binary, permission denied).
        """
