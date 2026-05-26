from __future__ import annotations

from pathlib import Path

from asdl_objectives.list_inventory import (
    ObjectiveCheckoutInventory,
    ObjectiveCheckoutRecord,
    build_objective_checkout_inventory,
)


def test_build_objective_checkout_inventory_missing_active_root_returns_empty(
    tmp_path: Path,
) -> None:
    assert build_objective_checkout_inventory(tmp_path) == ObjectiveCheckoutInventory(records=())


def test_build_objective_checkout_inventory_ignores_files_under_active_root(
    tmp_path: Path,
) -> None:
    root = tmp_path / ".asdl" / "objectives"
    root.mkdir(parents=True)
    (root / ".gitkeep").write_text("", encoding="utf-8")

    assert build_objective_checkout_inventory(tmp_path) == ObjectiveCheckoutInventory(records=())


def test_build_objective_checkout_inventory_includes_incomplete_child_directory(
    tmp_path: Path,
) -> None:
    (tmp_path / ".asdl" / "objectives" / "new-one").mkdir(parents=True)

    assert build_objective_checkout_inventory(tmp_path) == ObjectiveCheckoutInventory(
        records=(ObjectiveCheckoutRecord(slug="new-one", status="open"),)
    )


def test_build_objective_checkout_inventory_direct_closed_marker_marks_closed(
    tmp_path: Path,
) -> None:
    record = tmp_path / ".asdl" / "objectives" / "alpha"
    record.mkdir(parents=True)
    (record / "closed.md").write_text("closed\n", encoding="utf-8")

    assert build_objective_checkout_inventory(tmp_path).records == (
        ObjectiveCheckoutRecord(slug="alpha", status="closed"),
    )


def test_build_objective_checkout_inventory_nested_closed_marker_does_not_close(
    tmp_path: Path,
) -> None:
    updates = tmp_path / ".asdl" / "objectives" / "alpha" / "updates"
    updates.mkdir(parents=True)
    (updates / "closed.md").write_text("not a marker\n", encoding="utf-8")

    assert build_objective_checkout_inventory(tmp_path).records == (
        ObjectiveCheckoutRecord(slug="alpha", status="open"),
    )


def test_build_objective_checkout_inventory_returns_records_sorted_by_slug(
    tmp_path: Path,
) -> None:
    root = tmp_path / ".asdl" / "objectives"
    (root / "zeta").mkdir(parents=True)
    (root / "alpha").mkdir()

    assert build_objective_checkout_inventory(tmp_path).records == (
        ObjectiveCheckoutRecord(slug="alpha", status="open"),
        ObjectiveCheckoutRecord(slug="zeta", status="open"),
    )


def test_build_objective_checkout_inventory_ignores_archive_root(
    tmp_path: Path,
) -> None:
    (tmp_path / ".asdl" / "objective-archive" / "archived").mkdir(parents=True)
    (tmp_path / ".asdl" / "objectives" / "active").mkdir(parents=True)

    assert build_objective_checkout_inventory(tmp_path).records == (
        ObjectiveCheckoutRecord(slug="active", status="open"),
    )
