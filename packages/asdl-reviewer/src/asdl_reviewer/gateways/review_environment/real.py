"""Real review-environment gateway backed by git, filesystem, and harnesses."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from asdl_core.git.real_git_gateway import resolve_trunk_branch
from asdl_reviewer.gateways.review_environment.gateway import ReviewEnvironmentGateway
from asdl_reviewer.git_toplevel import git_toplevel, run_git
from asdl_reviewer.harness.invocation import (
    HarnessReviewRequest,
    HarnessRuntime,
    ProgressWriter,
    silent_progress,
)
from asdl_reviewer.models import (
    BaseRefUnavailable,
    GitDiffFailedError,
    HarnessDetection,
    LocalDiff,
    ReviewCatalog,
    ReviewDefinitionNotAFile,
    ReviewDefinitionNotFound,
    ReviewDefinitionReadError,
    ReviewerFailure,
    ReviewExecutionResponse,
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


class RealReviewEnvironmentGateway(ReviewEnvironmentGateway):
    """Access the local review-running environment."""

    def __init__(
        self,
        cwd: Path,
        progress_writer: ProgressWriter = silent_progress,
    ) -> None:
        self._cwd = cwd
        self._harness_runtime = HarnessRuntime(progress_writer=progress_writer)

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

    def load_diff(self, *, base_ref: str | None) -> LocalDiff | BaseRefUnavailable:
        repo_root = self._repo_root()
        resolved_base_ref = base_ref.strip() if base_ref is not None else ""
        if not resolved_base_ref:
            resolved_base_ref = resolve_trunk_branch(repo_root) or ""
        if not resolved_base_ref:
            return BaseRefUnavailable(
                message="Unable to resolve a base branch. Pass --base-ref explicitly.",
            )

        diff_result = run_git(
            ["git", "diff", "--no-ext-diff", f"origin/{resolved_base_ref}...HEAD"],
            cwd=repo_root,
        )
        if diff_result.returncode != 0:
            stderr = diff_result.stderr.strip()
            raise GitDiffFailedError(
                stderr or f"Unable to load the local diff against origin/{resolved_base_ref}."
            )

        return LocalDiff(
            base_ref=resolved_base_ref,
            diff_text=diff_result.stdout,
        )

    def list_harnesses(self) -> tuple[HarnessDetection, ...]:
        return self._harness_runtime.list_harnesses()

    def run_review(
        self,
        request: HarnessReviewRequest,
    ) -> ReviewExecutionResponse | ReviewerFailure:
        return self._harness_runtime.run_review(request)

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
