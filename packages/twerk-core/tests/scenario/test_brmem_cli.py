from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path

import click
import pytest
from click.testing import CliRunner

from twerk_core.brmem.context import BrmemCliContext
from twerk_core.brmem.fake import FakeBranchMemoryGateway
from twerk_core.brmem.main import build_cli
from twerk_core.clinkr.group import ClinkrGroup
from twerk_core.git.testing import FakeGitGateway
from twerk_core.git.types import DetachedHead, GitCommandFailure


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def _json_output(text: str) -> dict[str, object]:
    return json.loads(text)


def _make_obj(
    *,
    gateway: FakeBranchMemoryGateway | None = None,
    branch: str | DetachedHead | GitCommandFailure | None = "feat/x",
) -> Callable[[], BrmemCliContext]:
    brmem_gateway = gateway if gateway is not None else FakeBranchMemoryGateway()
    if branch is None:
        git_gateway = FakeGitGateway()
    else:
        git_gateway = FakeGitGateway(current_branch_by_path={Path.cwd(): branch})
    ctx = BrmemCliContext(brmem_gateway=brmem_gateway, git_gateway=git_gateway)
    return lambda: ctx


# ---------------------------------------------------------------------------
# help / version
# ---------------------------------------------------------------------------


def test_brmem_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["-h"])

    assert result.exit_code == 0
    assert "Usage: brmem" in result.output
    assert "Manage branch-scoped memory stored in git refs." in result.output
    assert "--version" in result.output
    assert "put" in result.output
    assert "get" in result.output
    assert "list" in result.output
    assert "list-artifacts" in result.output
    assert "check-entry" in result.output
    assert "check-artifact" in result.output
    assert "json" in result.output
    assert "copy" not in result.output
    # The legacy `branch` subgroup should no longer appear as a command.
    command_lines = [line for line in result.output.splitlines() if line.startswith("  ")]
    assert not any(line.lstrip().startswith("branch") for line in command_lines)


def test_brmem_version(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["--version"])

    assert result.exit_code == 0
    assert "version" in result.output


# ---------------------------------------------------------------------------
# brmem put / get
# ---------------------------------------------------------------------------


def test_brmem_put_and_get_round_trip(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    source_file = tmp_path / "local.txt"
    source_file.write_text("hello\n", encoding="utf-8")
    obj = _make_obj()

    put_result = CliRunner().invoke(
        cli_group,
        [
            "put",
            "docs/notes.md",
            "--namespace",
            "workbr",
            "--key",
            "plan",
            "--file",
            str(source_file),
        ],
        obj=obj,
    )
    get_result = CliRunner().invoke(
        cli_group,
        ["get", "docs/notes.md", "--namespace", "workbr", "--key", "plan"],
        obj=obj,
    )

    assert put_result.exit_code == 0, put_result.output
    assert (
        f"Stored docs/notes.md from {source_file} for workbr/plan on branch feat/x."
        in put_result.output
    )
    assert "Ref: refs/brmem/workbr/plan/feat---x" in put_result.output
    assert "Commit: fake-0001" in put_result.output
    assert "Inspect: git show refs/brmem/workbr/plan/feat---x:docs/notes.md" in put_result.output
    assert get_result.exit_code == 0, get_result.output
    assert get_result.output == "hello\n"


def test_brmem_get_at_reads_older_snapshot(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    first_commit = gateway.put_artifact("workbr", "plan", "feat/x", "docs/notes.md", "one\n")
    gateway.put_artifact("workbr", "plan", "feat/x", "docs/notes.md", "two\n")

    result = CliRunner().invoke(
        cli_group,
        [
            "get",
            "docs/notes.md",
            "--namespace",
            "workbr",
            "--key",
            "plan",
            "--at",
            first_commit,
        ],
        obj=_make_obj(gateway=gateway),
    )

    assert result.exit_code == 0, result.output
    assert result.output == "one\n"


def test_brmem_at_accepts_raw_treeish(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put_artifact("workbr", "plan", "feat/x", "docs/notes.md", "one\n")
    # Hand an at value that has no known history; fake returns None -> missing.
    result = CliRunner().invoke(
        cli_group,
        [
            "get",
            "docs/notes.md",
            "--namespace",
            "workbr",
            "--key",
            "plan",
            "--at",
            "deadbeef",
        ],
        obj=_make_obj(gateway=gateway),
    )

    assert result.exit_code == 1
    assert "at deadbeef" in result.output


def test_brmem_json_put_and_get(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    source_file = tmp_path / "local.txt"
    source_file.write_text("json\n", encoding="utf-8")
    obj = _make_obj()

    put_result = CliRunner().invoke(
        cli_group,
        ["json", "put"],
        input=json.dumps(
            {
                "file": str(source_file),
                "path": "docs/notes.md",
                "namespace": "workbr",
                "key": "plan",
            }
        ),
        obj=obj,
    )
    put_payload = _json_output(put_result.output)

    get_result = CliRunner().invoke(
        cli_group,
        ["json", "get"],
        input=json.dumps(
            {
                "branch": "feat/x",
                "path": "docs/notes.md",
                "namespace": "workbr",
                "key": "plan",
            }
        ),
        obj=obj,
    )
    get_payload = _json_output(get_result.output)

    assert put_result.exit_code == 0
    assert put_payload == {
        "namespace": "workbr",
        "key": "plan",
        "branch": "feat/x",
        "path": "docs/notes.md",
        "ref_name": "refs/brmem/workbr/plan/feat---x",
        "commit": "fake-0001",
        "source_file": str(source_file),
        "success": True,
    }
    assert get_result.exit_code == 0
    assert get_payload == {
        "namespace": "workbr",
        "key": "plan",
        "branch": "feat/x",
        "path": "docs/notes.md",
        "content": "json\n",
        "ref_name": "refs/brmem/workbr/plan/feat---x",
        "target": "refs/brmem/workbr/plan/feat---x",
        "at": None,
        "success": True,
    }


def test_brmem_put_from_stdin(cli_group: ClinkrGroup) -> None:
    obj = _make_obj()

    put_result = CliRunner().invoke(
        cli_group,
        ["put", "file.md", "--namespace", "workbr", "--key", "plan", "--stdin"],
        input="contents\n",
        obj=obj,
    )
    get_result = CliRunner().invoke(
        cli_group,
        ["get", "file.md", "--namespace", "workbr", "--key", "plan"],
        obj=obj,
    )

    assert put_result.exit_code == 0, put_result.output
    assert "Stored file.md from stdin for workbr/plan on branch feat/x." in put_result.output
    assert "Ref: refs/brmem/workbr/plan/feat---x" in put_result.output
    assert "Commit: fake-0001" in put_result.output
    assert get_result.exit_code == 0, get_result.output
    assert get_result.output == "contents\n"


def test_brmem_json_put_from_stdin_is_rejected(cli_group: ClinkrGroup) -> None:
    put_result = CliRunner().invoke(
        cli_group,
        ["json", "put"],
        input=json.dumps(
            {
                "path": "file.md",
                "namespace": "workbr",
                "key": "plan",
                "stdin": True,
            }
        ),
        obj=_make_obj(),
    )
    put_payload = _json_output(put_result.output)

    assert put_result.exit_code == 1
    assert put_payload == {
        "success": False,
        "error_type": "stdin_unsupported_in_json_mode",
        "message": (
            "brmem put --stdin is only supported in the human CLI; JSON mode already "
            "uses stdin for the request body."
        ),
    }


def test_brmem_invalid_branch_surfaces_clean_error(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    source_file = tmp_path / "local.txt"
    source_file.write_text("hello\n", encoding="utf-8")

    result = CliRunner().invoke(
        cli_group,
        [
            "put",
            "docs/notes.md",
            "--namespace",
            "workbr",
            "--key",
            "plan",
            "--file",
            str(source_file),
            "--branch",
            "feat---x",
        ],
        obj=_make_obj(branch=None),
    )

    assert result.exit_code == 1
    assert "Invalid branch name 'feat---x'" in result.output


def test_brmem_invalid_namespace_surfaces_clean_error(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    source_file = tmp_path / "local.txt"
    source_file.write_text("hello\n", encoding="utf-8")

    result = CliRunner().invoke(
        cli_group,
        [
            "put",
            "docs/notes.md",
            "--namespace",
            "brs",
            "--key",
            "plan",
            "--file",
            str(source_file),
        ],
        obj=_make_obj(),
    )

    assert result.exit_code == 1
    assert "Invalid namespace 'brs'" in result.output


def test_brmem_invalid_key_surfaces_clean_error(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    source_file = tmp_path / "local.txt"
    source_file.write_text("hello\n", encoding="utf-8")

    result = CliRunner().invoke(
        cli_group,
        [
            "put",
            "docs/notes.md",
            "--namespace",
            "workbr",
            "--key",
            "a/b",
            "--file",
            str(source_file),
        ],
        obj=_make_obj(),
    )

    assert result.exit_code == 1
    assert "Invalid key 'a/b'" in result.output


def test_brmem_explicit_branch_overrides_current_branch(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    source_file = tmp_path / "local.txt"
    source_file.write_text("hello\n", encoding="utf-8")
    obj = _make_obj(branch="feat/current")

    put_result = CliRunner().invoke(
        cli_group,
        [
            "put",
            "docs/notes.md",
            "--namespace",
            "workbr",
            "--key",
            "plan",
            "--file",
            str(source_file),
            "--branch",
            "feat/other",
        ],
        obj=obj,
    )
    get_result = CliRunner().invoke(
        cli_group,
        [
            "get",
            "docs/notes.md",
            "--namespace",
            "workbr",
            "--key",
            "plan",
            "--branch",
            "feat/other",
        ],
        obj=obj,
    )

    assert put_result.exit_code == 0, put_result.output
    assert get_result.exit_code == 0, get_result.output
    assert get_result.output == "hello\n"


def test_brmem_put_rejects_detached_head_when_branch_omitted(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    source_file = tmp_path / "local.txt"
    source_file.write_text("hello\n", encoding="utf-8")

    result = CliRunner().invoke(
        cli_group,
        [
            "put",
            "docs/notes.md",
            "--namespace",
            "workbr",
            "--key",
            "plan",
            "--file",
            str(source_file),
        ],
        obj=_make_obj(branch=DetachedHead()),
    )

    assert result.exit_code == 1
    assert "detached head" in result.output.lower()


def test_brmem_put_defaults_memory_path_from_file(
    cli_group: ClinkrGroup, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.chdir(tmp_path)
    source_file = Path("plan.md")
    source_file.write_text("hello\n", encoding="utf-8")
    obj = _make_obj()

    put_result = CliRunner().invoke(
        cli_group,
        ["put", "plan.md", "--namespace", "workbr", "--key", "plan"],
        obj=obj,
    )
    get_result = CliRunner().invoke(
        cli_group,
        ["get", "plan.md", "--namespace", "workbr", "--key", "plan"],
        obj=obj,
    )

    assert put_result.exit_code == 0, put_result.output
    assert "Stored plan.md from plan.md for workbr/plan on branch feat/x." in put_result.output
    assert "Ref: refs/brmem/workbr/plan/feat---x" in put_result.output
    assert get_result.exit_code == 0, get_result.output
    assert get_result.output == "hello\n"


def test_brmem_put_rejects_stdin_and_file_together(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    source_file = tmp_path / "local.txt"
    source_file.write_text("hello\n", encoding="utf-8")
    obj = _make_obj()

    result = CliRunner().invoke(
        cli_group,
        [
            "put",
            "file.md",
            "--namespace",
            "workbr",
            "--key",
            "plan",
            "--stdin",
            "--file",
            str(source_file),
        ],
        input="contents\n",
        obj=obj,
    )

    assert result.exit_code == 1
    assert "--stdin and --file are mutually exclusive." in result.output


def test_brmem_get_surfaces_git_failure_when_branch_omitted(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["get", "docs/notes.md", "--namespace", "workbr", "--key", "plan"],
        obj=_make_obj(
            branch=GitCommandFailure(
                message="fatal: not a git repository",
                returncode=128,
            )
        ),
    )

    assert result.exit_code == 1
    assert "not a git repository" in result.output


def test_brmem_missing_content_error_mentions_ref_target(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        [
            "get",
            "docs/missing.md",
            "--namespace",
            "workbr",
            "--key",
            "plan",
            "--branch",
            "feat/x",
        ],
        obj=_make_obj(branch=None),
    )

    assert result.exit_code == 1
    assert "refs/brmem/workbr/plan/feat---x" in result.output
    assert "git ls-tree -r refs/brmem/workbr/plan/feat---x" in result.output


# ---------------------------------------------------------------------------
# brmem list
# ---------------------------------------------------------------------------


def _seed_for_list_filters() -> FakeBranchMemoryGateway:
    gateway = FakeBranchMemoryGateway()
    gateway.put_artifact("workbr", "plan", "feat/x", "a.md", "a\n")
    gateway.put_artifact("workbr", "plan", "feat/y", "a.md", "a\n")
    gateway.put_artifact("workbr", "notes", "feat/x", "a.md", "a\n")
    gateway.put_artifact("objectives", "obj-1", "feat/x", "a.md", "a\n")
    return gateway


@pytest.mark.parametrize(
    ("args", "expected_refs"),
    [
        (
            [],
            [
                "refs/brmem/objectives/obj-1/feat---x",
                "refs/brmem/workbr/notes/feat---x",
                "refs/brmem/workbr/plan/feat---x",
                "refs/brmem/workbr/plan/feat---y",
            ],
        ),
        (
            ["--namespace", "workbr"],
            [
                "refs/brmem/workbr/notes/feat---x",
                "refs/brmem/workbr/plan/feat---x",
                "refs/brmem/workbr/plan/feat---y",
            ],
        ),
        (
            ["--key", "plan"],
            [
                "refs/brmem/workbr/plan/feat---x",
                "refs/brmem/workbr/plan/feat---y",
            ],
        ),
        (
            ["--branch", "feat/x"],
            [
                "refs/brmem/objectives/obj-1/feat---x",
                "refs/brmem/workbr/notes/feat---x",
                "refs/brmem/workbr/plan/feat---x",
            ],
        ),
        (
            ["--namespace", "workbr", "--key", "plan"],
            [
                "refs/brmem/workbr/plan/feat---x",
                "refs/brmem/workbr/plan/feat---y",
            ],
        ),
        (
            ["--namespace", "workbr", "--branch", "feat/y"],
            ["refs/brmem/workbr/plan/feat---y"],
        ),
        (
            ["--key", "plan", "--branch", "feat/x"],
            ["refs/brmem/workbr/plan/feat---x"],
        ),
        (
            ["--namespace", "workbr", "--key", "plan", "--branch", "feat/x"],
            ["refs/brmem/workbr/plan/feat---x"],
        ),
    ],
)
def test_brmem_list_filter_combinations(
    cli_group: ClinkrGroup, args: list[str], expected_refs: list[str]
) -> None:
    obj = _make_obj(gateway=_seed_for_list_filters())

    result = CliRunner().invoke(cli_group, ["list", *args], obj=obj)

    assert result.exit_code == 0, result.output
    assert result.output.splitlines() == expected_refs


def test_brmem_list_empty_returns_nothing(cli_group: ClinkrGroup) -> None:
    obj = _make_obj()

    result = CliRunner().invoke(cli_group, ["list"], obj=obj)

    assert result.exit_code == 0, result.output
    assert result.output == ""


def test_brmem_json_list(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put_artifact("workbr", "plan", "feat/x", "docs/a.md", "a\n")
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(
        cli_group,
        ["json", "list"],
        input=json.dumps({"namespace": "workbr"}),
        obj=obj,
    )
    payload = _json_output(result.output)

    assert result.exit_code == 0, result.output
    assert payload == {
        "namespace": "workbr",
        "key": None,
        "branch": None,
        "entries": [
            {
                "namespace": "workbr",
                "key": "plan",
                "branch": "feat/x",
                "ref_name": "refs/brmem/workbr/plan/feat---x",
            }
        ],
        "success": True,
    }


# ---------------------------------------------------------------------------
# brmem list-artifacts
# ---------------------------------------------------------------------------


def test_brmem_list_artifacts_human(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put_artifact("workbr", "plan", "feat/x", "docs/b.md", "b\n")
    gateway.put_artifact("workbr", "plan", "feat/x", "docs/a.md", "a\n")
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(
        cli_group,
        ["list-artifacts", "--namespace", "workbr", "--key", "plan"],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    assert result.output == "docs/a.md\ndocs/b.md\n"


def test_brmem_list_artifacts_json(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put_artifact("workbr", "plan", "feat/x", "docs/b.md", "b\n")
    gateway.put_artifact("workbr", "plan", "feat/x", "docs/a.md", "a\n")
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(
        cli_group,
        ["json", "list-artifacts"],
        input=json.dumps({"namespace": "workbr", "key": "plan"}),
        obj=obj,
    )
    payload = _json_output(result.output)

    assert result.exit_code == 0, result.output
    assert payload == {
        "namespace": "workbr",
        "key": "plan",
        "branch": "feat/x",
        "ref_name": "refs/brmem/workbr/plan/feat---x",
        "target": "refs/brmem/workbr/plan/feat---x",
        "artifacts": ["docs/a.md", "docs/b.md"],
        "at": None,
        "success": True,
    }


# ---------------------------------------------------------------------------
# brmem check-entry
# ---------------------------------------------------------------------------


def test_brmem_check_entry_hit_exits_zero(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put_artifact("workbr", "plan", "feat/x", "a.md", "a\n")
    gateway.put_artifact("workbr", "plan", "feat/x", "b.md", "b\n")
    gateway.put_artifact("workbr", "plan", "feat/x", "c.md", "c\n")

    result = CliRunner().invoke(
        cli_group,
        ["check-entry", "--namespace", "workbr", "--key", "plan"],
        obj=_make_obj(gateway=gateway),
    )

    assert result.exit_code == 0, result.stderr
    assert "branch: feat/x" in result.stdout
    assert "ref: refs/brmem/workbr/plan/feat---x" in result.stdout
    assert "head: fake-0003" in result.stdout
    assert "artifact_count: 3" in result.stdout


def test_brmem_check_entry_miss_exits_one_with_absent_message(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["check-entry", "--namespace", "workbr", "--key", "plan"],
        obj=_make_obj(),
    )

    assert result.exit_code == 1
    assert result.stdout == ""
    assert (
        result.stderr.strip()
        == "no entry: namespace=workbr key=plan branch=feat/x ref=refs/brmem/workbr/plan/feat---x"
    )


def test_brmem_check_entry_invalid_branch_exits_two(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        [
            "check-entry",
            "--namespace",
            "workbr",
            "--key",
            "plan",
            "--branch",
            "feat---x",
        ],
        obj=_make_obj(branch=None),
    )

    assert result.exit_code == 2
    assert "Invalid branch name 'feat---x'" in result.stderr


def test_brmem_json_check_entry_present(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put_artifact("workbr", "plan", "feat/x", "a.md", "a\n")
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(
        cli_group,
        ["json", "check-entry"],
        input=json.dumps({"namespace": "workbr", "key": "plan"}),
        obj=obj,
    )
    payload = _json_output(result.output)

    assert result.exit_code == 0, result.output
    assert payload["success"] is True
    assert payload["exists"] is True
    assert payload["ref_name"] == "refs/brmem/workbr/plan/feat---x"
    assert payload["artifact_count"] == 1


def test_brmem_json_check_entry_missing(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["json", "check-entry"],
        input=json.dumps({"namespace": "workbr", "key": "plan"}),
        obj=_make_obj(),
    )
    payload = _json_output(result.output)

    assert result.exit_code == 0, result.output
    assert payload["success"] is True
    assert payload["exists"] is False
    assert payload["head_sha"] is None
    assert payload["artifact_count"] is None


# ---------------------------------------------------------------------------
# brmem check-artifact
# ---------------------------------------------------------------------------


def test_brmem_check_artifact_hit_exits_zero(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put_artifact("workbr", "plan", "feat/x", "docs/notes.md", "hello\n")

    result = CliRunner().invoke(
        cli_group,
        ["check-artifact", "docs/notes.md", "--namespace", "workbr", "--key", "plan"],
        obj=_make_obj(gateway=gateway),
    )

    assert result.exit_code == 0, result.stderr
    assert result.stderr == ""
    assert "path: docs/notes.md" in result.stdout
    assert "namespace: workbr" in result.stdout
    assert "key: plan" in result.stdout
    assert "ref: refs/brmem/workbr/plan/feat---x" in result.stdout
    assert "blob: blob-fake-0001-docs/notes.md" in result.stdout
    assert "size: 6" in result.stdout
    assert "last_commit: fake-0001" in result.stdout


def test_brmem_check_artifact_miss_exits_one(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put_artifact("workbr", "plan", "feat/x", "docs/notes.md", "hello\n")

    result = CliRunner().invoke(
        cli_group,
        ["check-artifact", "docs/missing.md", "--namespace", "workbr", "--key", "plan"],
        obj=_make_obj(gateway=gateway),
    )

    assert result.exit_code == 1
    assert result.stdout == ""
    assert result.stderr.strip() == (
        "not found: docs/missing.md in namespace=workbr key=plan "
        "branch=feat/x at refs/brmem/workbr/plan/feat---x"
    )


def test_brmem_check_artifact_at_historical(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    first_commit = gateway.put_artifact("workbr", "plan", "feat/x", "docs/notes.md", "one\n")
    gateway.put_artifact("workbr", "plan", "feat/x", "docs/notes.md", "two-and-three\n")

    result = CliRunner().invoke(
        cli_group,
        [
            "check-artifact",
            "docs/notes.md",
            "--namespace",
            "workbr",
            "--key",
            "plan",
            "--at",
            first_commit,
        ],
        obj=_make_obj(gateway=gateway),
    )

    assert result.exit_code == 0, result.stderr
    assert "size: 4" in result.stdout
    assert f"target: {first_commit}" in result.stdout


def test_brmem_check_artifact_invalid_branch_exits_two(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        [
            "check-artifact",
            "docs/notes.md",
            "--namespace",
            "workbr",
            "--key",
            "plan",
            "--branch",
            "feat---x",
        ],
        obj=_make_obj(branch=None),
    )

    assert result.exit_code == 2
    assert "Invalid branch name 'feat---x'" in result.stderr


def test_brmem_check_artifact_detached_head_exits_two(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["check-artifact", "docs/notes.md", "--namespace", "workbr", "--key", "plan"],
        obj=_make_obj(branch=DetachedHead()),
    )

    assert result.exit_code == 2
    assert "detached head" in result.stderr.lower()


def test_brmem_json_check_artifact_present(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put_artifact("workbr", "plan", "feat/x", "docs/notes.md", "hello\n")
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(
        cli_group,
        ["json", "check-artifact"],
        input=json.dumps(
            {
                "namespace": "workbr",
                "key": "plan",
                "path": "docs/notes.md",
            }
        ),
        obj=obj,
    )
    payload = _json_output(result.output)

    assert result.exit_code == 0, result.output
    assert payload["success"] is True
    assert payload["exists"] is True
    assert payload["ref_name"] == "refs/brmem/workbr/plan/feat---x"
    assert payload["size_bytes"] == 6


# ---------------------------------------------------------------------------
# JSON parity
# ---------------------------------------------------------------------------


def test_brmem_public_commands_have_json_counterparts(cli_group: ClinkrGroup) -> None:
    def _assert_json_parity(group: ClinkrGroup) -> None:
        json_group = group.commands["json"]
        assert isinstance(json_group, click.Group)
        operation_children = {
            name
            for name, cmd in group.commands.items()
            if name != "json" and not isinstance(cmd, ClinkrGroup)
        }
        assert operation_children <= set(json_group.commands)
        for name, cmd in group.commands.items():
            if name == "json":
                continue
            if isinstance(cmd, ClinkrGroup):
                _assert_json_parity(cmd)

    _assert_json_parity(cli_group)
