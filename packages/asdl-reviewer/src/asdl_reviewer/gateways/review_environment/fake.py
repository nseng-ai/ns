"""In-memory fake for the review-environment gateway."""

from __future__ import annotations

from pathlib import Path

from asdl_reviewer.gateways.review_environment.gateway import ReviewEnvironmentGateway
from asdl_reviewer.models import (
    BaseRefUnavailable,
    FindingsReview,
    HarnessDetection,
    LocalDiff,
    ReviewCatalog,
    ReviewDefinitionNotFound,
    ReviewerFailure,
    ReviewExecutionRequest,
    ReviewExecutionResponse,
    ReviewSource,
)


class FakeReviewEnvironmentGateway(ReviewEnvironmentGateway):
    """Return configured review-environment state without I/O."""

    def __init__(
        self,
        *,
        review_sources_by_key: dict[str, str] | None = None,
        review_source_failures_by_key: dict[str, ReviewerFailure] | None = None,
        review_keys: tuple[str, ...] | None = None,
        list_review_keys_failure: ReviewerFailure | None = None,
        diffs_by_base_ref: dict[str | None, LocalDiff | BaseRefUnavailable] | None = None,
        default_diff: LocalDiff | BaseRefUnavailable | None = None,
        paths_by_binary: dict[str, str] | None = None,
        responses_by_review_name: dict[str, ReviewExecutionResponse | ReviewerFailure]
        | None = None,
        default_response: ReviewExecutionResponse | ReviewerFailure | None = None,
        reviews_dir: Path = Path("/repo/reviews"),
    ) -> None:
        self._review_sources_by_key = dict(review_sources_by_key or {})
        self._review_source_failures_by_key = dict(review_source_failures_by_key or {})
        self._review_keys = review_keys
        self._list_review_keys_failure = list_review_keys_failure
        self._diffs_by_base_ref = dict(diffs_by_base_ref or {})
        self._default_diff = default_diff or LocalDiff(base_ref="main", diff_text="")
        self._paths_by_binary = dict(paths_by_binary or {})
        self._responses_by_review_name = dict(responses_by_review_name or {})
        self._default_response = default_response or ReviewExecutionResponse(
            payload=FindingsReview(findings=())
        )
        self._reviews_dir = reviews_dir
        self._requested_review_keys: list[str] = []
        self._requested_base_refs: list[str | None] = []
        self._detect_calls: list[tuple[str, str]] = []
        self._executed_requests: list[ReviewExecutionRequest] = []

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

    def load_diff(self, *, base_ref: str | None) -> LocalDiff | BaseRefUnavailable:
        self._requested_base_refs.append(base_ref)
        if base_ref in self._diffs_by_base_ref:
            return self._diffs_by_base_ref[base_ref]
        return self._default_diff

    def detect_harness(self, *, name: str, binary: str) -> HarnessDetection:
        self._detect_calls.append((name, binary))
        return HarnessDetection(
            name=name,
            binary=binary,
            path=self._paths_by_binary.get(binary),
        )

    def run_review(
        self,
        request: ReviewExecutionRequest,
    ) -> ReviewExecutionResponse | ReviewerFailure:
        self._executed_requests.append(request)
        if request.review_name in self._responses_by_review_name:
            return self._responses_by_review_name[request.review_name]
        return self._default_response

    @property
    def requested_review_keys(self) -> tuple[str, ...]:
        """Return the review keys requested during the test."""
        return tuple(self._requested_review_keys)

    @property
    def requested_base_refs(self) -> tuple[str | None, ...]:
        """Return the base refs requested during the test."""
        return tuple(self._requested_base_refs)

    @property
    def detect_calls(self) -> tuple[tuple[str, str], ...]:
        """Return harness detection calls made during the test."""
        return tuple(self._detect_calls)

    @property
    def executed_requests(self) -> tuple[ReviewExecutionRequest, ...]:
        """Return review execution requests made during the test."""
        return tuple(self._executed_requests)
