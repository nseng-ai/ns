"""Pure classification functions for PR review feedback.

Applies deterministic rules to classify PR feedback before LLM processing:
- Bot detection ([bot] suffix or known non-suffix bots)
- Mechanical classification (APPROVED -> informational, CHANGES_REQUESTED -> actionable)
- Restructuring detection (renamed/moved files -> pre-existing candidates)
- Known informational patterns (Graphite, CI bots)
"""

from dataclasses import dataclass
from typing import Literal, assert_never

from twerk_core.gh.types import (
    IssueComment,
    PRReview,
    PRReviewThread,
    RestructuredFile,
)

_PREVIEW_LENGTH = 200

# Bots that don't follow the GitHub `[bot]` suffix convention.
_NON_SUFFIX_BOTS: frozenset[str] = frozenset(
    {
        "Graphite Automations",
    }
)

# Authors whose discussion comments are always informational (Graphite stack info).
_GRAPHITE_INFORMATIONAL_AUTHORS: frozenset[str] = frozenset(
    {
        "Graphite Automations",
        "graphite-app[bot]",
    }
)

_GITHUB_ACTIONS_BOT = "github-actions[bot]"

# Body markers that mean a github-actions[bot] comment is a CI status update.
_CI_BOT_BODY_MARKERS: frozenset[str] = frozenset(
    {
        "CI checks",
        "workflow",
        "Test results",
        "Build status",
    }
)


# -- Classification output types --


@dataclass(frozen=True)
class ClassifiedReview:
    """A PR-level review submission with mechanical classification."""

    id: str
    author: str
    state: str
    body_preview: str
    classification: Literal["actionable", "needs_llm"]
    is_bot: bool


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


@dataclass(frozen=True)
class ClassifiedDiscussionComment:
    """A discussion comment with mechanical classification."""

    comment_id: int
    author: str
    body_preview: str
    classification: Literal["informational", "needs_llm"]
    is_bot: bool


@dataclass(frozen=True)
class ClassificationResult:
    """Complete classification result (pure data, no PR metadata)."""

    review_submissions: tuple[ClassifiedReview, ...]
    review_threads: tuple[ClassifiedThread, ...]
    discussion_comments: tuple[ClassifiedDiscussionComment, ...]
    restructured_files: tuple[RestructuredFile, ...]
    mechanical_informational_count: int


# -- Pure helper functions --


def is_bot(author: str) -> bool:
    """Check if author is a bot (by [bot] suffix or known non-suffix bot name)."""
    return author.endswith("[bot]") or author in _NON_SUFFIX_BOTS


def is_known_informational_discussion(author: str, body: str) -> bool:
    """Check if discussion comment is known informational (CI/Graphite bots).

    Patterns:
    - Graphite stack comments (Graphite Automations, graphite-app[bot])
    - CI status updates (github-actions[bot])
    """
    if author in _GRAPHITE_INFORMATIONAL_AUTHORS:
        return True

    if author == _GITHUB_ACTIONS_BOT:
        return any(marker in body for marker in _CI_BOT_BODY_MARKERS)

    return False


def parse_name_status_output(output: str) -> tuple[RestructuredFile, ...]:
    """Parse git diff --name-status output into RestructuredFile records.

    Only returns R (rename) and C (copy) entries. Splits status codes like
    "R100" into status="R" and similarity=100. Malformed lines are skipped.
    """
    if not output.strip():
        return ()

    restructured: list[RestructuredFile] = []
    for line in output.strip().split("\n"):
        parts = line.split("\t")
        if len(parts) != 3:
            continue

        status_code = parts[0]
        if status_code[:1] not in ("R", "C"):
            continue

        similarity_str = status_code[1:]
        if not similarity_str.isdigit():
            continue

        restructured.append(
            RestructuredFile(
                status=status_code[0],
                old_path=parts[1],
                new_path=parts[2],
                similarity=int(similarity_str),
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
        body_preview = review.body[:_PREVIEW_LENGTH]

        if review.state == "APPROVED":
            mechanical_informational_count += 1
        elif review.state == "CHANGES_REQUESTED":
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
        elif review.state == "COMMENTED":
            if not review.body:
                mechanical_informational_count += 1
            else:
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
        else:
            assert_never(review.state)

    # Classify review threads
    restructured_paths = {f.new_path for f in restructured_files}
    for thread in threads:
        if not thread.comments:
            continue

        first_comment = thread.comments[0]
        bot = is_bot(first_comment.author)
        pre_existing_candidate = bot and thread.path in restructured_paths

        classified_threads.append(
            ClassifiedThread(
                thread_id=thread.id,
                path=thread.path,
                line=thread.line,
                is_outdated=thread.is_outdated,
                author=first_comment.author,
                comment_preview=first_comment.body[:_PREVIEW_LENGTH],
                is_bot=bot,
                pre_existing_candidate=pre_existing_candidate,
            )
        )

    # Classify discussion comments
    for comment in comments:
        bot = is_bot(comment.author)
        body_preview = comment.body[:_PREVIEW_LENGTH]

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
