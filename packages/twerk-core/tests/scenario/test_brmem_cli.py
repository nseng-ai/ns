from __future__ import annotations

import json
from pathlib import Path

import click
import pytest
from click.testing import CliRunner

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


def test_brmem_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["-h"])

    assert result.exit_code == 0
    assert "Usage: brmem" in result.output
    assert "Manage branch-scoped memory stored in git refs." in result.output
    assert "--version" in result.output
    assert "put" in result.output
    assert "get" in result.output
    assert "list" in result.output
    assert "json" in result.output


def test_brmem_version(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["--version"])

    assert result.exit_code == 0
    assert "version" in result.output


def test_brmem_put_and_get_round_trip(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    source_file = tmp_path / "local.txt"
    source_file.write_text("hello\n", encoding="utf-8")
    obj = {
        "brmem_gateway": FakeBranchMemoryGateway(),
        "git_gateway": FakeGitGateway(current_branch_by_path={Path.cwd(): "feat/x"}),
    }

    put_result = CliRunner().invoke(
        cli_group,
        ["put", "docs/notes.md", "--file", str(source_file)],
        obj=obj,
    )
    get_result = CliRunner().invoke(
        cli_group,
        ["get", "docs/notes.md"],
        obj=obj,
    )

    assert put_result.exit_code == 0, put_result.output
    assert f"Stored docs/notes.md from {source_file} for branch feat/x." in put_result.output
    assert "Ref: refs/brmem/brs/feat---x" in put_result.output
    assert "Commit: fake-0001" in put_result.output
    assert "Inspect: git show refs/brmem/brs/feat---x:docs/notes.md" in put_result.output
    assert get_result.exit_code == 0, get_result.output
    assert get_result.output == "hello\n"


def test_brmem_get_at_reads_older_snapshot(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    first_commit = gateway.put("feat/x", "docs/notes.md", "one\n")
    gateway.put("feat/x", "docs/notes.md", "two\n")

    result = CliRunner().invoke(
        cli_group,
        ["get", "docs/notes.md", "--at", first_commit],
        obj={
            "brmem_gateway": gateway,
            "git_gateway": FakeGitGateway(current_branch_by_path={Path.cwd(): "feat/x"}),
        },
    )

    assert result.exit_code == 0, result.output
    assert result.output == "one\n"


def test_brmem_json_put_and_get(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    source_file = tmp_path / "local.txt"
    source_file.write_text("json\n", encoding="utf-8")
    obj = {
        "brmem_gateway": FakeBranchMemoryGateway(),
        "git_gateway": FakeGitGateway(current_branch_by_path={Path.cwd(): "feat/x"}),
    }

    put_result = CliRunner().invoke(
        cli_group,
        ["json", "put"],
        input=json.dumps(
            {
                "file": str(source_file),
                "path": "docs/notes.md",
            }
        ),
        obj=obj,
    )
    put_payload = _json_output(put_result.output)

    get_result = CliRunner().invoke(
        cli_group,
        ["json", "get"],
        input=json.dumps({"branch": "feat/x", "path": "docs/notes.md"}),
        obj=obj,
    )
    get_payload = _json_output(get_result.output)

    assert put_result.exit_code == 0
    assert put_payload == {
        "branch": "feat/x",
        "path": "docs/notes.md",
        "ref_name": "refs/brmem/brs/feat---x",
        "commit": "fake-0001",
        "source_file": str(source_file),
        "success": True,
    }
    assert get_result.exit_code == 0
    assert get_payload == {
        "branch": "feat/x",
        "path": "docs/notes.md",
        "content": "json\n",
        "ref_name": "refs/brmem/brs/feat---x",
        "target": "refs/brmem/brs/feat---x",
        "at": None,
        "success": True,
    }


def test_brmem_put_from_stdin_defaults_memory_path(cli_group: ClinkrGroup) -> None:
    obj = {
        "brmem_gateway": FakeBranchMemoryGateway(),
        "git_gateway": FakeGitGateway(current_branch_by_path={Path.cwd(): "feat/x"}),
    }

    put_result = CliRunner().invoke(
        cli_group,
        ["put", "file.md", "--stdin"],
        input="contents\n",
        obj=obj,
    )
    get_result = CliRunner().invoke(
        cli_group,
        ["get", "file.md"],
        obj=obj,
    )

    assert put_result.exit_code == 0, put_result.output
    assert "Stored file.md from stdin for branch feat/x." in put_result.output
    assert "Ref: refs/brmem/brs/feat---x" in put_result.output
    assert "Commit: fake-0001" in put_result.output
    assert "Inspect: git show refs/brmem/brs/feat---x:file.md" in put_result.output
    assert get_result.exit_code == 0, get_result.output
    assert get_result.output == "contents\n"


def test_brmem_json_put_from_stdin_is_rejected(cli_group: ClinkrGroup) -> None:
    obj = {
        "brmem_gateway": FakeBranchMemoryGateway(),
        "git_gateway": FakeGitGateway(current_branch_by_path={Path.cwd(): "feat/x"}),
    }

    put_result = CliRunner().invoke(
        cli_group,
        ["json", "put"],
        input=json.dumps(
            {
                "path": "file.md",
                "stdin": True,
            }
        ),
        obj=obj,
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
        ["put", "docs/notes.md", "--file", str(source_file), "--branch", "feat---x"],
        obj={"brmem_gateway": FakeBranchMemoryGateway()},
    )

    assert result.exit_code == 1
    assert "Invalid branch name 'feat---x'" in result.output


def test_brmem_explicit_branch_overrides_current_branch(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    source_file = tmp_path / "local.txt"
    source_file.write_text("hello\n", encoding="utf-8")
    obj = {
        "brmem_gateway": FakeBranchMemoryGateway(),
        "git_gateway": FakeGitGateway(current_branch_by_path={Path.cwd(): "feat/current"}),
    }

    put_result = CliRunner().invoke(
        cli_group,
        ["put", "docs/notes.md", "--file", str(source_file), "--branch", "feat/other"],
        obj=obj,
    )
    get_result = CliRunner().invoke(
        cli_group,
        ["get", "docs/notes.md", "--branch", "feat/other"],
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
        ["put", "docs/notes.md", "--file", str(source_file)],
        obj={
            "brmem_gateway": FakeBranchMemoryGateway(),
            "git_gateway": FakeGitGateway(current_branch_by_path={Path.cwd(): DetachedHead()}),
        },
    )

    assert result.exit_code == 1
    assert "detached head" in result.output.lower()


def test_brmem_put_defaults_memory_path_from_file(
    cli_group: ClinkrGroup, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.chdir(tmp_path)
    source_file = Path("plan.md")
    source_file.write_text("hello\n", encoding="utf-8")
    obj = {
        "brmem_gateway": FakeBranchMemoryGateway(),
        "git_gateway": FakeGitGateway(current_branch_by_path={Path.cwd(): "feat/x"}),
    }

    put_result = CliRunner().invoke(
        cli_group,
        ["put", "plan.md"],
        obj=obj,
    )
    get_result = CliRunner().invoke(
        cli_group,
        ["get", "plan.md"],
        obj=obj,
    )

    assert put_result.exit_code == 0, put_result.output
    assert "Stored plan.md from plan.md for branch feat/x." in put_result.output
    assert "Ref: refs/brmem/brs/feat---x" in put_result.output
    assert "Commit: fake-0001" in put_result.output
    assert "Inspect: git show refs/brmem/brs/feat---x:plan.md" in put_result.output
    assert get_result.exit_code == 0, get_result.output
    assert get_result.output == "hello\n"


def test_brmem_put_with_explicit_source_file(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    source_file = tmp_path / "sdfsdfs.md"
    source_file.write_text("hello\n", encoding="utf-8")
    obj = {
        "brmem_gateway": FakeBranchMemoryGateway(),
        "git_gateway": FakeGitGateway(current_branch_by_path={Path.cwd(): "feat/x"}),
    }

    put_result = CliRunner().invoke(
        cli_group,
        ["put", "file.md", "--file", str(source_file)],
        obj=obj,
    )
    get_result = CliRunner().invoke(
        cli_group,
        ["get", "file.md"],
        obj=obj,
    )

    assert put_result.exit_code == 0, put_result.output
    assert f"Stored file.md from {source_file} for branch feat/x." in put_result.output
    assert get_result.exit_code == 0, get_result.output
    assert get_result.output == "hello\n"


def test_brmem_put_rejects_stdin_and_file_together(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    source_file = tmp_path / "local.txt"
    source_file.write_text("hello\n", encoding="utf-8")
    obj = {
        "brmem_gateway": FakeBranchMemoryGateway(),
        "git_gateway": FakeGitGateway(current_branch_by_path={Path.cwd(): "feat/x"}),
    }

    result = CliRunner().invoke(
        cli_group,
        ["put", "file.md", "--stdin", "--file", str(source_file)],
        input="contents\n",
        obj=obj,
    )

    assert result.exit_code == 1
    assert "--stdin and --file are mutually exclusive." in result.output


def test_brmem_get_surfaces_git_failure_when_branch_omitted(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["get", "docs/notes.md"],
        obj={
            "brmem_gateway": FakeBranchMemoryGateway(),
            "git_gateway": FakeGitGateway(
                current_branch_by_path={
                    Path.cwd(): GitCommandFailure(
                        message="fatal: not a git repository",
                        returncode=128,
                    )
                }
            ),
        },
    )

    assert result.exit_code == 1
    assert "not a git repository" in result.output


def test_brmem_missing_content_error_mentions_ref_target(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["get", "docs/missing.md", "--branch", "feat/x"],
        obj={"brmem_gateway": FakeBranchMemoryGateway()},
    )

    assert result.exit_code == 1
    assert "refs/brmem/brs/feat---x" in result.output
    assert "git ls-tree -r refs/brmem/brs/feat---x" in result.output


def test_brmem_list_after_puts_human(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("feat/x", "docs/b.md", "b\n")
    gateway.put("feat/x", "docs/a.md", "a\n")
    obj = {
        "brmem_gateway": gateway,
        "git_gateway": FakeGitGateway(current_branch_by_path={Path.cwd(): "feat/x"}),
    }

    result = CliRunner().invoke(cli_group, ["list"], obj=obj)

    assert result.exit_code == 0, result.output
    assert result.output == "docs/a.md\ndocs/b.md\n"


def test_brmem_list_empty_branch_human(cli_group: ClinkrGroup) -> None:
    obj = {
        "brmem_gateway": FakeBranchMemoryGateway(),
        "git_gateway": FakeGitGateway(current_branch_by_path={Path.cwd(): "feat/x"}),
    }

    result = CliRunner().invoke(cli_group, ["list"], obj=obj)

    assert result.exit_code == 0, result.output
    assert result.output == ""


def test_brmem_list_at_option(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    first_commit = gateway.put("feat/x", "a.md", "one\n")
    gateway.put("feat/x", "b.md", "two\n")
    obj = {
        "brmem_gateway": gateway,
        "git_gateway": FakeGitGateway(current_branch_by_path={Path.cwd(): "feat/x"}),
    }

    result = CliRunner().invoke(cli_group, ["list", "--at", first_commit], obj=obj)

    assert result.exit_code == 0, result.output
    assert result.output == "a.md\n"


def test_brmem_list_branch_option(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("feat/y", "only-on-y.md", "y\n")
    gateway.put("feat/x", "only-on-x.md", "x\n")
    obj = {
        "brmem_gateway": gateway,
        "git_gateway": FakeGitGateway(current_branch_by_path={Path.cwd(): "feat/x"}),
    }

    result = CliRunner().invoke(cli_group, ["list", "--branch", "feat/y"], obj=obj)

    assert result.exit_code == 0, result.output
    assert result.output == "only-on-y.md\n"


def test_brmem_json_list(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("feat/x", "docs/b.md", "b\n")
    gateway.put("feat/x", "docs/a.md", "a\n")
    obj = {
        "brmem_gateway": gateway,
        "git_gateway": FakeGitGateway(current_branch_by_path={Path.cwd(): "feat/x"}),
    }

    result = CliRunner().invoke(
        cli_group,
        ["json", "list"],
        input=json.dumps({"branch": "feat/x"}),
        obj=obj,
    )
    payload = _json_output(result.output)

    assert result.exit_code == 0, result.output
    assert payload == {
        "branch": "feat/x",
        "ref_name": "refs/brmem/brs/feat---x",
        "target": "refs/brmem/brs/feat---x",
        "paths": ["docs/a.md", "docs/b.md"],
        "at": None,
        "success": True,
    }


def test_brmem_public_commands_have_json_counterparts(cli_group: ClinkrGroup) -> None:
    json_group = cli_group.commands["json"]
    assert isinstance(json_group, click.Group)
    public_commands = {name for name in cli_group.commands if name != "json"}

    assert public_commands <= set(json_group.commands)
