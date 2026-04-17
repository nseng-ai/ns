"""Real review-definition gateway backed by filesystem reads."""

from __future__ import annotations

from pathlib import Path

from twerk_reviewer.gateways.review_definition.gateway import ReviewDefinitionGateway
from twerk_reviewer.models import ReviewerFailure


class RealReviewDefinitionGateway(ReviewDefinitionGateway):
    """Read markdown review definitions from disk."""

    def load_source(self, path: Path) -> str | ReviewerFailure:
        if not path.exists():
            return ReviewerFailure(
                error_type="review_definition_not_found",
                message=f"Review definition does not exist: {path}",
            )
        if not path.is_file():
            return ReviewerFailure(
                error_type="review_definition_not_a_file",
                message=f"Review definition is not a file: {path}",
            )

        try:
            return path.read_text(encoding="utf-8")
        except OSError as exc:
            return ReviewerFailure(
                error_type="review_definition_read_failed",
                message=f"Unable to read review definition {path}: {exc}",
            )
