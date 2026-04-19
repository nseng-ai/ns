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
    assert "copy" in result.output
    assert "list" in result.output
    assert "check" in result.output
    assert "branch" in result.output
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


# ---------------------------------------------------------------------------
# brmem copy
# ---------------------------------------------------------------------------


def test_brmem_copy_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["copy", "-h"])

    assert result.exit_code == 0
    assert "Usage: brmem copy" in result.output
    assert "--from-branch" in result.output
    assert "--to-branch" in result.output
    assert "--at" in result.output


def test_brmem_copy_defaults_destination_to_current_branch(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("feat/source", "docs/notes.md", "hello\n")
    obj = {
        "brmem_gateway": gateway,
        "git_gateway": FakeGitGateway(current_branch_by_path={Path.cwd(): "feat/dest"}),
    }

    result = CliRunner().invoke(
        cli_group,
        ["copy", "docs/notes.md", "--from-branch", "feat/source"],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    assert "Copied docs/notes.md from branch feat/source to branch feat/dest." in result.output
    assert "Source: refs/brmem/brs/feat---source" in result.output
    assert "Ref: refs/brmem/brs/feat---dest" in result.output
    assert "Inspect: git show refs/brmem/brs/feat---dest:docs/notes.md" in result.output
    assert gateway.get("feat/dest", "docs/notes.md") == "hello\n"


def test_brmem_copy_with_explicit_destination_branch(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("feat/source", "docs/notes.md", "hello\n")
    obj = {
        "brmem_gateway": gateway,
        "git_gateway": FakeGitGateway(current_branch_by_path={Path.cwd(): "feat/current"}),
    }

    result = CliRunner().invoke(
        cli_group,
        [
            "copy",
            "docs/notes.md",
            "--from-branch",
            "feat/source",
            "--to-branch",
            "feat/explicit",
        ],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    assert "to branch feat/explicit." in result.output
    assert gateway.get("feat/explicit", "docs/notes.md") == "hello\n"
    assert gateway.get("feat/current", "docs/notes.md") is None


def test_brmem_copy_at_reads_historical_source(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    first_commit = gateway.put("feat/source", "docs/notes.md", "one\n")
    gateway.put("feat/source", "docs/notes.md", "two\n")
    obj = {
        "brmem_gateway": gateway,
        "git_gateway": FakeGitGateway(current_branch_by_path={Path.cwd(): "feat/dest"}),
    }

    result = CliRunner().invoke(
        cli_group,
        [
            "copy",
            "docs/notes.md",
            "--from-branch",
            "feat/source",
            "--at",
            first_commit,
        ],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    assert f"Source: {first_commit}" in result.output
    assert gateway.get("feat/dest", "docs/notes.md") == "one\n"


def test_brmem_copy_missing_source_errors_without_writing(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    obj = {
        "brmem_gateway": gateway,
        "git_gateway": FakeGitGateway(current_branch_by_path={Path.cwd(): "feat/dest"}),
    }

    result = CliRunner().invoke(
        cli_group,
        ["copy", "docs/missing.md", "--from-branch", "feat/source"],
        obj=obj,
    )

    assert result.exit_code == 1
    assert "refs/brmem/brs/feat---source" in result.output
    assert "git ls-tree -r refs/brmem/brs/feat---source" in result.output
    assert gateway.get("feat/dest", "docs/missing.md") is None
    assert gateway.list("feat/dest") == []


def test_brmem_copy_json_mode_returns_expected_payload(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("feat/source", "docs/notes.md", "hello\n")
    obj = {
        "brmem_gateway": gateway,
        "git_gateway": FakeGitGateway(current_branch_by_path={Path.cwd(): "feat/dest"}),
    }

    result = CliRunner().invoke(
        cli_group,
        ["json", "copy"],
        input=json.dumps(
            {
                "path": "docs/notes.md",
                "from_branch": "feat/source",
            }
        ),
        obj=obj,
    )
    payload = _json_output(result.output)

    assert result.exit_code == 0, result.output
    assert payload == {
        "path": "docs/notes.md",
        "from_branch": "feat/source",
        "to_branch": "feat/dest",
        "source_target": "refs/brmem/brs/feat---source",
        "ref_name": "refs/brmem/brs/feat---dest",
        "commit": "fake-0002",
        "at": None,
        "success": True,
    }


def test_brmem_copy_invalid_source_branch_surfaces_clean_error(cli_group: ClinkrGroup) -> None:
    obj = {
        "brmem_gateway": FakeBranchMemoryGateway(),
        "git_gateway": FakeGitGateway(current_branch_by_path={Path.cwd(): "feat/dest"}),
    }

    result = CliRunner().invoke(
        cli_group,
        ["copy", "docs/notes.md", "--from-branch", "feat---bad"],
        obj=obj,
    )

    assert result.exit_code == 1
    assert "Invalid branch name 'feat---bad'" in result.output


def test_brmem_copy_invalid_destination_branch_surfaces_clean_error(
    cli_group: ClinkrGroup,
) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("feat/source", "docs/notes.md", "hello\n")

    result = CliRunner().invoke(
        cli_group,
        [
            "copy",
            "docs/notes.md",
            "--from-branch",
            "feat/source",
            "--to-branch",
            "feat---bad",
        ],
        obj={"brmem_gateway": gateway},
    )

    assert result.exit_code == 1
    assert "Invalid branch name 'feat---bad'" in result.output
    assert gateway.list("feat/source") == ["docs/notes.md"]


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


# ---------------------------------------------------------------------------
# brmem check
# ---------------------------------------------------------------------------


def _check_runner() -> CliRunner:
    return CliRunner()


def test_brmem_check_present_path_emits_diagnostic(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("feat/x", "docs/notes.md", "hello\n")
    obj = {
        "brmem_gateway": gateway,
        "git_gateway": FakeGitGateway(current_branch_by_path={Path.cwd(): "feat/x"}),
    }

    result = _check_runner().invoke(cli_group, ["check", "docs/notes.md"], obj=obj)

    assert result.exit_code == 0, result.stderr
    assert result.stderr == ""
    assert "path: docs/notes.md" in result.stdout
    assert "branch: feat/x" in result.stdout
    assert "ref: refs/brmem/brs/feat---x" in result.stdout
    assert "target: refs/brmem/brs/feat---x" in result.stdout
    assert "blob: blob-fake-0001-docs/notes.md" in result.stdout
    assert "size: 6" in result.stdout
    assert "last_commit: fake-0001" in result.stdout


def test_brmem_check_missing_path_exits_one_with_stderr(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("feat/x", "docs/notes.md", "hello\n")
    obj = {
        "brmem_gateway": gateway,
        "git_gateway": FakeGitGateway(current_branch_by_path={Path.cwd(): "feat/x"}),
    }

    result = _check_runner().invoke(cli_group, ["check", "docs/missing.md"], obj=obj)

    assert result.exit_code == 1
    assert result.stdout == ""
    assert (
        result.stderr.strip()
        == "not found: docs/missing.md in branch feat/x at refs/brmem/brs/feat---x"
    )


def test_brmem_check_missing_ref_exits_one(cli_group: ClinkrGroup) -> None:
    obj = {
        "brmem_gateway": FakeBranchMemoryGateway(),
        "git_gateway": FakeGitGateway(current_branch_by_path={Path.cwd(): "feat/x"}),
    }

    result = _check_runner().invoke(cli_group, ["check", "docs/missing.md"], obj=obj)

    assert result.exit_code == 1
    assert result.stdout == ""
    assert (
        result.stderr.strip()
        == "not found: docs/missing.md in branch feat/x at refs/brmem/brs/feat---x"
    )


def test_brmem_check_at_returns_historical_diagnostic(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    first_commit = gateway.put("feat/x", "docs/notes.md", "one\n")
    gateway.put("feat/x", "docs/notes.md", "two-and-three\n")
    obj = {
        "brmem_gateway": gateway,
        "git_gateway": FakeGitGateway(current_branch_by_path={Path.cwd(): "feat/x"}),
    }

    result = _check_runner().invoke(
        cli_group,
        ["check", "docs/notes.md", "--at", first_commit],
        obj=obj,
    )

    assert result.exit_code == 0, result.stderr
    assert "size: 4" in result.stdout
    assert f"target: {first_commit}" in result.stdout
    assert f"blob: blob-{first_commit}-docs/notes.md" in result.stdout


def test_brmem_check_explicit_branch_overrides_current(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("feat/other", "docs/notes.md", "other\n")
    obj = {
        "brmem_gateway": gateway,
        "git_gateway": FakeGitGateway(current_branch_by_path={Path.cwd(): "feat/x"}),
    }

    result = _check_runner().invoke(
        cli_group,
        ["check", "docs/notes.md", "--branch", "feat/other"],
        obj=obj,
    )

    assert result.exit_code == 0, result.stderr
    assert "branch: feat/other" in result.stdout
    assert "ref: refs/brmem/brs/feat---other" in result.stdout


def test_brmem_check_invalid_branch_exits_two(cli_group: ClinkrGroup) -> None:
    result = _check_runner().invoke(
        cli_group,
        ["check", "docs/notes.md", "--branch", "feat---x"],
        obj={"brmem_gateway": FakeBranchMemoryGateway()},
    )

    assert result.exit_code == 2
    assert "Invalid branch name 'feat---x'" in result.stderr


def test_brmem_check_detached_head_exits_two(cli_group: ClinkrGroup) -> None:
    result = _check_runner().invoke(
        cli_group,
        ["check", "docs/notes.md"],
        obj={
            "brmem_gateway": FakeBranchMemoryGateway(),
            "git_gateway": FakeGitGateway(
                current_branch_by_path={Path.cwd(): DetachedHead()},
            ),
        },
    )

    assert result.exit_code == 2
    assert "detached head" in result.stderr.lower()


def test_brmem_json_check_present(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("feat/x", "docs/notes.md", "hello\n")
    obj = {
        "brmem_gateway": gateway,
        "git_gateway": FakeGitGateway(current_branch_by_path={Path.cwd(): "feat/x"}),
    }

    result = CliRunner().invoke(
        cli_group,
        ["json", "check"],
        input=json.dumps({"path": "docs/notes.md"}),
        obj=obj,
    )
    payload = _json_output(result.output)

    assert result.exit_code == 0, result.output
    assert payload["success"] is True
    assert payload["exists"] is True
    assert payload["branch"] == "feat/x"
    assert payload["ref_name"] == "refs/brmem/brs/feat---x"
    assert payload["blob_sha"] == "blob-fake-0001-docs/notes.md"
    assert payload["size_bytes"] == 6
    assert payload["last_commit_sha"] == "fake-0001"


def test_brmem_json_check_missing_returns_success_false_exists(cli_group: ClinkrGroup) -> None:
    obj = {
        "brmem_gateway": FakeBranchMemoryGateway(),
        "git_gateway": FakeGitGateway(current_branch_by_path={Path.cwd(): "feat/x"}),
    }

    result = CliRunner().invoke(
        cli_group,
        ["json", "check"],
        input=json.dumps({"path": "docs/missing.md"}),
        obj=obj,
    )
    payload = _json_output(result.output)

    assert result.exit_code == 0, result.output
    assert payload["success"] is True
    assert payload["exists"] is False
    assert payload["blob_sha"] is None
    assert payload["size_bytes"] is None


# ---------------------------------------------------------------------------
# brmem branch check
# ---------------------------------------------------------------------------


def test_brmem_branch_check_present(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("feat/x", "a.md", "a\n")
    gateway.put("feat/x", "b.md", "b\n")
    gateway.put("feat/x", "c.md", "c\n")
    obj = {
        "brmem_gateway": gateway,
        "git_gateway": FakeGitGateway(current_branch_by_path={Path.cwd(): "feat/x"}),
    }

    result = _check_runner().invoke(cli_group, ["branch", "check"], obj=obj)

    assert result.exit_code == 0, result.stderr
    assert result.stderr == ""
    assert "branch: feat/x" in result.stdout
    assert "encoded: feat---x" in result.stdout
    assert "ref: refs/brmem/brs/feat---x" in result.stdout
    assert "head: fake-0003" in result.stdout
    assert "path_count: 3" in result.stdout


def test_brmem_branch_check_missing_ref_exits_one(cli_group: ClinkrGroup) -> None:
    obj = {
        "brmem_gateway": FakeBranchMemoryGateway(),
        "git_gateway": FakeGitGateway(current_branch_by_path={Path.cwd(): "feat/x"}),
    }

    result = _check_runner().invoke(cli_group, ["branch", "check"], obj=obj)

    assert result.exit_code == 1
    assert result.stdout == ""
    assert result.stderr.strip() == "not found: no brmem ref for branch feat/x"


def test_brmem_branch_check_explicit_branch_argument(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("feat/other", "a.md", "a\n")
    obj = {
        "brmem_gateway": gateway,
        "git_gateway": FakeGitGateway(current_branch_by_path={Path.cwd(): "feat/x"}),
    }

    result = _check_runner().invoke(cli_group, ["branch", "check", "feat/other"], obj=obj)

    assert result.exit_code == 0, result.stderr
    assert "branch: feat/other" in result.stdout
    assert "path_count: 1" in result.stdout


def test_brmem_branch_check_invalid_branch_exits_two(cli_group: ClinkrGroup) -> None:
    result = _check_runner().invoke(
        cli_group,
        ["branch", "check", "feat---x"],
        obj={"brmem_gateway": FakeBranchMemoryGateway()},
    )

    assert result.exit_code == 2
    assert "Invalid branch name 'feat---x'" in result.stderr


def test_brmem_branch_help_lists_check(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["branch", "-h"])

    assert result.exit_code == 0
    assert "Branch-level brmem operations." in result.output
    assert "check" in result.output


def test_brmem_branch_check_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["branch", "check", "-h"])

    assert result.exit_code == 0
    assert "Check whether a branch has a brmem ref." in result.output


def test_brmem_json_branch_check_present(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("feat/x", "a.md", "a\n")
    obj = {
        "brmem_gateway": gateway,
        "git_gateway": FakeGitGateway(current_branch_by_path={Path.cwd(): "feat/x"}),
    }

    result = CliRunner().invoke(
        cli_group,
        ["branch", "json", "check"],
        input=json.dumps({"branch": "feat/x"}),
        obj=obj,
    )
    payload = _json_output(result.output)

    assert result.exit_code == 0, result.output
    assert payload["success"] is True
    assert payload["exists"] is True
    assert payload["branch"] == "feat/x"
    assert payload["encoded"] == "feat---x"
    assert payload["ref_name"] == "refs/brmem/brs/feat---x"
    assert payload["head_sha"] == "fake-0001"
    assert payload["path_count"] == 1


def test_brmem_json_branch_check_missing(cli_group: ClinkrGroup) -> None:
    obj = {
        "brmem_gateway": FakeBranchMemoryGateway(),
        "git_gateway": FakeGitGateway(current_branch_by_path={Path.cwd(): "feat/x"}),
    }

    result = CliRunner().invoke(
        cli_group,
        ["branch", "json", "check"],
        input=json.dumps({"branch": "feat/x"}),
        obj=obj,
    )
    payload = _json_output(result.output)

    assert result.exit_code == 0, result.output
    assert payload["success"] is True
    assert payload["exists"] is False
    assert payload["head_sha"] is None
    assert payload["path_count"] is None
