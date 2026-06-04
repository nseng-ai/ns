"""Repo-local prompt resolution with embedded fallback support."""

from __future__ import annotations

from collections.abc import Mapping
from pathlib import Path

from asdl_core.payloads.segments import SAFE_SEGMENT_PATTERN_TEXT, is_safe_segment
from asdl_core.prompts.embedded import load_embedded_default_prompt
from asdl_core.prompts.errors import PromptError
from asdl_core.prompts.models import PromptProvenance, PromptResolution


def resolve_prompt(
    name: str,
    *,
    repo_root: Path | None = None,
    prompt_root: Path | None = None,
    embedded_defaults: Mapping[str, str] | None = None,
) -> PromptResolution:
    """Resolve a repo-local prompt by safe name, falling back to embedded defaults."""

    _require_safe_prompt_name(name)
    resolved_prompt_root = _resolve_prompt_root(repo_root=repo_root, prompt_root=prompt_root)
    repo_prompt_path = resolved_prompt_root / f"{name}.md"
    _ensure_repo_prompt_path_safe(
        repo_prompt_path,
        repo_root=repo_root,
        prompt_root=resolved_prompt_root,
    )

    if repo_prompt_path.exists() or repo_prompt_path.is_symlink():
        if not repo_prompt_path.is_file():
            raise PromptError(
                error_type="prompt_root_invalid",
                message=f"Prompt path exists but is not a file: {repo_prompt_path}",
            )
        return PromptResolution(
            name=name,
            content=repo_prompt_path.read_text(encoding="utf-8"),
            provenance=PromptProvenance(
                source="repo",
                repo_prompt_path=repo_prompt_path,
                prompt_path=repo_prompt_path,
            ),
        )

    embedded_content = _resolve_embedded_default(name, embedded_defaults=embedded_defaults)
    if embedded_content is not None:
        return PromptResolution(
            name=name,
            content=embedded_content,
            provenance=PromptProvenance(
                source="embedded_default",
                repo_prompt_path=repo_prompt_path,
                default_name=name,
            ),
        )

    raise PromptError(
        error_type="prompt_not_found",
        message=(
            f"No prompt named {name!r} found at {repo_prompt_path}, and no embedded default exists."
        ),
    )


def _require_safe_prompt_name(name: str) -> None:
    if is_safe_segment(name):
        return
    raise PromptError(
        error_type="prompt_name_invalid",
        message=(
            f"Prompt name must match safe segment pattern {SAFE_SEGMENT_PATTERN_TEXT!r}: {name!r}"
        ),
    )


def _resolve_prompt_root(*, repo_root: Path | None, prompt_root: Path | None) -> Path:
    repo_root_supplied = repo_root is not None
    prompt_root_supplied = prompt_root is not None
    if repo_root_supplied == prompt_root_supplied:
        raise PromptError(
            error_type="prompt_root_invalid",
            message="Prompt resolution requires exactly one of repo_root or prompt_root.",
        )
    if prompt_root is not None:
        return prompt_root
    if repo_root is not None:
        return repo_root / ".asdl" / "prompts"
    raise AssertionError("unreachable prompt root state")


def _ensure_repo_prompt_path_safe(
    repo_prompt_path: Path,
    *,
    repo_root: Path | None,
    prompt_root: Path,
) -> None:
    unsafe_component = _first_symlinked_prompt_component(
        repo_prompt_path,
        repo_root=repo_root,
        prompt_root=prompt_root,
    )
    if unsafe_component is None:
        return
    raise PromptError(
        error_type="prompt_root_invalid",
        message=f"Prompt path must not contain symlinks: {unsafe_component}",
    )


def _first_symlinked_prompt_component(
    repo_prompt_path: Path,
    *,
    repo_root: Path | None,
    prompt_root: Path,
) -> Path | None:
    candidates = (
        (repo_root / ".asdl", prompt_root, repo_prompt_path)
        if repo_root is not None
        else (prompt_root, repo_prompt_path)
    )
    for candidate in candidates:
        if candidate.is_symlink():
            return candidate
    return None


def _resolve_embedded_default(
    name: str,
    *,
    embedded_defaults: Mapping[str, str] | None,
) -> str | None:
    if embedded_defaults is not None:
        return embedded_defaults.get(name)
    return load_embedded_default_prompt(name)
