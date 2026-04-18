"""In-memory fake for the review-execution gateway."""

from __future__ import annotations

from twerk_reviewer.gateways.review_execution.gateway import (
    ReviewExecutionFailure,
    ReviewExecutionGateway,
)
from twerk_reviewer.models import ReviewExecutionRequest, ReviewExecutionResponse


class FakeReviewExecutionGateway(ReviewExecutionGateway):
    """Return configured review findings without invoking a subprocess."""

    def __init__(
        self,
        *,
        responses_by_review_name: (
            dict[str, ReviewExecutionResponse | ReviewExecutionFailure] | None
        ) = None,
        default_response: ReviewExecutionResponse | ReviewExecutionFailure | None = None,
    ) -> None:
        self._responses_by_review_name = dict(responses_by_review_name or {})
        self._default_response = default_response or ReviewExecutionResponse(findings=())
        self._executed_requests: list[ReviewExecutionRequest] = []

    def run_review(
        self,
        request: ReviewExecutionRequest,
    ) -> ReviewExecutionResponse | ReviewExecutionFailure:
        self._executed_requests.append(request)
        if request.review_name in self._responses_by_review_name:
            return self._responses_by_review_name[request.review_name]
        return self._default_response

    @property
    def executed_requests(self) -> tuple[ReviewExecutionRequest, ...]:
        """Return the requests executed during the test."""
        return tuple(self._executed_requests)
