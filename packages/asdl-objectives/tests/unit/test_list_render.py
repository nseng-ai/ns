from __future__ import annotations

import pytest

from asdl_objectives.list_models import (
    ObjectiveBranchEntry,
    ObjectiveListGroup,
    ObjectiveListResult,
    ObjectiveStatusSourceEntry,
)
from asdl_objectives.list_render import render_objective_list_markdown


def test_render_objective_list_markdown_names_only_emits_slugs_without_headings(
    capsys: pytest.CaptureFixture[str],
) -> None:
    render_objective_list_markdown(_result(groups=(_group("alpha"), _group("beta")), names=True))

    assert capsys.readouterr().out == "alpha\nbeta\n"


def test_render_objective_list_markdown_empty_current_detached_message(
    capsys: pytest.CaptureFixture[str],
) -> None:
    render_objective_list_markdown(
        _result(
            groups=(),
            status_source="current",
            status_source_branch=None,
            current_branch=None,
            filtered_to_current=True,
        )
    )

    output = capsys.readouterr().out
    assert "Status source: `current branch`" in output
    assert "No current branch (detached HEAD); no active Objectives to list." in output


def test_render_objective_list_markdown_list_header_includes_latest_work_and_slice_columns(
    capsys: pytest.CaptureFixture[str],
) -> None:
    render_objective_list_markdown(_result(groups=(_group("alpha"),)))

    output = capsys.readouterr().out
    assert (
        "| objective | status | latest work | latest update | work branches | max slice commits |"
        in output
    )
    assert "| alpha | ○ open | `feat/alpha` |" in output
    assert "+3 |" in output


def test_render_objective_list_markdown_detail_includes_status_source_and_work_branch_section(
    capsys: pytest.CaptureFixture[str],
) -> None:
    render_objective_list_markdown(_result(groups=(_group("alpha"),), view="detail"))

    output = capsys.readouterr().out
    assert "# Objective branch details in this local repository" in output
    assert "Base branch: master — ○ open — updated" in output
    assert "### Work branches" in output
    assert "| `feat/alpha` | `master` | ○ open |" in output


def _group(slug: str) -> ObjectiveListGroup:
    return ObjectiveListGroup(
        slug=slug,
        status="open",
        status_source_entry=ObjectiveStatusSourceEntry(
            branch="master",
            status="open",
            updated_iso="2026-05-20T10:00:00Z",
            present=True,
        ),
        branches=(
            ObjectiveBranchEntry(
                branch=f"feat/{slug}",
                parent_branch="master",
                status="open",
                updated_iso="2026-05-20T11:00:00Z",
                slice_commits=3,
            ),
        ),
        latest_update_iso="2026-05-20T11:00:00Z",
        latest_work_branch=f"feat/{slug}",
    )


def _result(
    *,
    groups: tuple[ObjectiveListGroup, ...],
    view: str = "list",
    status_source: str = "base",
    status_source_branch: str | None = "master",
    current_branch: str | None = None,
    filtered_to_current: bool = False,
    names: bool = False,
) -> ObjectiveListResult:
    return ObjectiveListResult(
        base_branch="master",
        trunk_branch="master",
        status_source=status_source,
        status_source_branch=status_source_branch,
        view=view,
        status_filter="active",
        current_branch=current_branch,
        filtered_to_current=filtered_to_current,
        names_only=names,
        groups=groups,
    )
