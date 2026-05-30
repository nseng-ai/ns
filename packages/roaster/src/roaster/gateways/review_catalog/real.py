"""Real review catalog gateway backed by the filesystem."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from roaster.gateways.review_catalog.gateway import ReviewCatalogGateway
from roaster.git_toplevel import git_toplevel
from roaster.models import (
    ReviewCatalog,
    ReviewDefinitionNotAFile,
    ReviewDefinitionNotFound,
    ReviewDefinitionReadError,
    ReviewerFailure,
    ReviewKeyInvalid,
    ReviewKeyResolutionFailed,
    ReviewsDirMissing,
    ReviewsDirNotADirectory,
    ReviewSource,
)

_REVIEWS_DIRNAME = "reviews"


@dataclass(frozen=True)
class _ResolvedReviewPath:
    key: str
    path: Path


class RealReviewCatalogGateway(ReviewCatalogGateway):
    """Access markdown review definitions on the local filesystem."""

    def __init__(self, cwd: Path) -> None:
        self._cwd = cwd

    def load_review_source(self, *, key: str) -> ReviewSource | ReviewerFailure:
        reviews_dir = self._reviews_dir()
        review_path_result = _resolve_review_path(reviews_dir=reviews_dir, key=key)
        if not isinstance(review_path_result, _ResolvedReviewPath):
            return review_path_result

        path = review_path_result.path
        if not path.is_file():
            return ReviewDefinitionNotAFile(
                path=path,
                message=f"Review definition is not a file: {path}",
            )

        try:
            source = path.read_text(encoding="utf-8")
        except OSError as exc:
            raise ReviewDefinitionReadError(
                f"Unable to read review definition {path}: {exc}"
            ) from exc

        return ReviewSource(key=review_path_result.key, path=path, source=source)

    def list_review_keys(self) -> ReviewCatalog | ReviewerFailure:
        reviews_dir = self._reviews_dir()
        if not reviews_dir.exists():
            return ReviewsDirMissing(
                message=(
                    f"No reviews directory at {reviews_dir}. Create it and add `<key>.md` files."
                ),
            )
        if not reviews_dir.is_dir():
            return ReviewsDirNotADirectory(
                message=f"Reviews path is not a directory: {reviews_dir}",
            )

        keys: list[str] = []
        for md_path in sorted(reviews_dir.rglob("*.md")):
            if not md_path.is_file():
                continue
            relative = md_path.relative_to(reviews_dir)
            keys.append(relative.with_suffix("").as_posix())
        return ReviewCatalog(reviews_dir=reviews_dir, keys=tuple(keys))

    def _repo_root(self) -> Path:
        return git_toplevel(cwd=self._cwd)

    def _reviews_dir(self) -> Path:
        return self._repo_root() / _REVIEWS_DIRNAME


def _resolve_review_path(*, reviews_dir: Path, key: str) -> _ResolvedReviewPath | ReviewerFailure:
    normalized = key.strip()
    if not normalized:
        return ReviewKeyInvalid(
            message="Review key must not be empty.",
        )

    key_path = Path(normalized)
    if key_path.is_absolute() or ".." in key_path.parts:
        return ReviewKeyInvalid(
            message=f"Review key must be a relative path without `..`: {key!r}",
        )

    if not reviews_dir.exists():
        return ReviewsDirMissing(
            message=f"No reviews directory at {reviews_dir}. Create it and add `<key>.md` files.",
        )
    if not reviews_dir.is_dir():
        return ReviewsDirNotADirectory(
            message=f"Reviews path is not a directory: {reviews_dir}",
        )

    path = reviews_dir / f"{normalized}.md"
    if not path.exists():
        return ReviewDefinitionNotFound(
            path=path,
            message=f"No review found for key {key!r} at {path}.",
        )

    try:
        resolved = path.resolve()
        reviews_root = reviews_dir.resolve()
    except OSError as exc:
        return ReviewKeyResolutionFailed(
            message=f"Unable to resolve review key {key!r}: {exc}",
        )

    if reviews_root not in resolved.parents and resolved != reviews_root:
        return ReviewKeyInvalid(
            message=f"Review key {key!r} resolves outside {reviews_dir}.",
        )

    return _ResolvedReviewPath(key=normalized, path=path)
