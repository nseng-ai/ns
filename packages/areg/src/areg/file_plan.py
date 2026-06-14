from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import click


@dataclass(frozen=True)
class TextWritePlan:
    path: Path
    content: str
    description: str
    create_parent: bool = False


@dataclass(frozen=True)
class SkippedTextWrite:
    path: Path
    reason: str


TextFilePlan = TextWritePlan | SkippedTextWrite


@dataclass(frozen=True)
class DeleteFilePlan:
    path: Path
    description: str


@dataclass(frozen=True)
class RemoveEmptyDirPlan:
    path: Path
    description: str


def reject_symlink(path: Path, *, description: str) -> None:
    if path.is_symlink():
        raise click.ClickException(f"{description} at {path} is a symlink; refusing to manage it.")


def is_under_project(path: Path, *, project_dir: Path) -> bool:
    return path == project_dir or path.is_relative_to(project_dir)


def _require_under_project(path: Path, *, project_dir: Path, verb: str) -> None:
    resolved = path.resolve()
    if not is_under_project(resolved, project_dir=project_dir):
        raise click.ClickException(f"{path} resolves outside {project_dir}; refusing to {verb} it.")


def read_existing_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except OSError as e:
        raise click.ClickException(f"Failed to read {path}: {e}") from e


def _write_text(path: Path, content: str, description: str) -> None:
    try:
        path.write_text(content, encoding="utf-8")
    except OSError as e:
        raise click.ClickException(f"Failed to write {description} at {path}: {e}") from e


def _require_existing_path_under_project(
    path: Path,
    *,
    project_dir: Path,
    description: str,
) -> None:
    if not path.exists():
        raise click.ClickException(f"{description} at {path} does not exist.")
    resolved = path.resolve()
    if not is_under_project(resolved, project_dir=project_dir):
        raise click.ClickException(
            f"{description} at {path} resolves outside {project_dir}; refusing to manage it."
        )


def _validate_existing_parent(path: Path, *, project_dir: Path) -> None:
    reject_symlink(path, description="Parent directory")
    if not path.is_dir():
        raise click.ClickException(f"{path} exists but is not a directory.")
    _require_existing_path_under_project(
        path,
        project_dir=project_dir,
        description="Parent directory",
    )


def _validate_parent_chain(path: Path, *, project_dir: Path) -> None:
    current = path.parent
    while not current.exists() and current != project_dir:
        current = current.parent

    _validate_existing_parent(current, project_dir=project_dir)


def _validate_text_write_target(plan: TextWritePlan, *, project_dir: Path) -> None:
    if plan.path.exists():
        reject_symlink(plan.path, description=plan.description)
        if not plan.path.is_file():
            raise click.ClickException(f"{plan.path} exists but is not a file.")
        _require_existing_path_under_project(
            plan.path,
            project_dir=project_dir,
            description=plan.description,
        )
        return

    reject_symlink(plan.path, description=plan.description)
    _validate_parent_chain(plan.path, project_dir=project_dir)


def apply_text_file_plan(plan: TextFilePlan, *, project_dir: Path) -> None:
    if isinstance(plan, SkippedTextWrite):
        return

    _validate_text_write_target(plan, project_dir=project_dir)
    if plan.create_parent:
        try:
            plan.path.parent.mkdir(parents=True, exist_ok=True)
        except OSError as e:
            raise click.ClickException(f"Failed to create {plan.path.parent}: {e}") from e
        _validate_text_write_target(plan, project_dir=project_dir)
    _write_text(plan.path, plan.content, plan.description)


def apply_delete_file(plan: DeleteFilePlan, *, project_dir: Path) -> None:
    reject_symlink(plan.path, description=plan.description)
    if not plan.path.exists():
        return
    if not plan.path.is_file():
        raise click.ClickException(f"{plan.path} exists but is not a file.")
    _require_under_project(plan.path, project_dir=project_dir, verb="delete")
    try:
        plan.path.unlink()
    except OSError as e:
        raise click.ClickException(
            f"Failed to delete {plan.description} at {plan.path}: {e}"
        ) from e


def apply_remove_empty_dir(plan: RemoveEmptyDirPlan, *, project_dir: Path) -> None:
    if not plan.path.exists():
        return
    reject_symlink(plan.path, description=plan.description)
    if not plan.path.is_dir():
        raise click.ClickException(f"{plan.path} exists but is not a directory.")
    _require_under_project(plan.path, project_dir=project_dir, verb="remove")
    if any(plan.path.iterdir()):
        return
    try:
        plan.path.rmdir()
    except OSError as e:
        raise click.ClickException(
            f"Failed to remove {plan.description} at {plan.path}: {e}"
        ) from e
