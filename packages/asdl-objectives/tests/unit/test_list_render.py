from __future__ import annotations

import pytest

from asdl_objectives.list_models import ObjectiveListRecord, ObjectiveListResult
from asdl_objectives.list_render import render_objective_list_markdown
from asdl_objectives.list_status import ObjectiveStatus, ObjectiveStatusFilter


def test_render_objective_list_markdown_names_only_emits_slugs_without_headings(
    capsys: pytest.CaptureFixture[str],
) -> None:
    render_objective_list_markdown(_result(records=(_record("alpha"), _record("beta")), names=True))

    assert capsys.readouterr().out == "alpha\nbeta\n"


def test_render_objective_list_markdown_table_has_checkout_local_columns(
    capsys: pytest.CaptureFixture[str],
) -> None:
    render_objective_list_markdown(_result(records=(_record("alpha"),)))

    output = capsys.readouterr().out
    assert "# Objective records in this checkout" in output
    assert "Root: `.asdl/objectives`" in output
    assert "| objective | status | latest update |" in output
    assert "| alpha | ○ open |" in output
    assert "latest work" not in output.lower()
    assert "work branches" not in output.lower()
    assert "max slice commits" not in output.lower()


def test_render_objective_list_markdown_updated_branches_column_when_included(
    capsys: pytest.CaptureFixture[str],
) -> None:
    render_objective_list_markdown(
        _result(
            records=(
                _record("alpha", updated_branches=("feat/alpha", "feat/shared")),
                _record("beta", updated_branches=()),
            ),
            updated_branches_included=True,
        )
    )

    output = capsys.readouterr().out
    assert "| objective | status | latest update | updated branches |" in output
    assert "| alpha | ○ open |" in output
    assert "feat/alpha, feat/shared" in output
    assert "| beta | ○ open |" in output
    assert "| — |" in output


def test_render_objective_list_markdown_prefixes_dirty_latest_update(
    capsys: pytest.CaptureFixture[str],
) -> None:
    render_objective_list_markdown(
        _result(records=(_record("alpha", has_outstanding_changes=True),))
    )

    output = capsys.readouterr().out
    assert "| alpha | ○ open | (x) " in output


def test_render_objective_list_markdown_dirty_missing_update_renders_marker_dash(
    capsys: pytest.CaptureFixture[str],
) -> None:
    render_objective_list_markdown(
        _result(records=(_record("alpha", latest_update_iso=None, has_outstanding_changes=True),))
    )

    assert "| alpha | ○ open | (x) — |" in capsys.readouterr().out


def test_render_objective_list_markdown_clean_rows_do_not_include_dirty_marker(
    capsys: pytest.CaptureFixture[str],
) -> None:
    render_objective_list_markdown(_result(records=(_record("alpha"),)))

    assert "(x)" not in capsys.readouterr().out


@pytest.mark.parametrize(
    ("status_filter", "message"),
    [
        ("active", "No open Objective records found."),
        ("open", "No open Objective records found."),
        ("closed", "No closed Objective records found."),
        ("all", "No Objective records found."),
    ],
)
def test_render_objective_list_markdown_empty_messages_use_record_terminology(
    status_filter: ObjectiveStatusFilter,
    message: str,
    capsys: pytest.CaptureFixture[str],
) -> None:
    render_objective_list_markdown(_result(records=(), status_filter=status_filter))

    assert message in capsys.readouterr().out


def _record(
    slug: str,
    *,
    status: ObjectiveStatus = "open",
    latest_update_iso: str | None = "2026-05-20T10:00:00Z",
    has_outstanding_changes: bool = False,
    updated_branches: tuple[str, ...] | None = None,
) -> ObjectiveListRecord:
    return ObjectiveListRecord.create(
        slug=slug,
        status=status,
        latest_update_iso=latest_update_iso,
        updated_branches=updated_branches,
        has_outstanding_changes=has_outstanding_changes,
    )


def _result(
    *,
    records: tuple[ObjectiveListRecord, ...],
    status_filter: ObjectiveStatusFilter = "active",
    names: bool = False,
    updated_branches_included: bool = False,
) -> ObjectiveListResult:
    return ObjectiveListResult(
        trunk_branch="master",
        root_path=".asdl/objectives",
        status_filter=status_filter,
        names_only=names,
        updated_branches_included=updated_branches_included,
        records=records,
    )
