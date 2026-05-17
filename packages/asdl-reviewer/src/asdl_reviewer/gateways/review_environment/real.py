"""Real review-environment gateway backed by git, filesystem, and harnesses."""

from __future__ import annotations

import shutil
import subprocess
import threading
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from pathlib import Path

from asdl_core.git.real_git_gateway import resolve_trunk_branch
from asdl_reviewer.gateways.review_environment.gateway import ReviewEnvironmentGateway
from asdl_reviewer.git_toplevel import git_toplevel, run_git
from asdl_reviewer.harness_adapter import HarnessAdapter
from asdl_reviewer.harness_registry import HARNESS_ADAPTERS
from asdl_reviewer.models import (
    BaseRefUnavailable,
    GitDiffFailedError,
    HarnessBinaryMissing,
    HarnessDetection,
    HarnessExecutionFailed,
    HarnessInvocationFailed,
    HarnessUnknown,
    LocalDiff,
    ModelNotSupportedByHarness,
    ReviewCatalog,
    ReviewDefinitionNotAFile,
    ReviewDefinitionNotFound,
    ReviewDefinitionReadError,
    ReviewerFailure,
    ReviewExecutionRequest,
    ReviewExecutionResponse,
    ReviewKeyInvalid,
    ReviewKeyResolutionFailed,
    ReviewsDirMissing,
    ReviewsDirNotADirectory,
    ReviewSource,
)

ProgressWriter = Callable[[str], None]

_REVIEWS_DIRNAME = "reviews"


@dataclass(frozen=True)
class _ResolvedReviewPath:
    key: str
    path: Path


def _silent_progress(_msg: str) -> None:
    return None


class RealReviewEnvironmentGateway(ReviewEnvironmentGateway):
    """Access the local review-running environment."""

    def __init__(
        self,
        cwd: Path,
        adapters: Mapping[str, HarnessAdapter] = HARNESS_ADAPTERS,
        progress_writer: ProgressWriter = _silent_progress,
    ) -> None:
        self._cwd = cwd
        self._adapters = adapters
        self._progress_writer = progress_writer

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

    def detect_harness(self, *, name: str, binary: str) -> HarnessDetection:
        path = shutil.which(binary)
        return HarnessDetection(name=name, binary=binary, path=path)

    def run_review(
        self,
        request: ReviewExecutionRequest,
    ) -> ReviewExecutionResponse | ReviewerFailure:
        adapter = self._adapters.get(request.adapter_name)
        if adapter is None:
            known = ", ".join(sorted(self._adapters))
            return HarnessUnknown(
                message=(f"Unknown harness '{request.adapter_name}'. Known harnesses: {known}."),
            )

        if not adapter.supports_model(request.model):
            return ModelNotSupportedByHarness(
                message=(f"Model {request.model!r} is not supported by harness {adapter.name!r}."),
            )

        argv = adapter.build_argv(request)
        stdin_payload = adapter.build_stdin(request)
        stdin_arg = subprocess.PIPE if stdin_payload is not None else subprocess.DEVNULL

        try:
            process = subprocess.Popen(
                argv,
                stdin=stdin_arg,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
            )
        except FileNotFoundError:
            return HarnessBinaryMissing(
                message=(
                    f"Harness binary {adapter.binary!r} is not on PATH. "
                    "Install the harness or pick a different one."
                ),
            )
        except OSError as exc:
            return HarnessInvocationFailed(
                message=f"Unable to invoke {adapter.binary!r}: {exc}",
            )

        writer_thread: threading.Thread | None = None
        if stdin_payload is not None:
            assert process.stdin is not None  # PIPE guarantees this
            stdin_stream = process.stdin

            def _pump_stdin() -> None:
                try:
                    stdin_stream.write(stdin_payload)
                except BrokenPipeError:
                    pass
                finally:
                    stdin_stream.close()

            writer_thread = threading.Thread(target=_pump_stdin, daemon=True)
            writer_thread.start()

        stdout_lines: list[str] = []
        assert process.stdout is not None  # PIPE guarantees this
        for line in process.stdout:
            stdout_lines.append(line)
            description = adapter.describe_event(line)
            if description is not None:
                self._progress_writer(description)

        process.wait()
        if writer_thread is not None:
            writer_thread.join(timeout=5.0)
        stderr_text = ""
        if process.stderr is not None:
            stderr_text = process.stderr.read()

        if process.returncode != 0:
            stderr = stderr_text.strip()
            last_line = stdout_lines[-1].strip() if stdout_lines else ""
            return HarnessExecutionFailed(
                message=(
                    stderr
                    or last_line
                    or f"Harness {adapter.name!r} exited with status {process.returncode}."
                ),
            )

        return adapter.parse_stdout(request, "".join(stdout_lines))

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
