"""Test fake for HarnessRuntime that records semantic review requests."""

from __future__ import annotations

from roaster.harness.invocation import (
    HarnessReviewRequest,
    HarnessRuntime,
)
from roaster.models import (
    FindingsReview,
    ReviewExecutionResponse,
    RoasterFailure,
)


class FakeHarnessRuntime(HarnessRuntime):
    """Record semantic review requests and return configured responses."""

    def __init__(
        self,
        *,
        paths_by_binary: dict[str, str] | None = None,
        responses_by_review_name: dict[str, ReviewExecutionResponse | RoasterFailure] | None = None,
        default_response: ReviewExecutionResponse | RoasterFailure | None = None,
    ) -> None:
        paths = dict(paths_by_binary or {})
        super().__init__(binary_locator=lambda binary: paths.get(binary))
        self._responses_by_review_name = dict(responses_by_review_name or {})
        self._default_response = default_response or ReviewExecutionResponse(
            payload=FindingsReview(findings=())
        )
        self._executed_requests: list[HarnessReviewRequest] = []

    def run_review(
        self,
        request: HarnessReviewRequest,
    ) -> ReviewExecutionResponse | RoasterFailure:
        self._executed_requests.append(request)
        review_name = request.review_definition.name
        if review_name in self._responses_by_review_name:
            return self._responses_by_review_name[review_name]
        return self._default_response

    @property
    def executed_requests(self) -> tuple[HarnessReviewRequest, ...]:
        """Return review execution requests made during the test."""
        return tuple(self._executed_requests)
