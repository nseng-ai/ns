from __future__ import annotations

import json
from pathlib import Path

import pytest
from click.testing import CliRunner, Result

from asdl_core.clinkr.context import build_clinkr_context_object
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.git.testing import FakeGitGateway
from asdl_core.git.types import GitCommandFailure, PathChangeTouch, PathTouch
from asdl_objectives.context import (
    ObjectiveCliContext,
    ObjectiveCliUnavailable,
)
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
    assert "archive" in result.output
    assert "Archive or unarchive an Objective record" in result.output
    assert "Work with Graphite Objective stack projections" not in result.output
    assert "list" in result.output
    assert "List Objective records" in result.output
    assert "exec" not in result.output


def test_objective_version(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["--version"])

    assert result.exit_code == 0
    assert "version" in result.output.lower()


def test_objective_gt_command_is_not_registered(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["gt", "stacks", "--help"])

    assert result.exit_code != 0
    assert "No such command" in result.output


def test_objective_list_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["list", "--help"])

    assert result.exit_code == 0
    assert "Usage: objective list" in result.output
    assert "List Objective records in the current checkout" in result.output
    assert "--names" in result.output
    assert "--status" in result.output
    assert "--branches" in result.output
    assert "--updated-branches" not in result.output
    assert "--current" not in result.output
    assert "--view" not in result.output
    assert "in-flight" not in result.output


def test_objective_archive_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["archive", "--help"])

    assert result.exit_code == 0
    assert "Usage: objective archive" in result.output
    assert "Archive or unarchive an Objective record by moving its directory" in result.output
    assert "SLUG" in result.output
    assert "--unarchive" in result.output


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
    _write_objective(active_root, "open-one")
    _write_objective(active_root, "closed-one", closed=True)
    ctx = _list_context(repo_root=tmp_path)

    default_result = _invoke_list_json(cli_group, ctx)
    closed_result = _invoke_list_json(cli_group, ctx, status="closed")
    all_result = _invoke_list_json(cli_group, ctx, status="all")

    assert default_result.exit_code == 0, default_result.output
    assert closed_result.exit_code == 0, closed_result.output
    assert all_result.exit_code == 0, all_result.output
    assert json.loads(default_result.output)["data"]["records"] == [
        {"slug": "open-one", "status": "open", "latest_update_iso": None}
    ]
    assert json.loads(closed_result.output)["data"]["records"] == [
        {"slug": "closed-one", "status": "closed", "latest_update_iso": None}
    ]
    assert json.loads(all_result.output)["data"]["records"] == [
        {"slug": "closed-one", "status": "closed", "latest_update_iso": None},
        {"slug": "open-one", "status": "open", "latest_update_iso": None},
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
        {"slug": "new-one", "status": "open", "latest_update_iso": None}
    ]


def test_objective_list_omits_archive_root_records(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    _write_objective(tmp_path / ".asdl" / "objective-archive", "archived")
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
    _write_objective(active_root, "alpha")
    _write_objective(active_root, "beta")
    ctx = _list_context(
        repo_root=tmp_path,
        path_touch_by_ref_path={
            ("HEAD", ".asdl/objectives/alpha"): _touch(
                "alpha-touch",
                "2026-05-20T10:00:00Z",
            ),
        },
    )

    result = _invoke_list_json(cli_group, ctx, status="all")
    human = _invoke_list_human(cli_group, ctx, status="all")
    markdown = _invoke_list_md(cli_group, ctx, status="all")

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
    _write_objective(tmp_path / ".asdl" / "objectives", "alpha")
    ctx = _list_context(
        repo_root=tmp_path,
        uncommitted_changes_by_cwd_path={(tmp_path, ".asdl/objectives/alpha"): True},
    )

    result = _invoke_list_json(cli_group, ctx)

    assert result.exit_code == 0, result.output
    records = json.loads(result.output)["data"]["records"]
    assert records == [{"slug": "alpha", "status": "open", "latest_update_iso": None}]
    assert set(records[0]) == {"slug", "status", "latest_update_iso"}


def test_objective_list_dirty_record_human_and_markdown_show_marker(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    _write_objective(tmp_path / ".asdl" / "objectives", "alpha")
    ctx = _list_context(
        repo_root=tmp_path,
        uncommitted_changes_by_cwd_path={(tmp_path, ".asdl/objectives/alpha"): True},
    )

    human = _invoke_list_human(cli_group, ctx)
    markdown = _invoke_list_md(cli_group, ctx)

    assert human.exit_code == 0, human.output
    assert markdown.exit_code == 0, markdown.output
    assert "(x)" in human.output
    assert "| alpha | ○ open | (x) — |" in markdown.output


def test_objective_list_dirty_record_names_only_stays_slug_only(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    _write_objective(tmp_path / ".asdl" / "objectives", "alpha")
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
    _write_objective(tmp_path / ".asdl" / "objectives", "alpha")
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

    assert in_flight.exit_code != 0
    assert "Invalid value for '--status'" in in_flight.output
    assert "in-flight" in in_flight.output
    assert current.exit_code != 0
    assert "No such option: --current" in current.output
    assert detail_view.exit_code != 0
    assert "No such option: --view" in detail_view.output


def test_objective_list_names_outputs_filtered_slugs_only(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    active_root = tmp_path / ".asdl" / "objectives"
    _write_objective(active_root, "open-one")
    _write_objective(active_root, "closed-one", closed=True)
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
    _write_objective(active_root, "alpha")
    _write_objective(active_root, "beta")
    _write_objective(active_root, "closed-one", closed=True)
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
                _change_touch("alpha-touch", paths=(".asdl/objectives/alpha/objective.md",)),
            ),
            ("master..feat/beta", root_path): (
                _change_touch("beta-touch", paths=(".asdl/objectives/beta/roadmap.md",)),
                _change_touch(
                    "closed-touch",
                    paths=(".asdl/objectives/closed-one/objective.md",),
                ),
            ),
            ("master..feat/branch-only", root_path): (
                _change_touch(
                    "branch-only-touch",
                    paths=(".asdl/objectives/branch-only/objective.md",),
                ),
            ),
        },
    )

    default_result = _invoke_list_json(cli_group, ctx, status="all")
    result = _invoke_list_json(cli_group, ctx, updated_branches=True, status="all")
    human = _invoke_list_human(cli_group, ctx, updated_branches=True, status="all")
    markdown = _invoke_list_md(cli_group, ctx, updated_branches=True, status="all")

    assert default_result.exit_code == 0, default_result.output
    default_data = json.loads(default_result.output)["data"]
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
    _write_objective(tmp_path / ".asdl" / "objectives", "alpha")
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
                _change_touch("older-touch", paths=(".asdl/objectives/alpha/objective.md",)),
            ),
            ("master..z-newer", root_path): (
                _change_touch("newer-touch", paths=(".asdl/objectives/alpha/objective.md",)),
            ),
        },
        branch_head_iso_by_branch={
            "master": "2026-05-01T00:00:00+00:00",
            "a-older": "2026-05-02T00:00:00+00:00",
            "z-newer": "2026-05-03T00:00:00+00:00",
        },
    )

    result = _invoke_list_json(cli_group, ctx, updated_branches=True)
    human = _invoke_list_human(cli_group, ctx, updated_branches=True, terminal_columns=120)

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
    _write_objective(tmp_path / root_path, long_slug)
    ctx = _list_context(
        repo_root=tmp_path,
        branches=("master", long_branch),
        tree_oid_by_ref_path={
            ("master", root_path): "trunk-tree",
            (long_branch, root_path): "branch-tree",
        },
        path_change_touches_by_ref_path={
            (f"master..{long_branch}", root_path): (
                _change_touch(
                    "long-touch",
                    paths=(f".asdl/objectives/{long_slug}/objective.md",),
                ),
            ),
        },
    )

    human = _invoke_list_human(
        cli_group,
        ctx,
        updated_branches=True,
        terminal_columns=80,
    )

    assert human.exit_code == 0, human.output
    assert "Objective" in human.output
    assert "Updated branches" in human.output
    assert "very-long-objective-slug-that" in human.output
    assert "└ feature/very-long-branch-" in human.output
    assert "  Updated branches:" not in human.output


def test_objective_list_updated_branches_empty_branch_column(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    _write_objective(tmp_path / ".asdl" / "objectives", "alpha")
    ctx = _list_context(repo_root=tmp_path, branches=("master",))

    result = _invoke_list_json(cli_group, ctx, updated_branches=True)
    markdown = _invoke_list_md(cli_group, ctx, updated_branches=True)

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


def test_objective_list_updated_branches_rejects_names(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    _write_objective(tmp_path / ".asdl" / "objectives", "alpha")
    ctx = _list_context(repo_root=tmp_path)

    result = _invoke_list_json(cli_group, ctx, names=True, updated_branches=True)

    assert result.exit_code == 2
    assert "--branches cannot be combined with --names" in result.output


def test_objective_list_updated_branches_surfaces_git_failures(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    _write_objective(tmp_path / ".asdl" / "objectives", "alpha")
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

    result = _invoke_list_json(cli_group, ctx, updated_branches=True)

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


def test_objective_archive_open_record_json_moves_from_active_to_archive(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    active_root = tmp_path / ".asdl" / "objectives"
    archive_root = tmp_path / ".asdl" / "objective-archive"
    _write_objective(active_root, "alpha")
    subdir = tmp_path / "subdir"
    subdir.mkdir()
    monkeypatch.chdir(subdir)
    ctx = _archive_context(tmp_path)

    result = _invoke_archive_json(cli_group, ctx, "alpha")

    assert result.exit_code == 0, result.output
    assert json.loads(result.output) == {
        "exit_code": 0,
        "data": _archive_data(
            status="archived",
            error=None,
            slug="alpha",
            direction="archive",
            source_path=".asdl/objectives/alpha",
            destination_path=".asdl/objective-archive/alpha",
            source_exists=False,
            destination_exists=True,
            moved=True,
        ),
    }
    assert not (active_root / "alpha").exists()
    assert (archive_root / "alpha" / "objective.md").is_file()


def test_objective_archive_human_output_lists_moved_paths(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    _write_objective(tmp_path / ".asdl" / "objectives", "alpha")
    ctx = _archive_context(tmp_path)

    result = _invoke_archive_human(cli_group, ctx, "alpha")

    assert result.exit_code == 0, result.output
    assert "Archived Objective `alpha`." in result.output
    assert ".asdl/objectives/alpha" in result.output
    assert "-> .asdl/objective-archive/alpha" in result.output


def test_objective_archive_closed_record_preserves_closed_marker(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    _write_objective(tmp_path / ".asdl" / "objectives", "done", closed=True)
    ctx = _archive_context(tmp_path)

    result = _invoke_archive_json(cli_group, ctx, "done")

    assert result.exit_code == 0, result.output
    assert (tmp_path / ".asdl" / "objective-archive" / "done" / "closed.md").read_text(
        encoding="utf-8"
    ) == "closed\n"


def test_objective_archive_creates_archive_root_when_absent(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    _write_objective(tmp_path / ".asdl" / "objectives", "alpha")
    archive_root = tmp_path / ".asdl" / "objective-archive"
    assert not archive_root.exists()

    result = _invoke_archive_json(cli_group, _archive_context(tmp_path), "alpha")

    assert result.exit_code == 0, result.output
    assert archive_root.is_dir()


def test_objective_archive_absent_source_returns_stable_json_without_creating_destination(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    ctx = _archive_context(tmp_path)

    result = _invoke_archive_json(cli_group, ctx, "ghost")

    assert result.exit_code == 1
    assert json.loads(result.output) == {
        "exit_code": 1,
        "message": "No active Objective record found for slug 'ghost' at .asdl/objectives/ghost.",
        "data": _archive_data(
            status="source_not_found",
            error="source_not_found",
            slug="ghost",
            direction="archive",
            source_path=".asdl/objectives/ghost",
            destination_path=".asdl/objective-archive/ghost",
            source_exists=False,
            destination_exists=False,
            moved=False,
        ),
    }
    assert not (tmp_path / ".asdl" / "objective-archive" / "ghost").exists()


def test_objective_archive_destination_collision_fails_without_mutation(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    active_record = _write_objective(tmp_path / ".asdl" / "objectives", "alpha")
    archived_record = _write_objective(tmp_path / ".asdl" / "objective-archive", "alpha")
    (active_record / "objective.md").write_text("active sentinel\n", encoding="utf-8")
    (archived_record / "objective.md").write_text("archived sentinel\n", encoding="utf-8")

    result = _invoke_archive_json(cli_group, _archive_context(tmp_path), "alpha")

    assert result.exit_code == 1
    assert json.loads(result.output) == {
        "exit_code": 1,
        "message": (
            "Destination already exists for slug 'alpha': .asdl/objective-archive/alpha. "
            "Refusing to merge or overwrite."
        ),
        "data": _archive_data(
            status="destination_exists",
            error="destination_exists",
            slug="alpha",
            direction="archive",
            source_path=".asdl/objectives/alpha",
            destination_path=".asdl/objective-archive/alpha",
            source_exists=True,
            destination_exists=True,
            moved=False,
        ),
    }
    assert (active_record / "objective.md").read_text(encoding="utf-8") == "active sentinel\n"
    assert (archived_record / "objective.md").read_text(encoding="utf-8") == "archived sentinel\n"


@pytest.mark.parametrize("slug", ("foo/bar", ".asdl/objectives/foo", ".", ".."))
def test_objective_archive_rejects_invalid_slug_without_mutation(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    slug: str,
) -> None:
    _write_objective(tmp_path / ".asdl" / "objectives", "alpha")

    result = _invoke_archive_json(cli_group, _archive_context(tmp_path), slug)

    assert result.exit_code == 1
    assert json.loads(result.output) == {
        "exit_code": 1,
        "message": f"Invalid Objective slug {slug!r}. Pass a single slug, not a path.",
        "data": _archive_data(
            status="invalid_slug",
            error="invalid_slug",
            slug=None,
            direction="archive",
            source_path=".asdl/objectives",
            destination_path=".asdl/objective-archive",
            source_exists=False,
            destination_exists=False,
            moved=False,
        ),
    }
    assert (tmp_path / ".asdl" / "objectives" / "alpha").is_dir()
    assert not (tmp_path / ".asdl" / "objective-archive").exists()


def test_objective_archive_missing_slug_returns_negative_without_click_usage(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    result = _invoke_archive_json(cli_group, _archive_context(tmp_path), slug=None)

    assert result.exit_code == 1
    assert "Usage:" not in result.output
    assert "Usage:" not in result.stderr
    assert json.loads(result.output) == {
        "exit_code": 1,
        "message": "Missing Objective slug. Pass an explicit slug.",
        "data": _archive_data(
            status="missing_slug",
            error="missing_slug",
            slug=None,
            direction="archive",
            source_path=".asdl/objectives",
            destination_path=".asdl/objective-archive",
            source_exists=False,
            destination_exists=False,
            moved=False,
        ),
    }


def test_objective_unarchive_json_moves_from_archive_to_active(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    _write_objective(tmp_path / ".asdl" / "objective-archive", "alpha")
    active_root = tmp_path / ".asdl" / "objectives"
    ctx = _archive_context(tmp_path)

    result = _invoke_archive_json(cli_group, ctx, "alpha", unarchive=True)

    assert result.exit_code == 0, result.output
    assert json.loads(result.output) == {
        "exit_code": 0,
        "data": _archive_data(
            status="unarchived",
            error=None,
            slug="alpha",
            direction="unarchive",
            source_path=".asdl/objective-archive/alpha",
            destination_path=".asdl/objectives/alpha",
            source_exists=False,
            destination_exists=True,
            moved=True,
        ),
    }
    assert (active_root / "alpha" / "objective.md").is_file()
    assert not (tmp_path / ".asdl" / "objective-archive" / "alpha").exists()


def test_objective_unarchive_human_output_lists_moved_paths(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    _write_objective(tmp_path / ".asdl" / "objective-archive", "alpha")

    result = _invoke_archive_human(cli_group, _archive_context(tmp_path), "alpha", unarchive=True)

    assert result.exit_code == 0, result.output
    assert "Unarchived Objective `alpha`." in result.output
    assert ".asdl/objective-archive/alpha" in result.output
    assert "-> .asdl/objectives/alpha" in result.output


def test_objective_unarchive_creates_active_root_when_absent(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    _write_objective(tmp_path / ".asdl" / "objective-archive", "alpha")
    active_root = tmp_path / ".asdl" / "objectives"
    assert not active_root.exists()

    result = _invoke_archive_json(cli_group, _archive_context(tmp_path), "alpha", unarchive=True)

    assert result.exit_code == 0, result.output
    assert active_root.is_dir()


def test_objective_unarchive_absent_source_returns_stable_json(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    result = _invoke_archive_json(cli_group, _archive_context(tmp_path), "ghost", unarchive=True)

    assert result.exit_code == 1
    assert json.loads(result.output) == {
        "exit_code": 1,
        "message": (
            "No archived Objective record found for slug 'ghost' at .asdl/objective-archive/ghost."
        ),
        "data": _archive_data(
            status="source_not_found",
            error="source_not_found",
            slug="ghost",
            direction="unarchive",
            source_path=".asdl/objective-archive/ghost",
            destination_path=".asdl/objectives/ghost",
            source_exists=False,
            destination_exists=False,
            moved=False,
        ),
    }


def test_objective_unarchive_destination_collision_fails_without_mutation(
    cli_group: ClinkrGroup,
    tmp_path: Path,
) -> None:
    archived_record = _write_objective(tmp_path / ".asdl" / "objective-archive", "alpha")
    active_record = _write_objective(tmp_path / ".asdl" / "objectives", "alpha")
    (archived_record / "objective.md").write_text("archived sentinel\n", encoding="utf-8")
    (active_record / "objective.md").write_text("active sentinel\n", encoding="utf-8")

    result = _invoke_archive_json(cli_group, _archive_context(tmp_path), "alpha", unarchive=True)

    assert result.exit_code == 1
    assert json.loads(result.output) == {
        "exit_code": 1,
        "message": (
            "Destination already exists for slug 'alpha': .asdl/objectives/alpha. "
            "Refusing to merge or overwrite."
        ),
        "data": _archive_data(
            status="destination_exists",
            error="destination_exists",
            slug="alpha",
            direction="unarchive",
            source_path=".asdl/objective-archive/alpha",
            destination_path=".asdl/objectives/alpha",
            source_exists=True,
            destination_exists=True,
            moved=False,
        ),
    }
    assert (archived_record / "objective.md").read_text(encoding="utf-8") == "archived sentinel\n"
    assert (active_record / "objective.md").read_text(encoding="utf-8") == "active sentinel\n"


def test_objective_archive_unavailable_context_returns_failure_envelope(
    cli_group: ClinkrGroup,
) -> None:
    result = _invoke_archive_json(
        cli_group,
        ObjectiveCliUnavailable("Not inside a git repository."),
        "alpha",
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


def test_objective_exec_read_does_not_read_archive_only_record(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    _write_objective(tmp_path / ".asdl" / "objective-archive", "alpha")

    result = _invoke_read_json(cli_group, "alpha")

    assert result.exit_code == 1
    assert json.loads(result.output) == {
        "exit_code": 1,
        "message": "No Objective record found for slug 'alpha'.",
        "data": _empty_read_data(
            status="not_found",
            error="not_found",
            slug="alpha",
            path=".asdl/objectives/alpha",
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


def _change_touch(
    oid: str,
    *,
    paths: tuple[str, ...],
    committed_iso: str = "2026-05-20T10:00:00Z",
) -> PathChangeTouch:
    return PathChangeTouch(oid=oid, committed_iso=committed_iso, paths=paths)


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


def _archive_context(repo_root: Path) -> ObjectiveCliContext:
    return ObjectiveCliContext(
        repo_root=repo_root,
        trunk_branch="master",
        git=FakeGitGateway(repo_root=repo_root, branches=("master",), trunk_branch="master"),
    )


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


def _invoke_archive_json(
    cli_group: ClinkrGroup,
    ctx: ObjectiveCliContext | ObjectiveCliUnavailable,
    slug: str | None,
    *,
    unarchive: bool = False,
) -> Result:
    args = ["archive"]
    if slug is not None:
        args.append(slug)
    if unarchive:
        args.append("--unarchive")
    args.extend(("--format", "json"))
    return CliRunner().invoke(
        cli_group,
        args,
        obj=build_clinkr_context_object(lambda: ctx),
    )


def _invoke_archive_human(
    cli_group: ClinkrGroup,
    ctx: ObjectiveCliContext,
    slug: str,
    *,
    unarchive: bool = False,
) -> Result:
    args = ["archive", slug]
    if unarchive:
        args.append("--unarchive")
    return CliRunner().invoke(
        cli_group,
        args,
        obj=build_clinkr_context_object(lambda: ctx),
    )


def _archive_data(
    *,
    status: str,
    error: str | None,
    slug: str | None,
    direction: str,
    source_path: str,
    destination_path: str,
    source_exists: bool,
    destination_exists: bool,
    moved: bool,
) -> dict[str, object]:
    return {
        "status": status,
        "error": error,
        "slug": slug,
        "direction": direction,
        "source_path": source_path,
        "destination_path": destination_path,
        "source_exists": source_exists,
        "destination_exists": destination_exists,
        "moved": moved,
    }


def _invoke_list_json(
    cli_group: ClinkrGroup,
    ctx: ObjectiveCliContext | ObjectiveCliUnavailable,
    *,
    view: str | None = None,
    status: str | None = None,
    current: bool = False,
    names: bool = False,
    updated_branches: bool = False,
) -> Result:
    args = _list_args(
        format_mode="json",
        view=view,
        status=status,
        current=current,
        names=names,
        updated_branches=updated_branches,
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
    updated_branches: bool = False,
    terminal_columns: int | None = None,
) -> Result:
    args = _list_args(
        view=view,
        status=status,
        current=current,
        names=names,
        updated_branches=updated_branches,
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
    updated_branches: bool = False,
) -> Result:
    args = _list_args(
        format_mode="md",
        view=view,
        status=status,
        current=current,
        names=names,
        updated_branches=updated_branches,
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
    updated_branches: bool = False,
) -> list[str]:
    args = ["list"]
    if current:
        args.append("--current")
    if names:
        args.append("--names")
    if updated_branches:
        args.append("--branches")
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
