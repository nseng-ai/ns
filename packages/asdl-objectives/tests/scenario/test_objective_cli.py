from __future__ import annotations

import json
from pathlib import Path

import pytest
from click.testing import CliRunner, Result

from asdl_core.clinkr.context import build_clinkr_context_object
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.git.testing import FakeGitGateway
from asdl_core.git.types import DetachedHead, GitCommandFailure, PathTouch
from asdl_objectives.context import ObjectiveCliContext, ObjectiveCliUnavailable
from asdl_objectives.main import build_cli


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def test_objective_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["-h"])

    assert result.exit_code == 0
    assert "Usage: objective" in result.output
    assert "Work with checked-in Objective records." in result.output
    assert "--version" in result.output
    assert "list" in result.output
    assert "List Objective status" in result.output
    assert "exec" not in result.output


def test_objective_version(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["--version"])

    assert result.exit_code == 0
    assert "version" in result.output.lower()


def test_objective_list_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["list", "--help"])

    assert result.exit_code == 0
    assert "Usage: objective list" in result.output
    assert "List Objective status from base/current status and local work branches" in result.output
    assert "--current" in result.output
    assert "--names" in result.output
    assert "--status" in result.output
    assert "--view" in result.output


def test_objective_list_empty_result(cli_group: ClinkrGroup) -> None:
    ctx = _list_context(branches=("master", "feat/no-objectives"))

    result = _invoke_list_json(cli_group, ctx)

    assert result.exit_code == 0, result.output
    assert json.loads(result.output) == {
        "exit_code": 0,
        "data": {
            "base_branch": "master",
            "trunk_branch": "master",
            "status_source": "base",
            "status_source_branch": "master",
            "view": "list",
            "status_filter": "active",
            "current_branch": None,
            "filtered_to_current": False,
            "names_only": False,
            "groups": [],
        },
    }

    human = _invoke_list_human(cli_group, ctx)
    assert human.exit_code == 0, human.output
    assert "Objective status in this local repository" in human.output
    assert "Base branch: master" in human.output
    assert "Status filter: active" in human.output
    assert "No active Objective status found." in human.output

    all_human = _invoke_list_human(cli_group, ctx, status="all")
    open_human = _invoke_list_human(cli_group, ctx, status="open")
    closed_human = _invoke_list_human(cli_group, ctx, status="closed")
    in_flight_human = _invoke_list_human(cli_group, ctx, status="in-flight")
    assert all_human.exit_code == 0, all_human.output
    assert open_human.exit_code == 0, open_human.output
    assert closed_human.exit_code == 0, closed_human.output
    assert in_flight_human.exit_code == 0, in_flight_human.output
    assert "No Objective status found." in all_human.output
    assert "No open Objective status found." in open_human.output
    assert "No closed Objective status found." in closed_human.output
    assert "No in-flight Objective status found." in in_flight_human.output


def test_objective_list_groups_work_branches_under_base_status(
    cli_group: ClinkrGroup,
) -> None:
    ctx = _list_context(
        branches=("master", "feat/b", "feat/a"),
        tracked_paths_by_ref_path={
            ("refs/heads/master", ".asdl/objectives"): (".asdl/objectives/alpha/objective.md",),
            ("refs/heads/feat/a", ".asdl/objectives"): (".asdl/objectives/alpha/objective.md",),
            ("refs/heads/feat/b", ".asdl/objectives"): (".asdl/objectives/alpha/objective.md",),
        },
        path_touch_by_ref_path={
            ("refs/heads/master", ".asdl/objectives/alpha"): _touch(
                "base-alpha", "2026-05-20T09:00:00-04:00"
            ),
            ("master..feat/a", ".asdl/objectives/alpha"): _touch(
                "a-alpha", "2026-05-20T10:44:08-04:00"
            ),
            ("master..feat/b", ".asdl/objectives/alpha"): _touch(
                "b-alpha", "2026-05-20T11:15:42-04:00"
            ),
        },
        commit_count_by_range={
            "master..feat/a": 3,
            "master..feat/b": 18,
        },
    )

    result = _invoke_list_json(cli_group, ctx)

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["data"]["base_branch"] == "master"
    assert payload["data"]["trunk_branch"] == "master"
    assert payload["data"]["view"] == "list"
    assert payload["data"]["status_filter"] == "active"
    assert payload["data"]["filtered_to_current"] is False
    assert payload["data"]["current_branch"] is None
    assert payload["data"]["names_only"] is False
    assert payload["data"]["groups"] == [
        {
            "slug": "alpha",
            "status": "open",
            "status_source_entry": {
                "branch": "master",
                "status": "open",
                "updated_iso": "2026-05-20T09:00:00-04:00",
                "present": True,
            },
            "branches": [
                {
                    "branch": "feat/a",
                    "parent_branch": "master",
                    "status": "open",
                    "updated_iso": "2026-05-20T10:44:08-04:00",
                    "slice_commits": 3,
                },
                {
                    "branch": "feat/b",
                    "parent_branch": "master",
                    "status": "open",
                    "updated_iso": "2026-05-20T11:15:42-04:00",
                    "slice_commits": 18,
                },
            ],
            "latest_update_iso": "2026-05-20T11:15:42-04:00",
            "latest_work_branch": "feat/b",
        }
    ]
    assert "tip_head_iso" not in payload["data"]["groups"][0]["branches"][0]
    assert "ahead_trunk" not in payload["data"]["groups"][0]["branches"][0]

    human = _invoke_list_human(cli_group, ctx, terminal_columns=120)
    assert human.exit_code == 0, human.output
    assert "Status" in human.output
    assert "Latest work" in human.output
    assert "Latest update" in human.output
    assert "Work branches" in human.output
    assert "Max slice commits" in human.output
    assert "○ open" in human.output
    assert "feat/b" in human.output
    assert "feat/a" not in human.output

    markdown = _invoke_list_md(cli_group, ctx)
    assert markdown.exit_code == 0, markdown.output
    assert (
        "| objective | status | latest work | latest update | work branches | max slice commits |"
        in markdown.output
    )
    assert "| alpha | ○ open | `feat/b` |" in markdown.output
    assert "`feat/a`" not in markdown.output


def test_objective_list_in_flight_default_inclusion(cli_group: ClinkrGroup) -> None:
    ctx = _list_context(
        branches=("master", "feat/a"),
        tracked_paths_by_ref_path={
            ("refs/heads/feat/a", ".asdl/objectives"): (".asdl/objectives/alpha/objective.md",),
        },
        path_touch_by_ref_path={
            ("master..feat/a", ".asdl/objectives/alpha"): _touch(
                "a-alpha", "2026-05-20T10:44:08-04:00"
            ),
        },
    )

    default_result = _invoke_list_json(cli_group, ctx)
    active_result = _invoke_list_json(cli_group, ctx, status="active")
    open_result = _invoke_list_json(cli_group, ctx, status="open")
    in_flight_result = _invoke_list_json(cli_group, ctx, status="in-flight")

    assert default_result.exit_code == 0, default_result.output
    assert active_result.exit_code == 0, active_result.output
    assert open_result.exit_code == 0, open_result.output
    assert in_flight_result.exit_code == 0, in_flight_result.output
    default_group = json.loads(default_result.output)["data"]["groups"][0]
    assert default_group["slug"] == "alpha"
    assert default_group["status"] == "in-flight"
    assert default_group["status_source_entry"] == {
        "branch": "master",
        "status": "in-flight",
        "updated_iso": None,
        "present": False,
    }
    assert [group["slug"] for group in json.loads(active_result.output)["data"]["groups"]] == [
        "alpha"
    ]
    assert json.loads(open_result.output)["data"]["groups"] == []
    assert [group["slug"] for group in json.loads(in_flight_result.output)["data"]["groups"]] == [
        "alpha"
    ]

    human = _invoke_list_human(cli_group, ctx)
    assert human.exit_code == 0, human.output
    assert "◇ in-flight" in human.output


def test_objective_list_base_status_wins_over_work_branch_status(
    cli_group: ClinkrGroup,
) -> None:
    ctx = _list_context(
        branches=("master", "feat/a"),
        tracked_paths_by_ref_path={
            ("refs/heads/master", ".asdl/objectives"): (".asdl/objectives/alpha/objective.md",),
            ("refs/heads/feat/a", ".asdl/objectives"): (
                ".asdl/objectives/alpha/objective.md",
                ".asdl/objectives/alpha/closed.md",
            ),
        },
        path_touch_by_ref_path={
            ("master..feat/a", ".asdl/objectives/alpha"): _touch(
                "a-alpha", "2026-05-20T10:44:08-04:00"
            ),
        },
    )

    result = _invoke_list_json(cli_group, ctx)

    assert result.exit_code == 0, result.output
    group = json.loads(result.output)["data"]["groups"][0]
    assert group["status"] == "open"
    assert group["branches"][0]["status"] == "closed"

    closed_base_ctx = _list_context(
        branches=("master", "feat/a"),
        tracked_paths_by_ref_path={
            ("refs/heads/master", ".asdl/objectives"): (
                ".asdl/objectives/alpha/objective.md",
                ".asdl/objectives/alpha/closed.md",
            ),
            ("refs/heads/feat/a", ".asdl/objectives"): (".asdl/objectives/alpha/objective.md",),
        },
    )

    active_result = _invoke_list_json(cli_group, closed_base_ctx)
    closed_result = _invoke_list_json(cli_group, closed_base_ctx, status="closed")

    assert active_result.exit_code == 0, active_result.output
    assert closed_result.exit_code == 0, closed_result.output
    assert json.loads(active_result.output)["data"]["groups"] == []
    assert json.loads(closed_result.output)["data"]["groups"][0]["status"] == "closed"


def test_objective_list_sorts_groups_and_work_branch_rows(cli_group: ClinkrGroup) -> None:
    ctx = _list_context(
        branches=("master", "feat/b", "feat/a"),
        tracked_paths_by_ref_path={
            ("refs/heads/feat/a", ".asdl/objectives"): (
                ".asdl/objectives/beta/objective.md",
                ".asdl/objectives/alpha/objective.md",
            ),
            ("refs/heads/feat/b", ".asdl/objectives"): (".asdl/objectives/alpha/objective.md",),
        },
        path_touch_by_ref_path={
            ("master..feat/a", ".asdl/objectives/alpha"): _touch(
                "a-alpha", "2026-05-20T10:00:00-04:00"
            ),
            ("master..feat/b", ".asdl/objectives/alpha"): _touch(
                "b-alpha", "2026-05-20T10:00:00-04:00"
            ),
            ("master..feat/a", ".asdl/objectives/beta"): _touch(
                "a-beta", "2026-05-20T10:00:00-04:00"
            ),
        },
    )

    result = _invoke_list_json(cli_group, ctx)

    assert result.exit_code == 0, result.output
    groups = json.loads(result.output)["data"]["groups"]
    assert [group["slug"] for group in groups] == ["alpha", "beta"]
    assert [entry["branch"] for entry in groups[0]["branches"]] == ["feat/a", "feat/b"]
    assert [entry["branch"] for entry in groups[1]["branches"]] == ["feat/a"]


def test_objective_list_status_filters_active_open_in_flight_closed_and_all(
    cli_group: ClinkrGroup,
) -> None:
    ctx = _list_context(
        branches=("master", "feat/a"),
        tracked_paths_by_ref_path={
            ("refs/heads/master", ".asdl/objectives"): (
                ".asdl/objectives/closed-one/objective.md",
                ".asdl/objectives/closed-one/closed.md",
                ".asdl/objectives/open-one/objective.md",
            ),
            ("refs/heads/feat/a", ".asdl/objectives"): (
                ".asdl/objectives/in-flight-one/objective.md",
                ".asdl/objectives/open-one/objective.md",
            ),
        },
    )

    default_result = _invoke_list_json(cli_group, ctx)
    active_result = _invoke_list_json(cli_group, ctx, status="active")
    open_result = _invoke_list_json(cli_group, ctx, status="open")
    in_flight_result = _invoke_list_json(cli_group, ctx, status="in-flight")
    closed_result = _invoke_list_json(cli_group, ctx, status="closed")
    all_result = _invoke_list_json(cli_group, ctx, status="all")

    assert default_result.exit_code == 0, default_result.output
    assert active_result.exit_code == 0, active_result.output
    assert open_result.exit_code == 0, open_result.output
    assert in_flight_result.exit_code == 0, in_flight_result.output
    assert closed_result.exit_code == 0, closed_result.output
    assert all_result.exit_code == 0, all_result.output
    assert json.loads(default_result.output)["data"]["status_filter"] == "active"
    assert [group["slug"] for group in json.loads(default_result.output)["data"]["groups"]] == [
        "in-flight-one",
        "open-one",
    ]
    assert [group["slug"] for group in json.loads(active_result.output)["data"]["groups"]] == [
        "in-flight-one",
        "open-one",
    ]
    assert [group["slug"] for group in json.loads(open_result.output)["data"]["groups"]] == [
        "open-one"
    ]
    assert [group["slug"] for group in json.loads(in_flight_result.output)["data"]["groups"]] == [
        "in-flight-one"
    ]
    assert [group["slug"] for group in json.loads(closed_result.output)["data"]["groups"]] == [
        "closed-one"
    ]
    assert [group["slug"] for group in json.loads(all_result.output)["data"]["groups"]] == [
        "closed-one",
        "in-flight-one",
        "open-one",
    ]


def test_objective_list_latest_update_uses_objective_path_touch_not_branch_head(
    cli_group: ClinkrGroup,
) -> None:
    ctx = _list_context(
        branches=("master", "feat/a", "feat/b"),
        tracked_paths_by_ref_path={
            ("refs/heads/master", ".asdl/objectives"): (".asdl/objectives/alpha/objective.md",),
            ("refs/heads/feat/a", ".asdl/objectives"): (".asdl/objectives/alpha/objective.md",),
            ("refs/heads/feat/b", ".asdl/objectives"): (".asdl/objectives/alpha/objective.md",),
        },
        branch_head_iso_by_branch={
            "feat/a": "2026-05-21T12:00:00-04:00",
            "feat/b": "2026-05-20T12:00:00-04:00",
        },
        path_touch_by_ref_path={
            ("refs/heads/master", ".asdl/objectives/alpha"): _touch(
                "base-alpha", "2026-05-20T08:00:00-04:00"
            ),
            ("master..feat/a", ".asdl/objectives/alpha"): _touch(
                "a-alpha", "2026-05-20T09:00:00-04:00"
            ),
            ("master..feat/b", ".asdl/objectives/alpha"): _touch(
                "b-alpha", "2026-05-20T11:00:00-04:00"
            ),
        },
    )

    result = _invoke_list_json(cli_group, ctx)

    assert result.exit_code == 0, result.output
    group = json.loads(result.output)["data"]["groups"][0]
    assert group["latest_work_branch"] == "feat/b"
    assert group["latest_update_iso"] == "2026-05-20T11:00:00-04:00"


def test_objective_list_latest_work_blank_when_latest_update_is_on_base(
    cli_group: ClinkrGroup,
) -> None:
    ctx = _list_context(
        branches=("master", "feat/old"),
        tracked_paths_by_ref_path={
            ("refs/heads/master", ".asdl/objectives"): (".asdl/objectives/alpha/objective.md",),
            ("refs/heads/feat/old", ".asdl/objectives"): (".asdl/objectives/alpha/objective.md",),
        },
        path_touch_by_ref_path={
            ("refs/heads/master", ".asdl/objectives/alpha"): _touch(
                "base-alpha", "2026-05-20T12:00:00-04:00"
            ),
            ("master..feat/old", ".asdl/objectives/alpha"): _touch(
                "old-alpha", "2026-05-20T09:00:00-04:00"
            ),
        },
        commit_count_by_range={"master..feat/old": 2},
    )

    result = _invoke_list_json(cli_group, ctx)
    markdown = _invoke_list_md(cli_group, ctx)

    assert result.exit_code == 0, result.output
    group = json.loads(result.output)["data"]["groups"][0]
    assert group["latest_update_iso"] == "2026-05-20T12:00:00-04:00"
    assert group["latest_work_branch"] is None
    assert len(group["branches"]) == 1
    assert markdown.exit_code == 0, markdown.output
    assert "| alpha | ○ open | — |" in markdown.output


def test_objective_list_latest_work_tie_break_uses_nearest_branch(
    cli_group: ClinkrGroup,
) -> None:
    ctx = _list_context(
        branches=("master", "feat/b", "feat/a"),
        tracked_paths_by_ref_path={
            ("refs/heads/master", ".asdl/objectives"): (".asdl/objectives/alpha/objective.md",),
            ("refs/heads/feat/a", ".asdl/objectives"): (".asdl/objectives/alpha/objective.md",),
            ("refs/heads/feat/b", ".asdl/objectives"): (".asdl/objectives/alpha/objective.md",),
        },
        path_touch_by_ref_path={
            ("refs/heads/master", ".asdl/objectives/alpha"): _touch(
                "base-alpha", "2026-05-20T08:00:00-04:00"
            ),
            ("master..feat/a", ".asdl/objectives/alpha"): _touch(
                "shared-alpha", "2026-05-20T10:44:08-04:00"
            ),
            ("master..feat/b", ".asdl/objectives/alpha"): _touch(
                "shared-alpha", "2026-05-20T10:44:08-04:00"
            ),
        },
        commit_count_by_range={
            "shared-alpha..feat/a": 0,
            "shared-alpha..feat/b": 3,
        },
    )

    result = _invoke_list_json(cli_group, ctx)

    assert result.exit_code == 0, result.output
    assert json.loads(result.output)["data"]["groups"][0]["latest_work_branch"] == "feat/a"


def test_objective_list_latest_work_tie_break_uses_branch_name_after_distance(
    cli_group: ClinkrGroup,
) -> None:
    ctx = _list_context(
        branches=("master", "feat/b", "feat/a"),
        tracked_paths_by_ref_path={
            ("refs/heads/master", ".asdl/objectives"): (".asdl/objectives/alpha/objective.md",),
            ("refs/heads/feat/a", ".asdl/objectives"): (".asdl/objectives/alpha/objective.md",),
            ("refs/heads/feat/b", ".asdl/objectives"): (".asdl/objectives/alpha/objective.md",),
        },
        path_touch_by_ref_path={
            ("refs/heads/master", ".asdl/objectives/alpha"): _touch(
                "base-alpha", "2026-05-20T08:00:00-04:00"
            ),
            ("master..feat/a", ".asdl/objectives/alpha"): _touch(
                "shared-alpha", "2026-05-20T10:44:08-04:00"
            ),
            ("master..feat/b", ".asdl/objectives/alpha"): _touch(
                "shared-alpha", "2026-05-20T10:44:08-04:00"
            ),
        },
        commit_count_by_range={
            "shared-alpha..feat/a": 2,
            "shared-alpha..feat/b": 2,
        },
    )

    markdown = _invoke_list_md(cli_group, ctx)

    assert markdown.exit_code == 0, markdown.output
    assert "| alpha | ○ open | `feat/a` |" in markdown.output
    assert "`feat/b`" not in markdown.output


def test_objective_list_human_keeps_status_column_with_long_names(
    cli_group: ClinkrGroup,
) -> None:
    updated_iso = "2026-05-20T10:44:08-04:00"
    ctx = _list_context(
        branches=(
            "master",
            "add-objective-status-column-and-filter",
            "stack-impl-e2e-smoke-test/extend-fixture",
            "add-objective-stack-impl-command-and-planning-workflow",
        ),
        tracked_paths_by_ref_path={
            ("refs/heads/master", ".asdl/objectives"): (
                ".asdl/objectives/architecture-deepening/objective.md",
                ".asdl/objectives/brmem-handoff-workflow/objective.md",
            ),
            ("refs/heads/add-objective-status-column-and-filter", ".asdl/objectives"): (
                ".asdl/objectives/architecture-deepening/objective.md",
                ".asdl/objectives/architecture-deepening/closed.md",
                ".asdl/objectives/brmem-handoff-workflow/objective.md",
            ),
            ("refs/heads/stack-impl-e2e-smoke-test/extend-fixture", ".asdl/objectives"): (
                ".asdl/objectives/pi-extension-architecture-deepening/objective.md",
            ),
            (
                "refs/heads/add-objective-stack-impl-command-and-planning-workflow",
                ".asdl/objectives",
            ): (
                ".asdl/objectives/asdl-stack-run-extension/objective.md",
                ".asdl/objectives/asdl-stack-run-extension/closed.md",
            ),
        },
        path_touch_by_ref_path={
            ("refs/heads/master", ".asdl/objectives/architecture-deepening"): _touch(
                "base-architecture", updated_iso
            ),
            (
                "master..add-objective-status-column-and-filter",
                ".asdl/objectives/architecture-deepening",
            ): _touch("work-architecture", updated_iso),
        },
        commit_count_by_range={
            "master..add-objective-status-column-and-filter": 13,
            "master..stack-impl-e2e-smoke-test/extend-fixture": 13,
            "master..add-objective-stack-impl-command-and-planning-workflow": 8,
        },
    )

    human = _invoke_list_human(cli_group, ctx, status="all", terminal_columns=120)

    assert human.exit_code == 0, human.output
    assert "Status" in human.output
    assert "✓ closed" in human.output or "◇ in-flight" in human.output
    assert "○ open" in human.output


def test_objective_list_base_only_objective_and_work_branches(cli_group: ClinkrGroup) -> None:
    ctx = _list_context(
        branches=("master", "feat/active", "feat/empty"),
        tracked_paths_by_ref_path={
            ("refs/heads/master", ".asdl/objectives"): (
                ".asdl/objectives/alpha/objective.md",
                ".asdl/objectives/base-only/objective.md",
            ),
            ("refs/heads/feat/active", ".asdl/objectives"): (
                ".asdl/objectives/alpha/objective.md",
            ),
        },
        path_touch_by_ref_path={
            ("master..feat/active", ".asdl/objectives/alpha"): _touch(
                "active-alpha", "2026-05-20T10:00:00-04:00"
            ),
        },
    )

    result = _invoke_list_json(cli_group, ctx)

    assert result.exit_code == 0, result.output
    groups = json.loads(result.output)["data"]["groups"]
    group_branches = [
        (group["slug"], [entry["branch"] for entry in group["branches"]]) for group in groups
    ]
    assert group_branches == [
        ("alpha", ["feat/active"]),
        ("base-only", []),
    ]

    human = _invoke_list_human(cli_group, ctx, view="detail")
    assert human.exit_code == 0, human.output
    assert "Base branch: master — ○ open" in human.output
    assert "feat/active" in human.output
    assert "feat/empty" not in human.output


def test_objective_list_counts_only_branches_whose_local_slice_updates_objective(
    cli_group: ClinkrGroup,
) -> None:
    ctx = _list_context(
        branches=("master", "feat/base-update", "feat/child-no-update", "feat/child-update"),
        tracked_paths_by_ref_path={
            ("refs/heads/master", ".asdl/objectives"): (".asdl/objectives/alpha/objective.md",),
            ("refs/heads/feat/base-update", ".asdl/objectives"): (
                ".asdl/objectives/alpha/objective.md",
            ),
            ("refs/heads/feat/child-no-update", ".asdl/objectives"): (
                ".asdl/objectives/alpha/objective.md",
            ),
            ("refs/heads/feat/child-update", ".asdl/objectives"): (
                ".asdl/objectives/alpha/objective.md",
            ),
        },
        path_touch_by_ref_path={
            ("refs/heads/master", ".asdl/objectives/alpha"): _touch(
                "base-alpha", "2026-05-20T09:00:00-04:00"
            ),
            ("master..feat/base-update", ".asdl/objectives/alpha"): _touch(
                "base-update-alpha", "2026-05-20T10:00:00-04:00"
            ),
            ("feat/child-no-update..feat/child-update", ".asdl/objectives/alpha"): _touch(
                "child-update-alpha", "2026-05-20T11:00:00-04:00"
            ),
        },
        ancestors=(
            ("feat/base-update", "feat/child-no-update"),
            ("feat/base-update", "feat/child-update"),
            ("feat/child-no-update", "feat/child-update"),
        ),
        commit_count_by_range={
            "master..feat/base-update": 2,
            "master..feat/child-no-update": 5,
            "master..feat/child-update": 6,
            "feat/base-update..feat/child-no-update": 3,
            "feat/base-update..feat/child-update": 4,
            "feat/child-no-update..feat/child-update": 1,
        },
    )

    result = _invoke_list_json(cli_group, ctx)
    detail = _invoke_list_md(cli_group, ctx, view="detail")

    assert result.exit_code == 0, result.output
    groups = {group["slug"]: group for group in json.loads(result.output)["data"]["groups"]}
    assert groups["alpha"]["branches"] == [
        {
            "branch": "feat/base-update",
            "parent_branch": "master",
            "status": "open",
            "updated_iso": "2026-05-20T10:00:00-04:00",
            "slice_commits": 2,
        },
        {
            "branch": "feat/child-update",
            "parent_branch": "feat/child-no-update",
            "status": "open",
            "updated_iso": "2026-05-20T11:00:00-04:00",
            "slice_commits": 1,
        },
    ]
    assert [entry["branch"] for entry in groups["alpha"]["branches"]] == [
        "feat/base-update",
        "feat/child-update",
    ]
    assert groups["alpha"]["latest_work_branch"] == "feat/child-update"
    assert detail.exit_code == 0, detail.output
    assert "| branch | parent | branch status | update age | slice commits |" in detail.output
    assert "| `feat/base-update` | `master` | ○ open |" in detail.output
    assert "| `feat/child-update` | `feat/child-no-update` | ○ open |" in detail.output


def test_objective_list_default_human_and_markdown_are_list_view(
    cli_group: ClinkrGroup,
) -> None:
    ctx = _list_context(
        branches=("master", "feat/a"),
        tracked_paths_by_ref_path={
            ("refs/heads/master", ".asdl/objectives"): (".asdl/objectives/alpha/objective.md",),
            ("refs/heads/feat/a", ".asdl/objectives"): (".asdl/objectives/alpha/objective.md",),
        },
        path_touch_by_ref_path={
            ("refs/heads/master", ".asdl/objectives/alpha"): _touch(
                "base-alpha", "2026-05-20T09:00:00-04:00"
            ),
            ("master..feat/a", ".asdl/objectives/alpha"): _touch(
                "a-alpha", "2026-05-20T10:44:08-04:00"
            ),
        },
        commit_count_by_range={"master..feat/a": 7},
    )

    human = _invoke_list_human(cli_group, ctx, terminal_columns=120)

    assert human.exit_code == 0, human.output
    assert "Objective status in this local repository" in human.output
    assert "Base branch: master" in human.output
    assert "Status filter: active" in human.output
    assert "Objective" in human.output
    assert "Status" in human.output
    assert "Latest work" in human.output
    assert "Latest update" in human.output
    assert "Work branches" in human.output
    assert "Max slice commits" in human.output
    assert "○ open" in human.output
    assert "alpha" in human.output
    assert "feat/a" in human.output
    assert "+7" in human.output
    assert "Tip age" not in human.output
    assert "Latest branch" not in human.output
    assert "Latest tip" not in human.output

    markdown = _invoke_list_md(cli_group, ctx)
    assert markdown.exit_code == 0, markdown.output
    assert "# Objective status in this local repository" in markdown.output
    assert "Base branch: `master`" in markdown.output
    assert "Status filter: `active`" in markdown.output
    assert (
        "| objective | status | latest work | latest update | work branches | max slice commits |"
        in markdown.output
    )
    assert "| alpha | ○ open | `feat/a` |" in markdown.output
    assert "+7" in markdown.output


def test_objective_list_detail_human_and_markdown_column_shape(
    cli_group: ClinkrGroup,
) -> None:
    ctx = _list_context(
        branches=("master", "feat/a"),
        tracked_paths_by_ref_path={
            ("refs/heads/master", ".asdl/objectives"): (".asdl/objectives/alpha/objective.md",),
            ("refs/heads/feat/a", ".asdl/objectives"): (".asdl/objectives/alpha/objective.md",),
        },
        path_touch_by_ref_path={
            ("refs/heads/master", ".asdl/objectives/alpha"): _touch(
                "base-alpha", "2026-05-20T09:00:00-04:00"
            ),
            ("master..feat/a", ".asdl/objectives/alpha"): _touch(
                "a-alpha", "2026-05-20T10:44:08-04:00"
            ),
        },
        commit_count_by_range={"master..feat/a": 7},
    )

    human = _invoke_list_human(cli_group, ctx, view="detail")

    assert human.exit_code == 0, human.output
    assert "Objective branch details in this local repository" in human.output
    assert "Base branch: master" in human.output
    assert "alpha" in human.output
    assert "Base branch: master — ○ open — updated" in human.output
    assert "Work branches" in human.output
    assert "Parent" in human.output
    assert "Branch status" in human.output
    assert "Update age" in human.output
    assert "Slice commits" in human.output
    assert "feat/a" in human.output
    assert "+7" in human.output
    assert "Ahead trunk" not in human.output
    assert "Tip age" not in human.output

    markdown = _invoke_list_md(cli_group, ctx, view="detail")
    assert markdown.exit_code == 0, markdown.output
    assert "# Objective branch details in this local repository" in markdown.output
    assert "Base branch: `master`" in markdown.output
    assert "Base branch: master — ○ open — updated" in markdown.output
    assert "| branch | parent | branch status | update age | slice commits |" in markdown.output
    assert "| `feat/a` | `master` | ○ open |" in markdown.output


def test_objective_list_current_uses_current_status_source_and_filters_to_current(
    cli_group: ClinkrGroup,
) -> None:
    ctx = _list_context(
        branches=("master", "feat/here", "feat/other"),
        current_branch="feat/here",
        tracked_paths_by_ref_path={
            ("refs/heads/feat/here", ".asdl/objectives"): (".asdl/objectives/alpha/objective.md",),
            ("refs/heads/feat/other", ".asdl/objectives"): (".asdl/objectives/beta/objective.md",),
        },
        path_touch_by_ref_path={
            ("refs/heads/feat/here", ".asdl/objectives/alpha"): _touch(
                "here-alpha", "2026-05-20T10:44:08-04:00"
            ),
            ("master..feat/here", ".asdl/objectives/alpha"): _touch(
                "here-alpha", "2026-05-20T10:44:08-04:00"
            ),
        },
    )

    result = _invoke_list_json(cli_group, ctx, current=True)
    human = _invoke_list_human(cli_group, ctx, current=True)

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["filtered_to_current"] is True
    assert data["status_source"] == "current"
    assert data["status_source_branch"] == "feat/here"
    assert data["current_branch"] == "feat/here"
    assert [(group["slug"], group["status"]) for group in data["groups"]] == [("alpha", "open")]
    assert data["groups"][0]["status_source_entry"]["branch"] == "feat/here"
    assert data["groups"][0]["status_source_entry"]["present"] is True
    assert data["groups"][0]["latest_work_branch"] == "feat/here"
    assert human.exit_code == 0, human.output
    assert "Objective status for current branch `feat/here`" in human.output
    assert "Status source: current branch" in human.output
    assert "◇ in-flight" not in human.output


def test_objective_list_current_inherited_objective_has_no_work_branch_row(
    cli_group: ClinkrGroup,
) -> None:
    ctx = _list_context(
        branches=("master", "feat/here"),
        current_branch="feat/here",
        tracked_paths_by_ref_path={
            ("refs/heads/master", ".asdl/objectives"): (".asdl/objectives/alpha/objective.md",),
            ("refs/heads/feat/here", ".asdl/objectives"): (".asdl/objectives/alpha/objective.md",),
        },
        path_touch_by_ref_path={
            ("refs/heads/feat/here", ".asdl/objectives/alpha"): _touch(
                "base-alpha", "2026-05-20T09:00:00-04:00"
            ),
        },
    )

    result = _invoke_list_json(cli_group, ctx, current=True)

    assert result.exit_code == 0, result.output
    group = json.loads(result.output)["data"]["groups"][0]
    assert group["slug"] == "alpha"
    assert group["branches"] == []
    assert group["latest_update_iso"] == "2026-05-20T09:00:00-04:00"
    assert group["latest_work_branch"] is None


def test_objective_list_current_empty_when_branch_unrelated(cli_group: ClinkrGroup) -> None:
    ctx = _list_context(
        branches=("master", "feat/here", "feat/other"),
        current_branch="feat/here",
        tracked_paths_by_ref_path={
            ("refs/heads/feat/other", ".asdl/objectives"): (".asdl/objectives/beta/objective.md",),
        },
    )

    result = _invoke_list_json(cli_group, ctx, current=True)

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["filtered_to_current"] is True
    assert data["status_source"] == "current"
    assert data["status_source_branch"] == "feat/here"
    assert data["current_branch"] == "feat/here"
    assert data["groups"] == []

    human = _invoke_list_human(cli_group, ctx, current=True)
    assert human.exit_code == 0, human.output
    assert "No active Objectives associated with current branch" in human.output
    assert "feat/here" in human.output


def test_objective_list_current_includes_trunk_when_current_branch_is_trunk(
    cli_group: ClinkrGroup,
) -> None:
    ctx = _list_context(
        branches=("master", "feat/other"),
        current_branch="master",
        tracked_paths_by_ref_path={
            ("refs/heads/master", ".asdl/objectives"): (".asdl/objectives/alpha/objective.md",),
            ("refs/heads/feat/other", ".asdl/objectives"): (".asdl/objectives/beta/objective.md",),
        },
    )

    result = _invoke_list_json(cli_group, ctx, current=True)

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["current_branch"] == "master"
    assert data["status_source"] == "current"
    group_sources = [
        (group["slug"], group["status_source_entry"]["branch"]) for group in data["groups"]
    ]
    assert group_sources == [("alpha", "master")]
    assert data["groups"][0]["branches"] == []


def test_objective_list_current_detached_head_is_empty(cli_group: ClinkrGroup) -> None:
    ctx = _list_context(
        branches=("master", "feat/a"),
        current_branch=DetachedHead(),
        tracked_paths_by_ref_path={
            ("refs/heads/feat/a", ".asdl/objectives"): (".asdl/objectives/alpha/objective.md",),
        },
    )

    result = _invoke_list_json(cli_group, ctx, current=True)

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["filtered_to_current"] is True
    assert data["status_source"] == "current"
    assert data["status_source_branch"] is None
    assert data["current_branch"] is None
    assert data["status_filter"] == "active"
    assert data["groups"] == []

    human = _invoke_list_human(cli_group, ctx, current=True)
    assert human.exit_code == 0, human.output
    assert "detached head" in human.output.lower()
    assert "active Objectives" in human.output


def test_objective_list_names_outputs_slugs_one_per_line(cli_group: ClinkrGroup) -> None:
    ctx = _list_context(
        branches=("master", "feat/a", "feat/b"),
        tracked_paths_by_ref_path={
            ("refs/heads/feat/a", ".asdl/objectives"): (".asdl/objectives/alpha/objective.md",),
            ("refs/heads/feat/b", ".asdl/objectives"): (".asdl/objectives/beta/objective.md",),
        },
    )

    result = _invoke_list_human(cli_group, ctx, names=True)

    assert result.exit_code == 0, result.output
    lines = [line for line in result.output.splitlines() if line.strip()]
    assert lines == ["alpha", "beta"]
    assert "Objective" not in result.output
    assert "Latest work" not in result.output
    assert "Latest update" not in result.output


def test_objective_list_names_respects_status_filter(cli_group: ClinkrGroup) -> None:
    ctx = _list_context(
        branches=("master", "feat/a"),
        tracked_paths_by_ref_path={
            ("refs/heads/master", ".asdl/objectives"): (
                ".asdl/objectives/closed-one/objective.md",
                ".asdl/objectives/closed-one/closed.md",
                ".asdl/objectives/open-one/objective.md",
            ),
            ("refs/heads/feat/a", ".asdl/objectives"): (
                ".asdl/objectives/in-flight-one/objective.md",
            ),
        },
    )

    default_result = _invoke_list_human(cli_group, ctx, names=True)
    open_result = _invoke_list_human(cli_group, ctx, names=True, status="open")
    in_flight_result = _invoke_list_human(cli_group, ctx, names=True, status="in-flight")
    closed_result = _invoke_list_human(cli_group, ctx, names=True, status="closed")

    assert default_result.exit_code == 0, default_result.output
    assert open_result.exit_code == 0, open_result.output
    assert in_flight_result.exit_code == 0, in_flight_result.output
    assert closed_result.exit_code == 0, closed_result.output
    assert [line for line in default_result.output.splitlines() if line.strip()] == [
        "in-flight-one",
        "open-one",
    ]
    assert [line for line in open_result.output.splitlines() if line.strip()] == ["open-one"]
    assert [line for line in in_flight_result.output.splitlines() if line.strip()] == [
        "in-flight-one"
    ]
    assert [line for line in closed_result.output.splitlines() if line.strip()] == ["closed-one"]


def test_objective_list_names_with_current_filters_then_emits_slugs(
    cli_group: ClinkrGroup,
) -> None:
    ctx = _list_context(
        branches=("master", "feat/here", "feat/other"),
        current_branch="feat/here",
        tracked_paths_by_ref_path={
            ("refs/heads/feat/here", ".asdl/objectives"): (".asdl/objectives/alpha/objective.md",),
            ("refs/heads/feat/other", ".asdl/objectives"): (".asdl/objectives/beta/objective.md",),
        },
    )

    result = _invoke_list_human(cli_group, ctx, current=True, names=True)

    assert result.exit_code == 0, result.output
    lines = [line for line in result.output.splitlines() if line.strip()]
    assert lines == ["alpha"]


def test_objective_list_names_markdown_also_emits_slugs(cli_group: ClinkrGroup) -> None:
    ctx = _list_context(
        branches=("master", "feat/a"),
        tracked_paths_by_ref_path={
            ("refs/heads/feat/a", ".asdl/objectives"): (".asdl/objectives/alpha/objective.md",),
        },
    )

    result = _invoke_list_md(cli_group, ctx, names=True)

    assert result.exit_code == 0, result.output
    lines = [line for line in result.output.splitlines() if line.strip()]
    assert lines == ["alpha"]
    assert "|" not in result.output


def test_objective_list_names_json_skips_branch_slices_and_touches(
    cli_group: ClinkrGroup,
) -> None:
    ctx = _list_context(
        branches=("master", "feat/a"),
        tracked_paths_by_ref_path={
            ("refs/heads/master", ".asdl/objectives"): (".asdl/objectives/beta/objective.md",),
            ("refs/heads/feat/a", ".asdl/objectives"): (".asdl/objectives/alpha/objective.md",),
        },
    )

    result = _invoke_list_json(cli_group, ctx, names=True)

    assert result.exit_code == 0, result.output
    assert json.loads(result.output)["data"]["groups"] == [
        {
            "slug": "alpha",
            "status": "in-flight",
            "status_source_entry": {
                "branch": "master",
                "status": "in-flight",
                "updated_iso": None,
                "present": False,
            },
            "branches": [],
            "latest_update_iso": None,
            "latest_work_branch": None,
        },
        {
            "slug": "beta",
            "status": "open",
            "status_source_entry": {
                "branch": "master",
                "status": "open",
                "updated_iso": None,
                "present": True,
            },
            "branches": [],
            "latest_update_iso": None,
            "latest_work_branch": None,
        },
    ]
    fake_git = _fake_git(ctx)
    assert fake_git.path_last_touched_calls == ()
    assert fake_git.count_commits_in_range_calls == ()
    assert fake_git.list_branches_merged_into_calls == ()


def test_objective_list_empty_projection_skips_branch_slices_and_touches(
    cli_group: ClinkrGroup,
) -> None:
    ctx = _list_context(
        branches=("master", "feat/a"),
        tracked_paths_by_ref_path={
            ("refs/heads/master", ".asdl/objectives"): (".asdl/objectives/open-one/objective.md",),
            ("refs/heads/feat/a", ".asdl/objectives"): (
                ".asdl/objectives/in-flight-one/objective.md",
            ),
        },
    )

    result = _invoke_list_json(cli_group, ctx, status="closed")

    assert result.exit_code == 0, result.output
    assert json.loads(result.output)["data"]["groups"] == []
    fake_git = _fake_git(ctx)
    assert fake_git.path_last_touched_calls == ()
    assert fake_git.count_commits_in_range_calls == ()
    assert fake_git.list_branches_merged_into_calls == ()


def test_objective_list_unavailable_context_returns_failure_envelope(
    cli_group: ClinkrGroup,
) -> None:
    result = _invoke_list_json(
        cli_group,
        ObjectiveCliUnavailable("Not inside a git repository."),
    )

    assert result.exit_code == 2
    assert json.loads(result.output) == {
        "exit_code": 2,
        "error_type": "not_in_repo",
        "message": "Not inside a git repository.",
    }


def test_objective_exec_is_hidden_but_invocable(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "--help"])

    assert result.exit_code == 0
    assert "Usage: objective exec" in result.output
    assert "Commands for use by objective skills." in result.output
    assert "runner-subagent-usage" in result.output
    assert "read-objective" in result.output

    result = CliRunner().invoke(cli_group, ["exec", "read-objective", "--help"])

    assert result.exit_code == 0
    assert "Usage: objective exec read-objective" in result.output
    assert "Read one Objective record by explicit slug" in result.output


def test_objective_exec_runner_subagent_usage_json(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    session_file = tmp_path / "slice.jsonl"
    _write_runner_subagent_jsonl(session_file)

    result = CliRunner().invoke(
        cli_group,
        ["exec", "runner-subagent-usage", str(session_file), "--format", "json"],
        obj=build_clinkr_context_object(lambda: object()),
    )

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["exit_code"] == 0
    session = payload["data"]["sessions"][0]
    assert session["session_file"] == str(session_file)
    assert session["status"] == "ok"
    assert session["assistant_response_count"] == 1
    assert session["models"] == [
        {"provider": "openai-codex", "api": "responses", "model": "gpt-5.5"}
    ]
    assert session["tokens"] == {
        "input_tokens": 100,
        "output_tokens": 20,
        "cache_read_tokens": 30,
        "cache_write_tokens": 0,
        "total_tokens": 150,
    }
    assert payload["data"]["aggregate"]["usage_response_count"] == 1
    assert payload["data"]["aggregate"]["cost"]["total_usd"] == 0.006


def test_objective_exec_runner_subagent_usage_markdown(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    session_file = tmp_path / "slice.jsonl"
    _write_runner_subagent_jsonl(session_file)

    result = CliRunner().invoke(
        cli_group,
        ["exec", "runner-subagent-usage", str(session_file), "--format", "md"],
    )

    assert result.exit_code == 0, result.output
    assert "# Runner Subagent Usage" in result.output
    assert (
        "| session | status | responses | model(s) | input | output | cache read |" in result.output
    )
    assert str(session_file) in result.output
    assert "openai-codex/responses/gpt-5.5" in result.output
    assert "| 100 | 20 | 30 | 0 | 150 | 150 | 130 | $0.006000 |" in result.output
    assert "## Aggregate" in result.output
    assert "- sessions: 1 total, 1 with usage" in result.output
    assert "- configured context window: unavailable in runner subagent logs" in result.output
    assert "- cost: $0.006000" in result.output


def test_objective_exec_runner_subagent_usage_no_args_is_negative(
    cli_group: ClinkrGroup,
) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "runner-subagent-usage"])

    assert result.exit_code == 1
    assert "Missing session file" in result.stderr
    assert "missing_session_file" in result.output

    json_result = CliRunner().invoke(
        cli_group,
        ["exec", "runner-subagent-usage", "--format", "json"],
        obj=build_clinkr_context_object(lambda: object()),
    )
    assert json_result.exit_code == 1
    payload = json.loads(json_result.output)
    assert "missing_session_file" in payload["message"]
    assert payload["data"]["sessions"] == []


def test_objective_exec_runner_subagent_usage_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "runner-subagent-usage", "--help"])

    assert result.exit_code == 0
    assert "Usage: objective exec runner-subagent-usage" in result.output
    assert "Summarize Pi runner subagent JSONL usage telemetry" in result.output


def test_objective_exec_read_missing_slug_returns_stable_json(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)

    result = _invoke_read_json(cli_group)

    assert result.exit_code == 1
    assert "Usage:" not in result.output
    assert "Usage:" not in result.stderr
    assert json.loads(result.output) == {
        "exit_code": 1,
        "message": "Missing Objective slug. Pass an explicit slug.",
        "data": _empty_read_data(status="missing_slug", error="missing_slug"),
    }


@pytest.mark.parametrize("slug", ("foo/bar", ".asdl/objectives/foo", ".", ".."))
def test_objective_exec_read_rejects_path_shaped_slug(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    slug: str,
) -> None:
    monkeypatch.chdir(tmp_path)

    result = _invoke_read_json(cli_group, slug)

    assert result.exit_code == 1
    assert json.loads(result.output) == {
        "exit_code": 1,
        "message": f"Invalid Objective slug {slug!r}. Pass a single slug, not a path.",
        "data": _empty_read_data(status="invalid_slug", error="invalid_slug"),
    }


def test_objective_exec_read_absent_record_returns_facts(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)

    result = _invoke_read_json(cli_group, "ghost")

    assert result.exit_code == 1
    assert json.loads(result.output) == {
        "exit_code": 1,
        "message": "No Objective record found for slug 'ghost'.",
        "data": _empty_read_data(
            status="not_found",
            error="not_found",
            slug="ghost",
            path=".asdl/objectives/ghost",
        ),
    }


def test_objective_exec_read_complete_open_record_json(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    root = tmp_path / ".asdl" / "objectives"
    _write_objective(root, "alpha", updates=("second.md", "first.md"))

    result = _invoke_read_json(cli_group, "alpha")

    assert result.exit_code == 0, result.output
    assert json.loads(result.output) == {
        "exit_code": 0,
        "data": {
            "status": "ok",
            "error": None,
            "root_path": ".asdl/objectives",
            "root_exists": True,
            "slug": "alpha",
            "path": ".asdl/objectives/alpha",
            "exists": True,
            "closed": False,
            "files": {
                "objective_md": True,
                "roadmap_md": True,
                "updates_dir": True,
                "closed_md": False,
            },
            "updates": [
                {
                    "name": "first.md",
                    "path": ".asdl/objectives/alpha/updates/first.md",
                },
                {
                    "name": "second.md",
                    "path": ".asdl/objectives/alpha/updates/second.md",
                },
            ],
            "update_count": 2,
        },
    }


def test_objective_exec_read_closed_record_json(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    root = tmp_path / ".asdl" / "objectives"
    _write_objective(root, "done", closed=True)

    result = _invoke_read_json(cli_group, "done")

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["closed"] is True
    assert data["files"]["closed_md"] is True


def test_objective_exec_read_incomplete_record_json_succeeds(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    root = tmp_path / ".asdl" / "objectives"
    (root / "partial").mkdir(parents=True)

    result = _invoke_read_json(cli_group, "partial")

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["files"] == {
        "objective_md": False,
        "roadmap_md": False,
        "updates_dir": False,
        "closed_md": False,
    }
    assert data["updates"] == []
    assert data["update_count"] == 0


def test_objective_exec_read_markdown_includes_raw_files_sorted_updates(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    record = tmp_path / ".asdl" / "objectives" / "story"
    updates_dir = record / "updates"
    updates_dir.mkdir(parents=True)
    (record / "objective.md").write_text("# Raw Objective\nbody sentinel\n", encoding="utf-8")
    (record / "roadmap.md").write_text("# Raw Roadmap\n- [ ] roadmap sentinel\n", encoding="utf-8")
    (updates_dir / "b-later.md").write_text("# Later\nlater sentinel\n", encoding="utf-8")
    (updates_dir / "a-earlier.md").write_text("# Earlier\nearlier sentinel\n", encoding="utf-8")
    (updates_dir / "notes.txt").write_text("not markdown\n", encoding="utf-8")

    result = CliRunner().invoke(cli_group, ["exec", "read-objective", "story", "--format", "md"])

    assert result.exit_code == 0, result.output
    assert "# Objective `story`" in result.output
    assert "## objective.md" in result.output
    assert "# Raw Objective\nbody sentinel" in result.output
    assert "## roadmap.md" in result.output
    assert "# Raw Roadmap\n- [ ] roadmap sentinel" in result.output
    assert result.output.index("## updates/a-earlier.md") < result.output.index(
        "## updates/b-later.md"
    )
    assert "# Earlier\nearlier sentinel" in result.output
    assert "# Later\nlater sentinel" in result.output
    assert "not markdown" not in result.output


def test_objective_exec_read_markdown_notes_missing_files(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    record = tmp_path / ".asdl" / "objectives" / "partial"
    record.mkdir(parents=True)

    result = CliRunner().invoke(cli_group, ["exec", "read-objective", "partial", "--format", "md"])

    assert result.exit_code == 0, result.output
    assert "_Missing `objective.md`._" in result.output
    assert "_Missing `roadmap.md`._" in result.output
    assert "_Missing `updates/` directory._" in result.output


def test_objective_exec_read_markdown_empty_updates_dir_note(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    root = tmp_path / ".asdl" / "objectives"
    _write_objective(root, "alpha")

    result = _invoke_read_md(cli_group, "alpha")

    assert result.exit_code == 0, result.output
    assert "_No direct update Markdown files found._" in result.output


def test_objective_exec_read_json_omits_raw_markdown_content(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    root = tmp_path / ".asdl" / "objectives"
    record = _write_objective(root, "quiet", updates=("update.md",))
    (record / "objective.md").write_text("private objective body sentinel\n", encoding="utf-8")
    (record / "roadmap.md").write_text("private roadmap body sentinel\n", encoding="utf-8")
    (record / "updates" / "update.md").write_text(
        "private update body sentinel\n",
        encoding="utf-8",
    )

    result = _invoke_read_json(cli_group, "quiet")

    assert result.exit_code == 0, result.output
    assert "private objective body sentinel" not in result.output
    assert "private roadmap body sentinel" not in result.output
    assert "private update body sentinel" not in result.output


def _touch(oid: str, committed_iso: str) -> PathTouch:
    return PathTouch(oid=oid, committed_iso=committed_iso)


def _fake_git(ctx: ObjectiveCliContext) -> FakeGitGateway:
    assert isinstance(ctx.git, FakeGitGateway)
    return ctx.git


def _list_context(
    *,
    branches: tuple[str, ...],
    trunk_branch: str = "master",
    current_branch: str | DetachedHead | GitCommandFailure | None = None,
    tracked_paths_by_ref_path: (
        dict[tuple[str, str], tuple[str, ...] | GitCommandFailure] | None
    ) = None,
    path_touch_by_ref_path: dict[tuple[str, str], PathTouch] | None = None,
    branch_head_iso_by_branch: dict[str, str] | None = None,
    ancestors: tuple[tuple[str, str], ...] = (),
    commit_count_by_range: dict[str, int | GitCommandFailure] | None = None,
) -> ObjectiveCliContext:
    repo_root = Path("/repo")
    current_by_path: dict[Path, str | DetachedHead | GitCommandFailure] | None = None
    if current_branch is not None:
        current_by_path = {repo_root: current_branch}
    return ObjectiveCliContext(
        repo_root=repo_root,
        trunk_branch=trunk_branch,
        git=FakeGitGateway(
            repo_root=repo_root,
            branches=branches,
            trunk_branch=trunk_branch,
            tracked_paths_by_ref_path=tracked_paths_by_ref_path,
            path_touch_by_ref_path=path_touch_by_ref_path,
            branch_head_iso_by_branch=branch_head_iso_by_branch,
            ancestors=ancestors,
            commit_count_by_range=commit_count_by_range,
            current_branch_by_path=current_by_path,
        ),
    )


def _invoke_list_json(
    cli_group: ClinkrGroup,
    ctx: ObjectiveCliContext | ObjectiveCliUnavailable,
    *,
    view: str | None = None,
    status: str | None = None,
    current: bool = False,
    names: bool = False,
) -> Result:
    args = _list_args(format_mode="json", view=view, status=status, current=current, names=names)
    return CliRunner().invoke(
        cli_group,
        args,
        obj=build_clinkr_context_object(lambda: ctx),
    )


def _invoke_list_human(
    cli_group: ClinkrGroup,
    ctx: ObjectiveCliContext,
    *,
    view: str | None = None,
    status: str | None = None,
    current: bool = False,
    names: bool = False,
    terminal_columns: int | None = None,
) -> Result:
    args = _list_args(view=view, status=status, current=current, names=names)
    env = None
    if terminal_columns is not None:
        env = {"COLUMNS": str(terminal_columns)}
    return CliRunner().invoke(
        cli_group,
        args,
        obj=build_clinkr_context_object(lambda: ctx),
        env=env,
    )


def _invoke_list_md(
    cli_group: ClinkrGroup,
    ctx: ObjectiveCliContext,
    *,
    view: str | None = None,
    status: str | None = None,
    current: bool = False,
    names: bool = False,
) -> Result:
    args = _list_args(format_mode="md", view=view, status=status, current=current, names=names)
    return CliRunner().invoke(
        cli_group,
        args,
        obj=build_clinkr_context_object(lambda: ctx),
    )


def _list_args(
    *,
    format_mode: str | None = None,
    view: str | None = None,
    status: str | None = None,
    current: bool = False,
    names: bool = False,
) -> list[str]:
    args = ["list"]
    if current:
        args.append("--current")
    if names:
        args.append("--names")
    if status is not None:
        args.extend(("--status", status))
    if view is not None:
        args.extend(("--view", view))
    if format_mode is not None:
        args.extend(("--format", format_mode))
    return args


def _invoke_read_json(cli_group: ClinkrGroup, slug: str | None = None) -> Result:
    args = ["exec", "read-objective"]
    if slug is not None:
        args.append(slug)
    args.extend(("--format", "json"))
    return CliRunner().invoke(
        cli_group,
        args,
        obj=build_clinkr_context_object(lambda: object()),
    )


def _invoke_read_md(cli_group: ClinkrGroup, slug: str) -> Result:
    return CliRunner().invoke(
        cli_group,
        ["exec", "read-objective", slug, "--format", "md"],
        obj=build_clinkr_context_object(lambda: object()),
    )


def _empty_read_data(
    *,
    status: str,
    error: str,
    slug: str | None = None,
    path: str | None = None,
) -> dict[str, object]:
    return {
        "status": status,
        "error": error,
        "root_path": ".asdl/objectives",
        "root_exists": False,
        "slug": slug,
        "path": path,
        "exists": False,
        "closed": False,
        "files": {
            "objective_md": False,
            "roadmap_md": False,
            "updates_dir": False,
            "closed_md": False,
        },
        "updates": [],
        "update_count": 0,
    }


def _write_runner_subagent_jsonl(path: Path) -> None:
    path.write_text(
        json.dumps(
            {
                "message": {
                    "role": "assistant",
                    "provider": "openai-codex",
                    "api": "responses",
                    "model": "gpt-5.5",
                    "usage": {
                        "input": 100,
                        "output": 20,
                        "cacheRead": 30,
                        "cacheWrite": 0,
                        "totalTokens": 150,
                        "cost": {
                            "input": 0.001,
                            "output": 0.004,
                            "cacheRead": 0.001,
                            "cacheWrite": 0.0,
                            "total": 0.006,
                        },
                    },
                }
            }
        )
        + "\n",
        encoding="utf-8",
    )


def _write_objective(
    root: Path,
    slug: str,
    *,
    closed: bool = False,
    updates: tuple[str, ...] = (),
) -> Path:
    path = root / slug
    path.mkdir(parents=True)
    (path / "objective.md").write_text(f"# {slug}\n", encoding="utf-8")
    (path / "roadmap.md").write_text("# Roadmap\n", encoding="utf-8")
    updates_dir = path / "updates"
    updates_dir.mkdir()
    for update_name in updates:
        (updates_dir / update_name).write_text("# Update\n", encoding="utf-8")
    if closed:
        (path / "closed.md").write_text("closed\n", encoding="utf-8")
    return path
