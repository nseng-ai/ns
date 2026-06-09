from __future__ import annotations

from pathlib import Path

import pytest

from asdl_objectives.objective_storage import (
    FilesystemObjectiveStorage,
    ObjectiveCheckoutInventory,
    ObjectiveCheckoutRecord,
    ObjectiveFiles,
    ObjectiveUpdateFile,
    active_record_relative_path,
    active_root_relative_path,
    archive_destination_relative_path,
    archive_empty_destination_relative_path,
    archive_empty_source_relative_path,
    archive_root_relative_path,
    archived_record_relative_path,
    is_valid_objective_slug,
    objective_slug_from_active_path,
    render_file_presence,
)


@pytest.mark.parametrize("slug", ("alpha", "objective-archive-move-command", "foo.bar"))
def test_is_valid_objective_slug_accepts_single_slug(slug: str) -> None:
    assert is_valid_objective_slug(slug) is True


@pytest.mark.parametrize("slug", ("", ".", "..", "foo/bar", ".asdl/objectives/foo", "foo\\bar"))
def test_is_valid_objective_slug_rejects_path_shaped_slug(slug: str) -> None:
    assert is_valid_objective_slug(slug) is False


def test_relative_paths_construct_checked_in_storage_paths() -> None:
    assert active_root_relative_path().as_posix() == ".asdl/objectives"
    assert active_record_relative_path("alpha").as_posix() == ".asdl/objectives/alpha"
    assert archive_root_relative_path().as_posix() == ".asdl/objective-archive"
    assert archived_record_relative_path("alpha").as_posix() == ".asdl/objective-archive/alpha"
    assert archive_empty_source_relative_path("archive").as_posix() == ".asdl/objectives"
    assert (
        archive_empty_destination_relative_path("archive").as_posix() == ".asdl/objective-archive"
    )
    assert (
        archive_destination_relative_path("alpha", direction="unarchive").as_posix()
        == ".asdl/objectives/alpha"
    )


def test_checkout_inventory_missing_or_nondirectory_active_root_returns_empty(
    tmp_path: Path,
) -> None:
    storage = FilesystemObjectiveStorage(tmp_path)
    assert storage.checkout_inventory() == ObjectiveCheckoutInventory(records=())

    active_root = tmp_path / ".asdl" / "objectives"
    active_root.parent.mkdir(parents=True)
    active_root.write_text("not a directory\n", encoding="utf-8")

    assert storage.checkout_inventory() == ObjectiveCheckoutInventory(records=())


def test_checkout_inventory_ignores_files_under_active_root(tmp_path: Path) -> None:
    root = tmp_path / ".asdl" / "objectives"
    root.mkdir(parents=True)
    (root / ".gitkeep").write_text("", encoding="utf-8")

    assert FilesystemObjectiveStorage(tmp_path).checkout_inventory() == ObjectiveCheckoutInventory(
        records=()
    )


def test_checkout_inventory_includes_incomplete_child_directory(tmp_path: Path) -> None:
    (tmp_path / ".asdl" / "objectives" / "new-one").mkdir(parents=True)

    assert FilesystemObjectiveStorage(tmp_path).checkout_inventory() == ObjectiveCheckoutInventory(
        records=(ObjectiveCheckoutRecord(slug="new-one", status="open"),)
    )


def test_checkout_inventory_direct_closed_marker_marks_closed(tmp_path: Path) -> None:
    record = tmp_path / ".asdl" / "objectives" / "alpha"
    record.mkdir(parents=True)
    (record / "closed.md").write_text("closed\n", encoding="utf-8")

    assert FilesystemObjectiveStorage(tmp_path).checkout_inventory().records == (
        ObjectiveCheckoutRecord(slug="alpha", status="closed"),
    )


def test_checkout_inventory_nested_closed_marker_does_not_close(tmp_path: Path) -> None:
    updates = tmp_path / ".asdl" / "objectives" / "alpha" / "updates"
    updates.mkdir(parents=True)
    (updates / "closed.md").write_text("not a marker\n", encoding="utf-8")

    assert FilesystemObjectiveStorage(tmp_path).checkout_inventory().records == (
        ObjectiveCheckoutRecord(slug="alpha", status="open"),
    )


def test_checkout_inventory_returns_records_sorted_by_slug(tmp_path: Path) -> None:
    root = tmp_path / ".asdl" / "objectives"
    (root / "zeta").mkdir(parents=True)
    (root / "alpha").mkdir()

    assert FilesystemObjectiveStorage(tmp_path).checkout_inventory().records == (
        ObjectiveCheckoutRecord(slug="alpha", status="open"),
        ObjectiveCheckoutRecord(slug="zeta", status="open"),
    )


def test_checkout_inventory_ignores_archive_root(tmp_path: Path) -> None:
    (tmp_path / ".asdl" / "objective-archive" / "archived").mkdir(parents=True)
    (tmp_path / ".asdl" / "objectives" / "active").mkdir(parents=True)

    assert FilesystemObjectiveStorage(tmp_path).checkout_inventory().records == (
        ObjectiveCheckoutRecord(slug="active", status="open"),
    )


def test_file_presence_reports_complete_closed_and_incomplete_records(tmp_path: Path) -> None:
    storage = FilesystemObjectiveStorage(tmp_path)
    complete = _record(tmp_path, "complete", closed=True, updates_dir=True)
    incomplete = _record(tmp_path, "incomplete")

    assert storage.file_presence(complete) == ObjectiveFiles(
        objective_md=True,
        roadmap_md=True,
        updates_dir=True,
        closed_md=True,
    )
    assert storage.file_presence(incomplete) == ObjectiveFiles(
        objective_md=False,
        roadmap_md=False,
        updates_dir=False,
        closed_md=False,
    )
    assert render_file_presence(storage.file_presence(complete)) == (
        "objective.md:yes, roadmap.md:yes, updates/:yes, closed.md:yes"
    )


def test_list_update_files_returns_sorted_direct_markdown_files(tmp_path: Path) -> None:
    record = _record(tmp_path, "alpha", updates_dir=True)
    updates_dir = record / "updates"
    (updates_dir / "zeta.md").write_text("# zeta\n", encoding="utf-8")
    (updates_dir / "alpha.md").write_text("# alpha\n", encoding="utf-8")
    (updates_dir / "notes.txt").write_text("ignore\n", encoding="utf-8")
    nested = updates_dir / "nested"
    nested.mkdir()
    (nested / "nested.md").write_text("ignore\n", encoding="utf-8")

    assert FilesystemObjectiveStorage(tmp_path).list_update_files(record) == (
        ObjectiveUpdateFile(
            name="alpha.md",
            path=".asdl/objectives/alpha/updates/alpha.md",
        ),
        ObjectiveUpdateFile(
            name="zeta.md",
            path=".asdl/objectives/alpha/updates/zeta.md",
        ),
    )


def test_list_update_files_missing_updates_dir_returns_empty(tmp_path: Path) -> None:
    record = _record(tmp_path, "alpha")

    assert FilesystemObjectiveStorage(tmp_path).list_update_files(record) == ()


def test_read_markdown_file_returns_content_or_none(tmp_path: Path) -> None:
    storage = FilesystemObjectiveStorage(tmp_path)
    markdown = tmp_path / "objective.md"
    markdown.write_text("# hello\n", encoding="utf-8")
    directory = tmp_path / "directory"
    directory.mkdir()

    assert storage.read_markdown_file(markdown) == "# hello\n"
    assert storage.read_markdown_file(tmp_path / "missing.md") is None
    assert storage.read_markdown_file(directory) is None


def test_move_record_creates_destination_parent_and_moves_directory(tmp_path: Path) -> None:
    storage = FilesystemObjectiveStorage(tmp_path)
    source = _record(tmp_path, "alpha")
    (source / "objective.md").write_text("# alpha\n", encoding="utf-8")
    move_paths = storage.move_paths("alpha", direction="archive")

    storage.move_record(move_paths)

    assert not source.exists()
    assert (tmp_path / ".asdl" / "objective-archive" / "alpha" / "objective.md").is_file()


def test_move_paths_expose_collision_and_source_directory_facts(tmp_path: Path) -> None:
    storage = FilesystemObjectiveStorage(tmp_path)
    active_record = _record(tmp_path, "alpha")
    archived_record = tmp_path / ".asdl" / "objective-archive" / "alpha"
    archived_record.mkdir(parents=True)
    move_paths = storage.move_paths("alpha", direction="archive")

    assert move_paths.source == active_record
    assert move_paths.source.is_dir() is True
    assert move_paths.destination == archived_record
    assert move_paths.destination.exists() is True

    active_record.rename(active_record.with_name("alpha-dir"))
    move_paths.source.write_text("not a directory\n", encoding="utf-8")
    assert move_paths.source.exists() is True
    assert move_paths.source.is_dir() is False


def test_objective_slug_from_active_path_accepts_active_record_child_paths() -> None:
    assert objective_slug_from_active_path(".asdl/objectives/alpha/objective.md") == "alpha"
    assert objective_slug_from_active_path(".asdl/objectives/alpha/updates/one.md") == "alpha"


@pytest.mark.parametrize(
    "path",
    (
        ".asdl/objectives",
        ".asdl/objectives/alpha",
        ".asdl/objectives/../objective.md",
        ".asdl/objectives//objective.md",
        ".asdl/objective-archive/alpha/objective.md",
        "README.md",
    ),
)
def test_objective_slug_from_active_path_rejects_non_active_record_child_paths(path: str) -> None:
    assert objective_slug_from_active_path(path) is None


def _record(
    repo_root: Path,
    slug: str,
    *,
    closed: bool = False,
    updates_dir: bool = False,
) -> Path:
    record = repo_root / ".asdl" / "objectives" / slug
    record.mkdir(parents=True)
    if closed:
        (record / "closed.md").write_text("closed\n", encoding="utf-8")
    if updates_dir:
        (record / "objective.md").write_text("# objective\n", encoding="utf-8")
        (record / "roadmap.md").write_text("# roadmap\n", encoding="utf-8")
        (record / "updates").mkdir()
    return record
