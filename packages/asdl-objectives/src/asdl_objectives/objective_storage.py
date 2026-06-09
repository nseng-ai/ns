"""Checked-in Markdown storage helpers for Objective records."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from asdl_core.clinkr.models import ClinkrModel

ACTIVE_OBJECTIVE_ROOT = Path(".asdl") / "objectives"
OBJECTIVE_ARCHIVE_ROOT = Path(".asdl") / "objective-archive"

ObjectiveRecordStatus = Literal["open", "closed"]
ObjectiveArchiveDirection = Literal["archive", "unarchive"]


@dataclass(frozen=True)
class ObjectiveCheckoutRecord:
    """Objective record discovered in the current checkout."""

    slug: str
    status: ObjectiveRecordStatus


@dataclass(frozen=True)
class ObjectiveCheckoutInventory:
    """Objective records physically present in the current checkout."""

    records: tuple[ObjectiveCheckoutRecord, ...]


@dataclass(frozen=True)
class ObjectiveRecordMovePaths:
    """Absolute and checkout-relative paths for an Objective archive move."""

    relative_source: Path
    relative_destination: Path
    source: Path
    destination: Path


class ObjectiveFiles(ClinkrModel):
    objective_md: bool
    roadmap_md: bool
    updates_dir: bool
    closed_md: bool


class ObjectiveUpdateFile(ClinkrModel):
    name: str
    path: str


class FilesystemObjectiveStorage:
    """Concrete checked-in Markdown Objective storage rooted at one checkout."""

    def __init__(self, repo_root: Path) -> None:
        self.repo_root = repo_root

    def active_root_path(self) -> Path:
        return self.repo_root / active_root_relative_path()

    def archive_root_path(self) -> Path:
        return self.repo_root / archive_root_relative_path()

    def active_record_path(self, slug: str) -> Path:
        return self.repo_root / active_record_relative_path(slug)

    def archived_record_path(self, slug: str) -> Path:
        return self.repo_root / archived_record_relative_path(slug)

    def checkout_inventory(self) -> ObjectiveCheckoutInventory:
        """Return Objective directories directly under ``.asdl/objectives``."""
        root = self.active_root_path()
        if not root.exists() or not root.is_dir():
            return ObjectiveCheckoutInventory(records=())

        records = tuple(
            ObjectiveCheckoutRecord(
                slug=child.name,
                status="closed" if (child / "closed.md").is_file() else "open",
            )
            for child in sorted(root.iterdir(), key=lambda path: path.name)
            if child.is_dir()
        )
        return ObjectiveCheckoutInventory(records=records)

    def file_presence(self, record_path: Path) -> ObjectiveFiles:
        return ObjectiveFiles(
            objective_md=(record_path / "objective.md").is_file(),
            roadmap_md=(record_path / "roadmap.md").is_file(),
            updates_dir=(record_path / "updates").is_dir(),
            closed_md=(record_path / "closed.md").is_file(),
        )

    def active_record_file_presence(self, slug: str) -> ObjectiveFiles:
        return self.file_presence(self.active_record_path(slug))

    def list_update_files(self, record_path: Path) -> tuple[ObjectiveUpdateFile, ...]:
        updates_dir = record_path / "updates"
        if not updates_dir.is_dir():
            return ()

        relative_updates_dir = active_record_relative_path(record_path.name) / "updates"
        update_paths = sorted(
            (child for child in updates_dir.glob("*.md") if child.is_file()),
            key=lambda child: child.name,
        )
        return tuple(
            ObjectiveUpdateFile(
                name=update_path.name,
                path=(relative_updates_dir / update_path.name).as_posix(),
            )
            for update_path in update_paths
        )

    def active_record_update_files(self, slug: str) -> tuple[ObjectiveUpdateFile, ...]:
        return self.list_update_files(self.active_record_path(slug))

    def read_markdown_file(self, path: Path) -> str | None:
        if not path.is_file():
            return None
        return path.read_text(encoding="utf-8")

    def move_paths(
        self,
        slug: str,
        *,
        direction: ObjectiveArchiveDirection,
    ) -> ObjectiveRecordMovePaths:
        relative_source = archive_source_relative_path(slug, direction=direction)
        relative_destination = archive_destination_relative_path(slug, direction=direction)
        return ObjectiveRecordMovePaths(
            relative_source=relative_source,
            relative_destination=relative_destination,
            source=self.repo_root / relative_source,
            destination=self.repo_root / relative_destination,
        )

    def move_record(self, move_paths: ObjectiveRecordMovePaths) -> None:
        move_paths.destination.parent.mkdir(parents=True, exist_ok=True)
        move_paths.source.rename(move_paths.destination)


def is_valid_objective_slug(slug: str) -> bool:
    return slug not in {"", ".", ".."} and "/" not in slug and "\\" not in slug


def active_root_relative_path() -> Path:
    return ACTIVE_OBJECTIVE_ROOT


def archive_root_relative_path() -> Path:
    return OBJECTIVE_ARCHIVE_ROOT


def active_record_relative_path(slug: str) -> Path:
    return active_root_relative_path() / slug


def archived_record_relative_path(slug: str) -> Path:
    return archive_root_relative_path() / slug


def archive_source_relative_path(slug: str, *, direction: ObjectiveArchiveDirection) -> Path:
    if direction == "unarchive":
        return archived_record_relative_path(slug)
    return active_record_relative_path(slug)


def archive_destination_relative_path(slug: str, *, direction: ObjectiveArchiveDirection) -> Path:
    if direction == "unarchive":
        return active_record_relative_path(slug)
    return archived_record_relative_path(slug)


def archive_empty_source_relative_path(direction: ObjectiveArchiveDirection) -> Path:
    if direction == "unarchive":
        return archive_root_relative_path()
    return active_root_relative_path()


def archive_empty_destination_relative_path(direction: ObjectiveArchiveDirection) -> Path:
    if direction == "unarchive":
        return active_root_relative_path()
    return archive_root_relative_path()


def empty_objective_files() -> ObjectiveFiles:
    return ObjectiveFiles(
        objective_md=False,
        roadmap_md=False,
        updates_dir=False,
        closed_md=False,
    )


def render_file_presence(files: ObjectiveFiles) -> str:
    return ", ".join(
        (
            f"objective.md:{_yes_no(files.objective_md)}",
            f"roadmap.md:{_yes_no(files.roadmap_md)}",
            f"updates/:{_yes_no(files.updates_dir)}",
            f"closed.md:{_yes_no(files.closed_md)}",
        )
    )


def objective_slug_from_active_path(path: str) -> str | None:
    prefix = f"{active_root_relative_path().as_posix()}/"
    if not path.startswith(prefix):
        return None

    rest = path.removeprefix(prefix)
    slug, separator, child_path = rest.partition("/")
    if separator == "" or child_path == "" or not is_valid_objective_slug(slug):
        return None
    return slug


def _yes_no(value: bool) -> str:
    return "yes" if value else "no"
