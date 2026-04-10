"""Classify PR review feedback mechanically before LLM processing."""

import dataclasses
from dataclasses import dataclass
from typing import Any

from clinkr.command import ClinkrCommandError
from clinkr.operation import clinkr_operation
from twerk_pr_address.classify import ClassificationResult, classify_impl
from twerk_pr_address.cli.pr_address._gateway_access import get_pr_address_gateway


@dataclass(frozen=True)
class ClassifyFeedbackRequest:
    pr_number: int
    base_ref: str
    include_resolved: bool = False


@dataclass(frozen=True)
class ClassifyFeedbackResult:
    pr_number: int
    classification: ClassificationResult

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "pr_number": self.pr_number,
            **dataclasses.asdict(self.classification),
        }


@clinkr_operation(
    name="classify-feedback",
    help="Classify PR review feedback mechanically before LLM processing.",
)
def run_classify_feedback(
    request: ClassifyFeedbackRequest,
) -> ClassifyFeedbackResult | ClinkrCommandError:
    gateway = get_pr_address_gateway()

    reviews = gateway.get_pr_reviews(request.pr_number)
    threads = gateway.get_pr_review_threads(
        request.pr_number, include_resolved=request.include_resolved
    )
    comments = gateway.get_pr_discussion_comments(request.pr_number)
    restructured_files = gateway.get_restructured_files(request.base_ref)

    classification = classify_impl(
        reviews=reviews,
        threads=threads,
        comments=comments,
        restructured_files=restructured_files,
    )

    return ClassifyFeedbackResult(
        pr_number=request.pr_number,
        classification=classification,
    )
