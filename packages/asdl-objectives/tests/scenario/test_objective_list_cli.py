from __future__ import annotations

import json
from pathlib import Path

import pytest
from click.testing import CliRunner, Result

from asdl_core.clinkr.context import build_clinkr_context_object
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.git.testing import FakeGitGateway
from asdl_core.git.types import GitCommandFailure, PathChangeTouch, PathTouch
from asdl_objectives.context import ObjectiveCliContext, ObjectiveCliUnavailable
from asdl_objectives.main import build_cli
from asdl_objectives.testing import change_touch, write_objective_record


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def test_objective_list_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["list", "--help"])

    assert result.exit_code == 0
    assert "Usage: objective list" in result.output
    assert "List Objective records in the current checkout" in result.output
    assert "--names" in result.output
    assert "--status" in result.output
    assert "--minimal" in result.output
    assert "--branches" not in result.output
    assert "--updated-branches" not in result.output
    assert "--current" not in result.output
    assert "--view" not in result.output
    assert "in-flight" not in result.output


def test_objective_list_empty_result(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    ctx = _list_context(repo_root=tmp_path)

    result = _invoke_list_json(cli_group, ctx)

    assert result.exit_code == 0, result.output
    assert json.loads(result.output) == {
        "exit_code": 0,
        "data": {
            "trunk_branch": "master",
            "root_path": ".asdl/objectives",
            "status_filter": "active",
            "names_only": False,
            "updated_branches_included": True,
            "records": [],
        },
    }

    human = _invoke_list_human(cli_group, ctx)
    assert human.exit_code == 0, human.output
    assert "Objective records in this checkout" in human.output
    assert "Root: .asdl/objectives" in human.output
    assert "Status filter: active" in human.output
    assert "No open Objective records found." in human.output

    all_human = _invoke_list_human(cli_group, ctx, status="all")
    open_human = _invoke_list_human(cli_group, ctx, status="open")
    closed_human = _invoke_list_human(cli_group, ctx, status="closed")
    assert all_human.exit_code == 0, all_human.output
    assert open_human.exit_code == 0, open_human.output
    assert closed_human.exit_code == 0, closed_human.output
    assert "No Objective records found." in all_human.output
    assert "No open Objective records found." in open_human.output
    assert "No closed Objective records found." in closed_human.output


def test_objective_list_open_and_closed_records_from_current_filesystem(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    active_root = tmp_path / ".asdl" / "objectives"
    write_objective_record(active_root, "open-one")
    write_objective_record(active_root, "closed-one", closed=True)
    ctx = _list_context(repo_root=tmp_path)

    default_result = _invoke_list_json(cli_group, ctx)
    closed_result = _invoke_list_json(cli_group, ctx, status="closed")
    all_result = _invoke_list_json(cli_group, ctx, status="all")

    assert default_result.exit_code == 0, default_result.output
    assert closed_result.exit_code == 0, closed_result.output
    assert all_result.exit_code == 0, all_result.output
    assert json.loads(default_result.output)["data"]["records"] == [
        {"slug": "open-one", "status": "open", "latest_update_iso": None, "updated_branches": []}
    ]
    assert json.loads(closed_result.output)["data"]["records"] == [
        {
            "slug": "closed-one",
            "status": "closed",
            "latest_update_iso": None,
            "updated_branches": [],
        }
    ]
    assert json.loads(all_result.output)["data"]["records"] == [
        {
            "slug": "closed-one",
            "status": "closed",
            "latest_update_iso": None,
            "updated_branches": [],
        },
        {"slug": "open-one", "status": "open", "latest_update_iso": None, "updated_branches": []},
    ]


def test_objective_list_includes_untracked_objective_directory(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    (tmp_path / ".asdl" / "objectives" / "new-one").mkdir(parents=True)
    ctx = _list_context(repo_root=tmp_path)

    result = _invoke_list_json(cli_group, ctx)

    assert result.exit_code == 0, result.output
    assert json.loads(result.output)["data"]["records"] == [
        {"slug": "new-one", "status": "open", "latest_update_iso": None, "updated_branches": []}
    ]


def test_objective_list_omits_archive_root_records(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    write_objective_record(tmp_path / ".asdl" / "objective-archive", "archived")
    ctx = _list_context(repo_root=tmp_path)

    result = _invoke_list_json(cli_group, ctx, status="all")

    assert result.exit_code == 0, result.output
    assert json.loads(result.output)["data"]["records"] == []


def test_objective_list_ignores_branch_only_records(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    ctx = _list_context(
        repo_root=tmp_path,
        branches=("master", "feat/a"),
        tracked_paths_by_ref_path={
            ("refs/heads/feat/a", ".asdl/objectives"): (
                ".asdl/objectives/branch-only/objective.md",
            ),
        },
    )

    result = _invoke_list_json(cli_group, ctx, status="all")

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["records"] == []
    _assert_no_branch_projection_fields(data)


def test_objective_list_latest_committed_update_from_head(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    active_root = tmp_path / ".asdl" / "objectives"
    write_objective_record(active_root, "alpha")
    write_objective_record(active_root, "beta")
    ctx = _list_context(
        repo_root=tmp_path,
        path_touch_by_ref_path={
            ("HEAD", ".asdl/objectives/alpha"): _touch(
                "alpha-touch",
                "2026-05-20T10:00:00Z",
            ),
        },
    )

    result = _invoke_list_json(cli_group, ctx, minimal=True, status="all")
    human = _invoke_list_human(cli_group, ctx, minimal=True, status="all")
    markdown = _invoke_list_md(cli_group, ctx, minimal=True, status="all")

    assert result.exit_code == 0, result.output
    assert json.loads(result.output)["data"]["records"] == [
        {
            "slug": "alpha",
            "status": "open",
            "latest_update_iso": "2026-05-20T10:00:00Z",
        },
        {"slug": "beta", "status": "open", "latest_update_iso": None},
    ]
    assert human.exit_code == 0, human.output
    assert markdown.exit_code == 0, markdown.output
    assert "ago" in human.output
    assert "ago" in markdown.output
    assert "—" in human.output
    assert "—" in markdown.output


def test_objective_list_dirty_record_json_contract_unchanged(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    write_objective_record(tmp_path / ".asdl" / "objectives", "alpha")
    ctx = _list_context(
        repo_root=tmp_path,
        uncommitted_changes_by_cwd_path={(tmp_path, ".asdl/objectives/alpha"): True},
    )

    result = _invoke_list_json(cli_group, ctx, minimal=True)

    assert result.exit_code == 0, result.output
    records = json.loads(result.output)["data"]["records"]
    assert records == [{"slug": "alpha", "status": "open", "latest_update_iso": None}]
    assert set(records[0]) == {"slug", "status", "latest_update_iso"}


def test_objective_list_dirty_record_human_and_markdown_show_marker(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    write_objective_record(tmp_path / ".asdl" / "objectives", "alpha")
    ctx = _list_context(
        repo_root=tmp_path,
        uncommitted_changes_by_cwd_path={(tmp_path, ".asdl/objectives/alpha"): True},
    )

    human = _invoke_list_human(cli_group, ctx, minimal=True)
    markdown = _invoke_list_md(cli_group, ctx, minimal=True)

    assert human.exit_code == 0, human.output
    assert markdown.exit_code == 0, markdown.output
    assert "(x)" in human.output
    assert "| alpha | ○ open | (x) — |" in markdown.output


def test_objective_list_dirty_record_names_only_stays_slug_only(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    write_objective_record(tmp_path / ".asdl" / "objectives", "alpha")
    ctx = _list_context(
        repo_root=tmp_path,
        uncommitted_changes_by_cwd_path={(tmp_path, ".asdl/objectives/alpha"): True},
    )

    result = _invoke_list_human(cli_group, ctx, names=True)

    assert result.exit_code == 0, result.output
    assert result.output == "alpha\n"


def test_objective_list_archive_or_unrelated_dirty_paths_do_not_mark_active_record(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    write_objective_record(tmp_path / ".asdl" / "objectives", "alpha")
    ctx = _list_context(
        repo_root=tmp_path,
        uncommitted_changes_by_cwd_path={
            (tmp_path, ".asdl/objective-archive/alpha"): True,
            (tmp_path, "README.md"): True,
        },
    )

    result = _invoke_list_md(cli_group, ctx)

    assert result.exit_code == 0, result.output
    assert "| alpha | ○ open | — |" in result.output
    assert "(x)" not in result.output


def test_objective_list_removed_options_and_status_reject(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    ctx = _list_context(repo_root=tmp_path)

    in_flight = _invoke_list_json(cli_group, ctx, status="in-flight")
    current = _invoke_list_json(cli_group, ctx, current=True)
    detail_view = _invoke_list_json(cli_group, ctx, view="detail")
    branches = CliRunner().invoke(
        cli_group,
        ["list", "--branches", "--format", "json"],
        obj=build_clinkr_context_object(lambda: ctx),
    )

    assert in_flight.exit_code != 0
    assert "Invalid value for '--status'" in in_flight.output
    assert "in-flight" in in_flight.output
    assert current.exit_code != 0
    assert "No such option: --current" in current.output
    assert detail_view.exit_code != 0
    assert "No such option: --view" in detail_view.output
    assert branches.exit_code != 0
    assert "No such option: --branches" in branches.output


def test_objective_list_names_outputs_filtered_slugs_only(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    active_root = tmp_path / ".asdl" / "objectives"
    write_objective_record(active_root, "open-one")
    write_objective_record(active_root, "closed-one", closed=True)
    ctx = _list_context(repo_root=tmp_path)

    default_result = _invoke_list_human(cli_group, ctx, names=True)
    closed_result = _invoke_list_human(cli_group, ctx, names=True, status="closed")
    markdown_result = _invoke_list_md(cli_group, ctx, names=True)

    assert default_result.exit_code == 0, default_result.output
    assert closed_result.exit_code == 0, closed_result.output
    assert markdown_result.exit_code == 0, markdown_result.output
    assert default_result.output == "open-one\n"
    assert closed_result.output == "closed-one\n"
    assert markdown_result.output == "open-one\n"


def test_objective_list_updated_branches_json_human_and_markdown(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    active_root = tmp_path / ".asdl" / "objectives"
    write_objective_record(active_root, "alpha")
    write_objective_record(active_root, "beta")
    write_objective_record(active_root, "closed-one", closed=True)
    root_path = ".asdl/objectives"
    ctx = _list_context(
        repo_root=tmp_path,
        branches=("master", "feat/alpha", "feat/beta", "feat/same-tree", "feat/branch-only"),
        tree_oid_by_ref_path={
            ("master", root_path): "trunk-tree",
            ("feat/alpha", root_path): "alpha-tree",
            ("feat/beta", root_path): "beta-tree",
            ("feat/same-tree", root_path): "trunk-tree",
            ("feat/branch-only", root_path): "branch-only-tree",
        },
        path_change_touches_by_ref_path={
            ("master..feat/alpha", root_path): (
                change_touch("alpha-touch", paths=(".asdl/objectives/alpha/objective.md",)),
            ),
            ("master..feat/beta", root_path): (
                change_touch("beta-touch", paths=(".asdl/objectives/beta/roadmap.md",)),
                change_touch(
                    "closed-touch",
                    paths=(".asdl/objectives/closed-one/objective.md",),
                ),
            ),
            ("master..feat/branch-only", root_path): (
                change_touch(
                    "branch-only-touch",
                    paths=(".asdl/objectives/branch-only/objective.md",),
                ),
            ),
        },
    )

    minimal_result = _invoke_list_json(cli_group, ctx, minimal=True, status="all")
    result = _invoke_list_json(cli_group, ctx, status="all")
    human = _invoke_list_human(cli_group, ctx, status="all")
    markdown = _invoke_list_md(cli_group, ctx, status="all")

    assert minimal_result.exit_code == 0, minimal_result.output
    default_data = json.loads(minimal_result.output)["data"]
    assert "updated_branches_included" not in default_data
    assert all("updated_branches" not in record for record in default_data["records"])

    assert result.exit_code == 0, result.output
    assert json.loads(result.output)["data"] == {
        "trunk_branch": "master",
        "root_path": ".asdl/objectives",
        "status_filter": "all",
        "names_only": False,
        "updated_branches_included": True,
        "records": [
            {
                "slug": "alpha",
                "status": "open",
                "latest_update_iso": None,
                "updated_branches": ["feat/alpha"],
            },
            {
                "slug": "beta",
                "status": "open",
                "latest_update_iso": None,
                "updated_branches": ["feat/beta"],
            },
            {
                "slug": "closed-one",
                "status": "closed",
                "latest_update_iso": None,
                "updated_branches": ["feat/beta"],
            },
        ],
    }
    assert human.exit_code == 0, human.output
    assert "Updated branches" in human.output
    assert "alpha" in human.output
    assert "└ feat/alpha" in human.output
    assert markdown.exit_code == 0, markdown.output
    assert "| objective | status | latest update | updated branches |" in markdown.output
    assert "| alpha | ○ open | — | feat/alpha |" in markdown.output
    assert "| beta | ○ open | — | feat/beta |" in markdown.output


def test_objective_list_updated_branches_orders_branches_by_latest_tip(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    write_objective_record(tmp_path / ".asdl" / "objectives", "alpha")
    root_path = ".asdl/objectives"
    ctx = _list_context(
        repo_root=tmp_path,
        branches=("master", "a-older", "z-newer"),
        tree_oid_by_ref_path={
            ("master", root_path): "trunk-tree",
            ("a-older", root_path): "older-tree",
            ("z-newer", root_path): "newer-tree",
        },
        path_change_touches_by_ref_path={
            ("master..a-older", root_path): (
                change_touch("older-touch", paths=(".asdl/objectives/alpha/objective.md",)),
            ),
            ("master..z-newer", root_path): (
                change_touch("newer-touch", paths=(".asdl/objectives/alpha/objective.md",)),
            ),
        },
        branch_head_iso_by_branch={
            "master": "2026-05-01T00:00:00+00:00",
            "a-older": "2026-05-02T00:00:00+00:00",
            "z-newer": "2026-05-03T00:00:00+00:00",
        },
    )

    result = _invoke_list_json(cli_group, ctx)
    human = _invoke_list_human(cli_group, ctx, terminal_columns=120)

    assert result.exit_code == 0, result.output
    records = json.loads(result.output)["data"]["records"]
    assert records[0]["updated_branches"] == ["z-newer", "a-older"]
    assert human.exit_code == 0, human.output
    assert "alpha" in human.output
    assert "├ 1/2 z-newer" in human.output
    assert "└ 2/2 a-older" in human.output


def test_objective_list_updated_branches_human_is_compact_at_narrow_width(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    long_slug = "very-long-objective-slug-that-must-stay-visible"
    long_branch = "feature/very-long-branch-name-that-must-stay-visible"
    root_path = ".asdl/objectives"
    write_objective_record(tmp_path / root_path, long_slug)
    ctx = _list_context(
        repo_root=tmp_path,
        branches=("master", long_branch),
        tree_oid_by_ref_path={
            ("master", root_path): "trunk-tree",
            (long_branch, root_path): "branch-tree",
        },
        path_change_touches_by_ref_path={
            (f"master..{long_branch}", root_path): (
                change_touch(
                    "long-touch",
                    paths=(f".asdl/objectives/{long_slug}/objective.md",),
                ),
            ),
        },
    )

    human = _invoke_list_human(
        cli_group,
        ctx,
        terminal_columns=80,
    )

    assert human.exit_code == 0, human.output
    assert "Objective" in human.output
    assert "Updated branches" in human.output
    assert "Status" in human.output
    assert "Latest update" in human.output
    assert "very-long-objectiv" in human.output
    assert "└ feature/very-long-branch-" in human.output
    assert "  Updated branches:" not in human.output


def test_objective_list_updated_branches_empty_branch_column(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    write_objective_record(tmp_path / ".asdl" / "objectives", "alpha")
    ctx = _list_context(repo_root=tmp_path, branches=("master",))

    result = _invoke_list_json(cli_group, ctx)
    markdown = _invoke_list_md(cli_group, ctx)

    assert result.exit_code == 0, result.output
    assert json.loads(result.output)["data"]["records"] == [
        {
            "slug": "alpha",
            "status": "open",
            "latest_update_iso": None,
            "updated_branches": [],
        }
    ]
    assert markdown.exit_code == 0, markdown.output
    assert "| alpha | ○ open | — | — |" in markdown.output


def test_objective_list_updated_branches_surfaces_git_failures(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    write_objective_record(tmp_path / ".asdl" / "objectives", "alpha")
    ctx = _list_context(
        repo_root=tmp_path,
        branches=("master", "feat/broken"),
        tree_oid_by_ref_path={
            ("master", ".asdl/objectives"): "trunk-tree",
            ("feat/broken", ".asdl/objectives"): GitCommandFailure(
                message="tree lookup failed",
                returncode=128,
            ),
        },
    )

    result = _invoke_list_json(cli_group, ctx)

    assert result.exit_code == 2
    assert json.loads(result.output) == {
        "exit_code": 2,
        "error_type": "git_failed",
        "message": "tree lookup failed",
    }


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


def _touch(oid: str, committed_iso: str) -> PathTouch:
    return PathTouch(oid=oid, committed_iso=committed_iso)


def _assert_no_branch_projection_fields(data: dict[str, object]) -> None:
    old_fields = {
        "base_branch",
        "status_source",
        "status_source_branch",
        "view",
        "current_branch",
        "filtered_to_current",
        "groups",
        "status_source_entry",
        "branches",
        "latest_work_branch",
        "parent_branch",
        "slice_commits",
    }
    assert old_fields.isdisjoint(data)


def _list_context(
    *,
    repo_root: Path,
    branches: tuple[str, ...] = ("master",),
    trunk_branch: str = "master",
    tracked_paths_by_ref_path: dict[tuple[str, str], tuple[str, ...]] | None = None,
    tree_oid_by_ref_path: dict[tuple[str, str], str | None | GitCommandFailure] | None = None,
    path_touch_by_ref_path: dict[tuple[str, str], PathTouch] | None = None,
    path_change_touches_by_ref_path: (
        dict[tuple[str, str], tuple[PathChangeTouch, ...] | GitCommandFailure] | None
    ) = None,
    uncommitted_changes_by_cwd_path: dict[tuple[Path, str], bool] | None = None,
    branch_head_iso_by_branch: dict[str, str] | None = None,
) -> ObjectiveCliContext:
    return ObjectiveCliContext(
        repo_root=repo_root,
        trunk_branch=trunk_branch,
        git=FakeGitGateway(
            repo_root=repo_root,
            branches=branches,
            trunk_branch=trunk_branch,
            tracked_paths_by_ref_path=tracked_paths_by_ref_path,
            tree_oid_by_ref_path=tree_oid_by_ref_path,
            path_touch_by_ref_path=path_touch_by_ref_path,
            path_change_touches_by_ref_path=path_change_touches_by_ref_path,
            uncommitted_changes_by_cwd_path=uncommitted_changes_by_cwd_path,
            branch_head_iso_by_branch=branch_head_iso_by_branch,
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
    minimal: bool = False,
) -> Result:
    args = _list_args(
        format_mode="json",
        view=view,
        status=status,
        current=current,
        names=names,
        minimal=minimal,
    )
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
    minimal: bool = False,
    terminal_columns: int | None = None,
) -> Result:
    args = _list_args(
        view=view,
        status=status,
        current=current,
        names=names,
        minimal=minimal,
    )
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
    minimal: bool = False,
) -> Result:
    args = _list_args(
        format_mode="md",
        view=view,
        status=status,
        current=current,
        names=names,
        minimal=minimal,
    )
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
    minimal: bool = False,
) -> list[str]:
    args = ["list"]
    if current:
        args.append("--current")
    if names:
        args.append("--names")
    if minimal:
        args.append("--minimal")
    if status is not None:
        args.extend(("--status", status))
    if view is not None:
        args.extend(("--view", view))
    if format_mode is not None:
        args.extend(("--format", format_mode))
    return args
