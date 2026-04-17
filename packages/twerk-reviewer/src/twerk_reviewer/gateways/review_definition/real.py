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

    def list_reviews(self, reviews_dir: Path) -> tuple[str, ...] | ReviewerFailure:
        if not reviews_dir.exists():
            return ReviewerFailure(
                error_type="reviews_dir_missing",
                message=(
                    f"No reviews directory at {reviews_dir}. Create it and add `<key>.md` files."
                ),
            )
        if not reviews_dir.is_dir():
            return ReviewerFailure(
                error_type="reviews_dir_not_a_directory",
                message=f"Reviews path is not a directory: {reviews_dir}",
            )

        keys: list[str] = []
        for md_path in sorted(reviews_dir.rglob("*.md")):
            if not md_path.is_file():
                continue
            relative = md_path.relative_to(reviews_dir)
            key = relative.with_suffix("").as_posix()
            keys.append(key)
        return tuple(keys)

    def resolve_key(self, reviews_dir: Path, key: str) -> Path | ReviewerFailure:
        normalized = key.strip()
        if not normalized:
            return ReviewerFailure(
                error_type="review_key_invalid",
                message="Review key must not be empty.",
            )
        if normalized.startswith("/") or ".." in Path(normalized).parts:
            return ReviewerFailure(
                error_type="review_key_invalid",
                message=f"Review key must be a relative path without `..`: {key!r}",
            )

        path = reviews_dir / f"{normalized}.md"
        try:
            resolved = path.resolve()
            reviews_root = reviews_dir.resolve()
        except OSError as exc:
            return ReviewerFailure(
                error_type="review_key_resolution_failed",
                message=f"Unable to resolve review key {key!r}: {exc}",
            )

        if reviews_root not in resolved.parents and resolved != reviews_root:
            return ReviewerFailure(
                error_type="review_key_invalid",
                message=f"Review key {key!r} resolves outside {reviews_dir}.",
            )

        if not path.exists():
            return ReviewerFailure(
                error_type="review_definition_not_found",
                message=f"No review found for key {key!r} at {path}.",
            )
        return path
