"""Shared filesystem inventory helpers for Initiative exec commands."""

from __future__ import annotations

from pathlib import Path

from asdl_core.clinkr.models import ClinkrModel


class InitiativeFiles(ClinkrModel):
    initiative_md: bool
    roadmap_md: bool
    updates_dir: bool
    closed_md: bool


class InitiativeUpdateFile(ClinkrModel):
    name: str
    path: str


def relative_root_path() -> Path:
    return Path(".asdl") / "initiatives"


def relative_record_path(slug: str) -> Path:
    return relative_root_path() / slug


def build_initiative_files(path: Path) -> InitiativeFiles:
    return InitiativeFiles(
        initiative_md=(path / "initiative.md").is_file(),
        roadmap_md=(path / "roadmap.md").is_file(),
        updates_dir=(path / "updates").is_dir(),
        closed_md=(path / "closed.md").is_file(),
    )


def empty_initiative_files() -> InitiativeFiles:
    return InitiativeFiles(
        initiative_md=False,
        roadmap_md=False,
        updates_dir=False,
        closed_md=False,
    )


def list_update_files(path: Path) -> tuple[InitiativeUpdateFile, ...]:
    updates_dir = path / "updates"
    if not updates_dir.is_dir():
        return ()

    relative_updates_dir = relative_record_path(path.name) / "updates"
    update_paths = sorted(
        (child for child in updates_dir.glob("*.md") if child.is_file()),
        key=lambda child: child.name,
    )
    return tuple(
        InitiativeUpdateFile(
            name=update_path.name,
            path=(relative_updates_dir / update_path.name).as_posix(),
        )
        for update_path in update_paths
    )


def render_file_presence(files: InitiativeFiles) -> str:
    return ", ".join(
        (
            f"initiative.md:{_yes_no(files.initiative_md)}",
            f"roadmap.md:{_yes_no(files.roadmap_md)}",
            f"updates/:{_yes_no(files.updates_dir)}",
            f"closed.md:{_yes_no(files.closed_md)}",
        )
    )


def _yes_no(value: bool) -> str:
    return "yes" if value else "no"
