"""Pure classification functions for PR review feedback.

Applies deterministic rules to classify PR feedback before LLM processing:
- Bot detection ([bot] suffix)
- Mechanical classification (APPROVED -> informational, CHANGES_REQUESTED -> actionable)
- Restructuring detection (renamed/moved files -> pre-existing candidates)
- Known informational patterns (Graphite, CI bots)
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from twerk_pr_address.types import (
    IssueComment,
    PRReview,
    PRReviewThread,
    RestructuredFile,
)

_PREVIEW_LENGTH = 200


# -- Classification output types --


@dataclass(frozen=True)
class ClassifiedReview:
    """A PR-level review submission with mechanical classification."""

    id: str
    author: str
    state: str
    body_preview: str
    classification: Literal["actionable", "informational", "needs_llm"]
    is_bot: bool

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "author": self.author,
            "state": self.state,
            "body_preview": self.body_preview,
            "classification": self.classification,
            "is_bot": self.is_bot,
        }


@dataclass(frozen=True)
class ClassifiedThread:
    """A review thread with mechanical pre-existing detection."""

    thread_id: str
    path: str
    line: int | None
    is_outdated: bool
    author: str
    comment_preview: str
    is_bot: bool
    pre_existing_candidate: bool

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "thread_id": self.thread_id,
            "path": self.path,
            "line": self.line,
            "is_outdated": self.is_outdated,
            "author": self.author,
            "comment_preview": self.comment_preview,
            "is_bot": self.is_bot,
            "pre_existing_candidate": self.pre_existing_candidate,
        }


@dataclass(frozen=True)
class ClassifiedDiscussionComment:
    """A discussion comment with mechanical classification."""

    comment_id: int
    author: str
    body_preview: str
    classification: Literal["informational", "needs_llm"]
    is_bot: bool

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "comment_id": self.comment_id,
            "author": self.author,
            "body_preview": self.body_preview,
            "classification": self.classification,
            "is_bot": self.is_bot,
        }


@dataclass(frozen=True)
class ClassificationResult:
    """Complete classification result (pure data, no PR metadata)."""

    review_submissions: tuple[ClassifiedReview, ...]
    review_threads: tuple[ClassifiedThread, ...]
    discussion_comments: tuple[ClassifiedDiscussionComment, ...]
    restructured_files: tuple[RestructuredFile, ...]
    mechanical_informational_count: int

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "review_submissions": [r.to_json_dict() for r in self.review_submissions],
            "review_threads": [t.to_json_dict() for t in self.review_threads],
            "discussion_comments": [c.to_json_dict() for c in self.discussion_comments],
            "restructured_files": [
                {
                    "status": f.status,
                    "old_path": f.old_path,
                    "new_path": f.new_path,
                    "similarity": f.similarity,
                }
                for f in self.restructured_files
            ],
            "mechanical_informational_count": self.mechanical_informational_count,
        }


# -- Pure helper functions --


def is_bot(author: str) -> bool:
    """Check if author is a bot by [bot] suffix."""
    return author.endswith("[bot]")


def is_known_informational_discussion(author: str, body: str) -> bool:
    """Check if discussion comment is known informational (CI/Graphite bots).

    Patterns:
    - Graphite stack comments (Graphite Automations, graphite-app)
    - CI status updates (github-actions[bot])
    """
    if author in ("Graphite Automations", "graphite-app[bot]"):
        return True

    if author == "github-actions[bot]":
        ci_patterns = ["CI checks", "workflow", "Test results", "Build status"]
        if any(pattern in body for pattern in ci_patterns):
            return True

    return False


def parse_name_status_output(output: str) -> tuple[RestructuredFile, ...]:
    """Parse git diff --name-status output into RestructuredFile records.

    Only returns R (rename) and C (copy) entries. Splits status codes like
    "R100" into status="R" and similarity=100.
    """
    if not output.strip():
        return ()

    restructured: list[RestructuredFile] = []
    for line in output.strip().split("\n"):
        parts = line.split("\t")
        if len(parts) != 3:
            continue

        status_code = parts[0]
        if not status_code.startswith("R") and not status_code.startswith("C"):
            continue

        status_letter = status_code[0]
        similarity_str = status_code[1:]
        similarity = int(similarity_str) if similarity_str.isdigit() else 100

        restructured.append(
            RestructuredFile(
                status=status_letter,
                old_path=parts[1],
                new_path=parts[2],
                similarity=similarity,
            )
        )

    return tuple(restructured)


# -- Core classification logic --


def classify_impl(
    *,
    reviews: tuple[PRReview, ...],
    threads: tuple[PRReviewThread, ...],
    comments: tuple[IssueComment, ...],
    restructured_files: tuple[RestructuredFile, ...],
) -> ClassificationResult:
    """Core classification logic (pure, deterministic).

    Applies mechanical classification rules:
    - APPROVED reviews -> informational (filtered out)
    - CHANGES_REQUESTED reviews -> actionable
    - COMMENTED reviews with empty body -> informational (filtered out)
    - COMMENTED reviews with body -> needs_llm
    - Bot + restructured path -> pre_existing_candidate
    - Known informational discussion -> informational
    """
    classified_reviews: list[ClassifiedReview] = []
    classified_threads: list[ClassifiedThread] = []
    classified_discussion: list[ClassifiedDiscussionComment] = []
    mechanical_informational_count = 0

    # Classify PR-level reviews
    for review in reviews:
        bot = is_bot(review.author)
        body_preview = review.body[:_PREVIEW_LENGTH] if review.body else ""

        if review.state == "APPROVED":
            mechanical_informational_count += 1
            continue

        if review.state == "CHANGES_REQUESTED":
            classified_reviews.append(
                ClassifiedReview(
                    id=review.id,
                    author=review.author,
                    state=review.state,
                    body_preview=body_preview,
                    classification="actionable",
                    is_bot=bot,
                )
            )
            continue

        if review.state == "COMMENTED" and not review.body:
            mechanical_informational_count += 1
            continue

        if review.state == "COMMENTED":
            classified_reviews.append(
                ClassifiedReview(
                    id=review.id,
                    author=review.author,
                    state=review.state,
                    body_preview=body_preview,
                    classification="needs_llm",
                    is_bot=bot,
                )
            )

    # Classify review threads
    restructured_paths = {f.new_path for f in restructured_files}
    for thread in threads:
        if not thread.comments:
            continue

        first_comment = thread.comments[0]
        bot = is_bot(first_comment.author)
        comment_preview = first_comment.body[:_PREVIEW_LENGTH] if first_comment.body else ""
        pre_existing_candidate = bot and thread.path in restructured_paths

        classified_threads.append(
            ClassifiedThread(
                thread_id=thread.id,
                path=thread.path,
                line=thread.line,
                is_outdated=thread.is_outdated,
                author=first_comment.author,
                comment_preview=comment_preview,
                is_bot=bot,
                pre_existing_candidate=pre_existing_candidate,
            )
        )

    # Classify discussion comments
    for comment in comments:
        bot = is_bot(comment.author)
        body_preview = comment.body[:_PREVIEW_LENGTH] if comment.body else ""

        if is_known_informational_discussion(comment.author, comment.body):
            mechanical_informational_count += 1
            classified_discussion.append(
                ClassifiedDiscussionComment(
                    comment_id=comment.id,
                    author=comment.author,
                    body_preview=body_preview,
                    classification="informational",
                    is_bot=bot,
                )
            )
            continue

        classified_discussion.append(
            ClassifiedDiscussionComment(
                comment_id=comment.id,
                author=comment.author,
                body_preview=body_preview,
                classification="needs_llm",
                is_bot=bot,
            )
        )

    return ClassificationResult(
        review_submissions=tuple(classified_reviews),
        review_threads=tuple(classified_threads),
        discussion_comments=tuple(classified_discussion),
        restructured_files=restructured_files,
        mechanical_informational_count=mechanical_informational_count,
    )
