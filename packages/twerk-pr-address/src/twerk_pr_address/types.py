"""Domain types for PR address operations.

Re-exported from twerk_core.gh.types so pr-address consumers don't reach
into twerk_core internals.
"""

from twerk_core.gh.types import (
    IssueComment,
    PRReview,
    PRReviewComment,
    PRReviewThread,
    RestructuredFile,
)

__all__ = [
    "IssueComment",
    "PRReview",
    "PRReviewComment",
    "PRReviewThread",
    "RestructuredFile",
]
