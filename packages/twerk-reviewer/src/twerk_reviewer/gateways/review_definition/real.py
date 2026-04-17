"""Real review-definition gateway backed by filesystem reads."""

from __future__ import annotations

from pathlib import Path

from twerk_reviewer.gateways.review_definition.gateway import ReviewDefinitionGateway
from twerk_reviewer.models import (
    ReviewDefinitionNotAFile,
    ReviewDefinitionNotFound,
    ReviewDefinitionReadError,
)


class RealReviewDefinitionGateway(ReviewDefinitionGateway):
    """Read markdown review definitions from disk."""

    def load_source(
        self,
        path: Path,
    ) -> str | ReviewDefinitionNotFound | ReviewDefinitionNotAFile:
        if not path.exists():
            return ReviewDefinitionNotFound(
                path=path,
                message=f"Review definition does not exist: {path}",
            )
        if not path.is_file():
            return ReviewDefinitionNotAFile(
                path=path,
                message=f"Review definition is not a file: {path}",
            )

        try:
            return path.read_text(encoding="utf-8")
        except OSError as exc:
            raise ReviewDefinitionReadError(
                f"Unable to read review definition {path}: {exc}"
            ) from exc
