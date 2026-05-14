from __future__ import annotations

import json
from pathlib import Path

import pytest
from click.testing import CliRunner

from asdl_core.clinkr.context import ClinkrContextObject, build_clinkr_context_object
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.git.testing import FakeGitGateway
from asdl_core.git.types import DetachedHead, GitCommandFailure
from brmem.context import BrmemCliContext
from brmem.fake import FakeBranchMemoryGateway
from brmem.main import build_cli


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def _json_output(text: str) -> dict[str, object]:
    return json.loads(text)


def _list_line(namespace: str | None, key: str, branch: str = "feat/x") -> str:
    scope = f"Namespace {namespace}" if namespace is not None else "Base"
    return f"{scope} | Entry Key {key} | Branch {branch}"


def _make_obj(
    *,
    gateway: FakeBranchMemoryGateway | None = None,
    branch: str | DetachedHead | GitCommandFailure | None = "feat/x",
) -> ClinkrContextObject:
    brmem_gateway = gateway if gateway is not None else FakeBranchMemoryGateway()
    if branch is None:
        git_gateway = FakeGitGateway()
    else:
        git_gateway = FakeGitGateway(current_branch_by_path={Path.cwd(): branch})
    ctx = BrmemCliContext(brmem_gateway=brmem_gateway, git_gateway=git_gateway)
    return build_clinkr_context_object(lambda: ctx)


# ---------------------------------------------------------------------------
# help / version
# ---------------------------------------------------------------------------


def test_brmem_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["-h"])

    assert result.exit_code == 0
    assert "Usage: brmem" in result.output
    assert "Manage Branch Memory Entries stored in git refs." in result.output
    assert "--version" in result.output
    assert "put" in result.output
    assert "get" in result.output
    assert "delete" in result.output
    assert "list" in result.output
    assert "check" in result.output
    assert "copy" in result.output
    assert "export" in result.output
    # The exec subgroup is hidden; neither it nor its operations should appear
    # in top-level brmem -h output.
    assert "exec" not in result.output
    assert "resolve-prompt" not in result.output
    assert "list-artifacts" not in result.output
    assert "check-artifact" not in result.output
    assert "check-entry" not in result.output
    # The legacy `branch` subgroup should no longer appear as a command.
    command_lines = [line for line in result.output.splitlines() if line.startswith("  ")]
    assert not any(line.lstrip().split(" ", 1)[0] == "branch" for line in command_lines)


def test_brmem_exec_help_lists_resolve_prompt(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "-h"])

    assert result.exit_code == 0
    assert "resolve-prompt" in result.output


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
            "plan/plan.md",
            "--namespace",
            "scratch",
            "--file",
            str(source_file),
        ],
        obj=obj,
    )
    get_result = CliRunner().invoke(
        cli_group,
        ["get", "plan/plan.md", "--namespace", "scratch"],
        obj=obj,
    )

    assert put_result.exit_code == 0, put_result.output
    assert (
        f"Stored Entry Key plan/plan.md from {source_file} in Namespace scratch on Branch feat/x."
        in put_result.output
    )
    assert "Ref: refs/brmem/ns/scratch/feat---x:plan/plan.md" in put_result.output
    assert "Commit: fake-0001" in put_result.output
    assert "Inspect: git show refs/brmem/ns/scratch/feat---x:plan/plan.md" in put_result.output
    assert get_result.exit_code == 0, get_result.output
    assert get_result.output == "hello\n"


def test_brmem_put_sibling_keys_are_independent(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    a_v1 = tmp_path / "a-v1.txt"
    a_v1.write_text("a1\n", encoding="utf-8")
    a_v2 = tmp_path / "a-v2.txt"
    a_v2.write_text("a2\n", encoding="utf-8")
    b_v1 = tmp_path / "b-v1.txt"
    b_v1.write_text("b1\n", encoding="utf-8")
    obj = _make_obj()

    runner = CliRunner()
    runner.invoke(
        cli_group,
        ["put", "plan/a.md", "--namespace", "scratch", "--file", str(a_v1)],
        obj=obj,
    )
    runner.invoke(
        cli_group,
        ["put", "plan/b.md", "--namespace", "scratch", "--file", str(b_v1)],
        obj=obj,
    )
    runner.invoke(
        cli_group,
        ["put", "plan/a.md", "--namespace", "scratch", "--file", str(a_v2)],
        obj=obj,
    )

    a_get = runner.invoke(
        cli_group,
        ["get", "plan/a.md", "--namespace", "scratch"],
        obj=obj,
    )
    b_get = runner.invoke(
        cli_group,
        ["get", "plan/b.md", "--namespace", "scratch"],
        obj=obj,
    )
    list_result = runner.invoke(
        cli_group,
        ["list", "--namespace", "scratch"],
        obj=obj,
    )

    assert a_get.exit_code == 0
    assert a_get.output == "a2\n"
    assert b_get.exit_code == 0
    assert b_get.output == "b1\n"
    assert list_result.exit_code == 0
    assert list_result.output.splitlines() == [
        _list_line("scratch", "plan/a.md"),
        _list_line("scratch", "plan/b.md"),
    ]


def test_brmem_get_at_reads_older_snapshot(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    first_commit = gateway.put("scratch", "plan/plan.md", "feat/x", "one\n")
    gateway.put("scratch", "plan/plan.md", "feat/x", "two\n")

    result = CliRunner().invoke(
        cli_group,
        [
            "get",
            "plan/plan.md",
            "--namespace",
            "scratch",
            "--at",
            first_commit,
        ],
        obj=_make_obj(gateway=gateway),
    )

    assert result.exit_code == 0, result.output
    assert result.output == "one\n"


def test_brmem_at_accepts_raw_treeish(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("scratch", "plan/plan.md", "feat/x", "one\n")
    # Hand an at value that has no known history; fake returns None -> missing.
    result = CliRunner().invoke(
        cli_group,
        [
            "get",
            "plan/plan.md",
            "--namespace",
            "scratch",
            "--at",
            "deadbeef",
        ],
        obj=_make_obj(gateway=gateway),
    )

    assert result.exit_code == 2
    assert "at deadbeef" in result.output


def test_brmem_json_put_and_get(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    source_file = tmp_path / "local.txt"
    source_file.write_text("json\n", encoding="utf-8")
    obj = _make_obj()

    put_result = CliRunner().invoke(
        cli_group,
        [
            "put",
            "plan/plan.md",
            "--namespace",
            "scratch",
            "--file",
            str(source_file),
            "--format",
            "json",
        ],
        obj=obj,
    )
    put_payload = _json_output(put_result.output)

    get_result = CliRunner().invoke(
        cli_group,
        [
            "get",
            "plan/plan.md",
            "--namespace",
            "scratch",
            "--branch",
            "feat/x",
            "--format",
            "json",
        ],
        obj=obj,
    )
    get_payload = _json_output(get_result.output)

    assert put_result.exit_code == 0
    assert put_payload["exit_code"] == 0
    assert put_payload["data"] == {
        "namespace": "scratch",
        "key": "plan/plan.md",
        "branch": "feat/x",
        "ref_name": "refs/brmem/ns/scratch/feat---x:plan/plan.md",
        "commit": "fake-0001",
        "source_file": str(source_file),
    }
    assert get_result.exit_code == 0
    assert get_payload["exit_code"] == 0
    assert get_payload["data"] == {
        "namespace": "scratch",
        "key": "plan/plan.md",
        "branch": "feat/x",
        "content": "json\n",
        "ref_name": "refs/brmem/ns/scratch/feat---x:plan/plan.md",
        "target": "refs/brmem/ns/scratch/feat---x:plan/plan.md",
        "at": None,
    }


def test_brmem_put_from_stdin(cli_group: ClinkrGroup) -> None:
    obj = _make_obj()

    put_result = CliRunner().invoke(
        cli_group,
        ["put", "plan/plan.md", "--namespace", "scratch", "--stdin"],
        input="contents\n",
        obj=obj,
    )
    get_result = CliRunner().invoke(
        cli_group,
        ["get", "plan/plan.md", "--namespace", "scratch"],
        obj=obj,
    )

    assert put_result.exit_code == 0, put_result.output
    assert (
        "Stored Entry Key plan/plan.md from stdin in Namespace scratch on Branch feat/x."
        in put_result.output
    )
    assert "Ref: refs/brmem/ns/scratch/feat---x:plan/plan.md" in put_result.output
    assert "Commit: fake-0001" in put_result.output
    assert get_result.exit_code == 0, get_result.output
    assert get_result.output == "contents\n"


def test_brmem_json_put_from_stdin_is_rejected(cli_group: ClinkrGroup) -> None:
    put_result = CliRunner().invoke(
        cli_group,
        [
            "put",
            "plan/plan.md",
            "--namespace",
            "scratch",
            "--stdin",
            "--format",
            "json",
        ],
        obj=_make_obj(),
    )
    put_payload = _json_output(put_result.output)

    assert put_result.exit_code == 2
    assert put_payload == {
        "exit_code": 2,
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
            "plan/plan.md",
            "--namespace",
            "scratch",
            "--file",
            str(source_file),
            "--branch",
            "feat---x",
        ],
        obj=_make_obj(branch=None),
    )

    assert result.exit_code == 2
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
            "plan/plan.md",
            "--namespace",
            "ns/with/slash",
            "--file",
            str(source_file),
        ],
        obj=_make_obj(),
    )

    assert result.exit_code == 2
    assert "Invalid namespace 'ns/with/slash'" in result.output


def test_brmem_invalid_key_surfaces_clean_error(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    source_file = tmp_path / "local.txt"
    source_file.write_text("hello\n", encoding="utf-8")

    result = CliRunner().invoke(
        cli_group,
        [
            "put",
            "../escape",
            "--namespace",
            "scratch",
            "--file",
            str(source_file),
        ],
        obj=_make_obj(),
    )

    assert result.exit_code == 2
    assert "Invalid key '../escape'" in result.output


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
            "plan/plan.md",
            "--namespace",
            "scratch",
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
            "plan/plan.md",
            "--namespace",
            "scratch",
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
            "plan/plan.md",
            "--namespace",
            "scratch",
            "--file",
            str(source_file),
        ],
        obj=_make_obj(branch=DetachedHead()),
    )

    assert result.exit_code == 2
    assert "detached head" in result.output.lower()


def test_brmem_put_defaults_source_file_from_key_basename(
    cli_group: ClinkrGroup, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.chdir(tmp_path)
    source_file = Path("plan.md")
    source_file.write_text("hello\n", encoding="utf-8")
    obj = _make_obj()

    put_result = CliRunner().invoke(
        cli_group,
        ["put", "plan/plan.md", "--namespace", "scratch"],
        obj=obj,
    )
    get_result = CliRunner().invoke(
        cli_group,
        ["get", "plan/plan.md", "--namespace", "scratch"],
        obj=obj,
    )

    assert put_result.exit_code == 0, put_result.output
    assert (
        "Stored Entry Key plan/plan.md from plan.md in Namespace scratch on Branch feat/x."
        in put_result.output
    )
    assert "Ref: refs/brmem/ns/scratch/feat---x:plan/plan.md" in put_result.output
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
            "plan/plan.md",
            "--namespace",
            "scratch",
            "--stdin",
            "--file",
            str(source_file),
        ],
        input="contents\n",
        obj=obj,
    )

    assert result.exit_code == 2
    assert "--stdin and --file are mutually exclusive." in result.output


# ---------------------------------------------------------------------------
# brmem put: size + binary guardrails
# ---------------------------------------------------------------------------


def test_brmem_put_rejects_oversized_file(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    source_file = tmp_path / "big.md"
    source_file.write_bytes(b"x" * ((1 << 20) + 1))

    result = CliRunner().invoke(
        cli_group,
        ["put", "plan/big.md", "--namespace", "scratch", "--file", str(source_file)],
        obj=_make_obj(),
    )

    assert result.exit_code == 2
    assert "capped at 1 MiB" in result.output
    assert "-f / --force" in result.output


def test_brmem_put_force_accepts_oversized_file(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    source_file = tmp_path / "big.md"
    payload = ("y" * ((1 << 20) + 1)) + "\n"
    source_file.write_text(payload, encoding="utf-8")
    obj = _make_obj()

    put_result = CliRunner().invoke(
        cli_group,
        ["put", "plan/big.md", "--namespace", "scratch", "--file", str(source_file), "-f"],
        obj=obj,
    )
    get_result = CliRunner().invoke(
        cli_group,
        ["get", "plan/big.md", "--namespace", "scratch"],
        obj=obj,
    )

    assert put_result.exit_code == 0, put_result.output
    assert get_result.exit_code == 0, get_result.output
    assert get_result.output == payload


def test_brmem_put_rejects_binary_file(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    source_file = tmp_path / "binary.dat"
    source_file.write_bytes(b"hello\x00world")

    result = CliRunner().invoke(
        cli_group,
        ["put", "scratchpad", "--namespace", "scratch", "--file", str(source_file)],
        obj=_make_obj(),
    )

    assert result.exit_code == 2
    assert "binary" in result.output
    assert "offset 5" in result.output
    assert "-f / --force" in result.output


def test_brmem_put_force_accepts_binary_file(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    source_file = tmp_path / "binary.dat"
    source_file.write_bytes(b"hello\x00world")
    obj = _make_obj()

    put_result = CliRunner().invoke(
        cli_group,
        ["put", "scratchpad", "--namespace", "scratch", "--file", str(source_file), "--force"],
        obj=obj,
    )
    get_result = CliRunner().invoke(
        cli_group,
        ["get", "scratchpad", "--namespace", "scratch"],
        obj=obj,
    )

    assert put_result.exit_code == 0, put_result.output
    assert get_result.exit_code == 0, get_result.output
    assert get_result.output == "hello\x00world\n"


def test_brmem_put_stdin_rejects_oversized_input(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["put", "scratchpad", "--namespace", "scratch", "--stdin"],
        input="z" * ((1 << 20) + 1),
        obj=_make_obj(),
    )

    assert result.exit_code == 2
    assert "<stdin>" in result.output
    assert "capped at 1 MiB" in result.output


def test_brmem_put_stdin_rejects_binary_input(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["put", "scratchpad", "--namespace", "scratch", "--stdin"],
        input=b"hi\x00there",
        obj=_make_obj(),
    )

    assert result.exit_code == 2
    assert "<stdin>" in result.output
    assert "binary" in result.output
    assert "offset 2" in result.output


def test_brmem_put_format_json_reports_size_failure(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    source_file = tmp_path / "big.md"
    source_file.write_bytes(b"x" * ((1 << 20) + 1))

    result = CliRunner().invoke(
        cli_group,
        [
            "put",
            "plan/big.md",
            "--namespace",
            "scratch",
            "--file",
            str(source_file),
            "--format",
            "json",
        ],
        obj=_make_obj(),
    )
    payload = json.loads(result.stdout)

    assert result.exit_code == 2
    assert payload["exit_code"] == 2
    assert payload["error_type"] == "entry_too_large"
    assert "capped at 1 MiB" in payload["message"]


def test_brmem_get_surfaces_git_failure_when_branch_omitted(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["get", "plan/plan.md", "--namespace", "scratch"],
        obj=_make_obj(
            branch=GitCommandFailure(
                message="fatal: not a git repository",
                returncode=128,
            )
        ),
    )

    assert result.exit_code == 2
    assert "not a git repository" in result.output


def test_brmem_missing_content_error_mentions_ref_target(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        [
            "get",
            "plan/missing.md",
            "--namespace",
            "scratch",
            "--branch",
            "feat/x",
        ],
        obj=_make_obj(branch=None),
    )

    assert result.exit_code == 2
    assert "refs/brmem/ns/scratch/feat---x:plan/missing.md" in result.output
    assert "git show refs/brmem/ns/scratch/feat---x:plan/missing.md" in result.output


def test_brmem_get_collects_multiple_validation_errors(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        [
            "get",
            "../escape",
            "--namespace",
            "ns/with/slash",
            "--branch",
            "feat---x",
        ],
        obj=_make_obj(),
    )

    assert result.exit_code == 2
    assert "Invalid brmem request:" in result.output
    assert "Invalid namespace 'ns/with/slash'" in result.output
    assert "Invalid key '../escape'" in result.output
    assert "Invalid branch name 'feat---x'" in result.output


# ---------------------------------------------------------------------------
# brmem list
# ---------------------------------------------------------------------------


def _seed_for_list_filters() -> FakeBranchMemoryGateway:
    gateway = FakeBranchMemoryGateway()
    gateway.put("scratch", "plan", "feat/x", "a\n")
    gateway.put("scratch", "plan", "feat/y", "a\n")
    gateway.put("scratch", "notes", "feat/x", "a\n")
    gateway.put("notes", "obj-1", "feat/x", "a\n")
    return gateway


@pytest.mark.parametrize(
    ("args", "expected_lines"),
    [
        (
            [],
            [
                _list_line("notes", "obj-1"),
                _list_line("scratch", "notes"),
                _list_line("scratch", "plan"),
            ],
        ),
        (
            ["--namespace", "scratch"],
            [
                _list_line("scratch", "notes"),
                _list_line("scratch", "plan"),
            ],
        ),
        (
            ["--key", "plan"],
            [_list_line("scratch", "plan")],
        ),
        (
            ["--branch", "feat/x"],
            [
                _list_line("notes", "obj-1"),
                _list_line("scratch", "notes"),
                _list_line("scratch", "plan"),
            ],
        ),
        (
            ["--namespace", "scratch", "--key", "plan"],
            [_list_line("scratch", "plan")],
        ),
        (
            ["--namespace", "scratch", "--branch", "feat/y"],
            [_list_line("scratch", "plan", branch="feat/y")],
        ),
        (
            ["--key", "plan", "--branch", "feat/x"],
            [_list_line("scratch", "plan")],
        ),
        (
            ["--namespace", "scratch", "--key", "plan", "--branch", "feat/x"],
            [_list_line("scratch", "plan")],
        ),
    ],
)
def test_brmem_list_filter_combinations(
    cli_group: ClinkrGroup, args: list[str], expected_lines: list[str]
) -> None:
    obj = _make_obj(gateway=_seed_for_list_filters())

    result = CliRunner().invoke(cli_group, ["list", *args], obj=obj)

    assert result.exit_code == 0, result.output
    assert result.output.splitlines() == expected_lines


def test_brmem_list_defaults_to_current_branch(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(gateway=_seed_for_list_filters(), branch="feat/y")

    result = CliRunner().invoke(cli_group, ["list"], obj=obj)

    assert result.exit_code == 0, result.output
    assert result.output.splitlines() == [_list_line("scratch", "plan", branch="feat/y")]


def test_brmem_list_rejects_detached_head_when_branch_omitted(
    cli_group: ClinkrGroup,
) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["list"],
        obj=_make_obj(branch=DetachedHead()),
    )

    assert result.exit_code == 2
    assert "detached head" in result.output.lower()


def test_brmem_list_surfaces_git_failure_when_branch_omitted(
    cli_group: ClinkrGroup,
) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["list"],
        obj=_make_obj(
            branch=GitCommandFailure(
                message="fatal: not a git repository",
                returncode=128,
            )
        ),
    )

    assert result.exit_code == 2
    assert "not a git repository" in result.output


def test_brmem_list_explicit_branch_bypasses_current_branch(
    cli_group: ClinkrGroup,
) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("scratch", "plan", "feat/other", "a\n")

    result = CliRunner().invoke(
        cli_group,
        ["list", "--branch", "feat/other"],
        obj=_make_obj(gateway=gateway, branch=DetachedHead()),
    )

    assert result.exit_code == 0, result.output
    assert result.output.splitlines() == [_list_line("scratch", "plan", branch="feat/other")]


def test_brmem_list_empty_returns_nothing(cli_group: ClinkrGroup) -> None:
    obj = _make_obj()

    result = CliRunner().invoke(cli_group, ["list"], obj=obj)

    assert result.exit_code == 0, result.output
    assert result.output == ""


def test_brmem_list_filters_by_key_with_slash(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("scratch", "plan/a.md", "feat/x", "a\n")
    gateway.put("scratch", "plan/b.md", "feat/x", "b\n")
    gateway.put("scratch", "plan/a.md", "feat/y", "a\n")
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(
        cli_group, ["list", "--namespace", "scratch", "--key", "plan/a.md"], obj=obj
    )

    assert result.exit_code == 0, result.output
    assert result.output.splitlines() == [_list_line("scratch", "plan/a.md")]


def test_brmem_json_list(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("scratch", "plan/a.md", "feat/x", "a\n")
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(
        cli_group,
        ["list", "--namespace", "scratch", "--format", "json"],
        obj=obj,
    )
    payload = _json_output(result.output)

    assert result.exit_code == 0, result.output
    assert payload["exit_code"] == 0
    assert payload["data"] == {
        "namespace": "scratch",
        "key": None,
        "branch": "feat/x",
        "base": False,
        "entries": [
            {
                "namespace": "scratch",
                "key": "plan/a.md",
                "branch": "feat/x",
                "ref_name": "refs/brmem/ns/scratch/feat---x:plan/a.md",
            }
        ],
    }


# ---------------------------------------------------------------------------
# brmem check
# ---------------------------------------------------------------------------


def test_brmem_check_hit_exits_zero(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("scratch", "plan/plan.md", "feat/x", "hello\n")

    result = CliRunner().invoke(
        cli_group,
        ["check", "plan/plan.md", "--namespace", "scratch"],
        obj=_make_obj(gateway=gateway),
    )

    assert result.exit_code == 0, result.stderr
    assert result.stderr == ""
    assert "Entry Key: plan/plan.md" in result.stdout
    assert "Namespace: scratch" in result.stdout
    assert "Branch: feat/x" in result.stdout
    assert "Entry Locator: refs/brmem/ns/scratch/feat---x:plan/plan.md" in result.stdout
    assert "Head: fake-0001" in result.stdout
    assert "Blob: blob-fake-0001" in result.stdout
    assert "Size: 6" in result.stdout


def test_brmem_check_miss_exits_one_with_absent_message(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["check", "plan/plan.md", "--namespace", "scratch"],
        obj=_make_obj(),
    )

    assert result.exit_code == 1
    assert result.stdout == ""
    assert result.stderr.strip() == (
        "not found: Entry Key=plan/plan.md Namespace=scratch Branch=feat/x "
        "at refs/brmem/ns/scratch/feat---x:plan/plan.md"
    )


def test_brmem_check_invalid_branch_exits_two(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        [
            "check",
            "plan/plan.md",
            "--namespace",
            "scratch",
            "--branch",
            "feat---x",
        ],
        obj=_make_obj(branch=None),
    )

    assert result.exit_code == 2
    assert "Invalid branch name 'feat---x'" in result.stderr


def test_brmem_check_detached_head_exits_two(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["check", "plan/plan.md", "--namespace", "scratch"],
        obj=_make_obj(branch=DetachedHead()),
    )

    assert result.exit_code == 2
    assert "detached head" in result.stderr.lower()


def test_brmem_check_at_historical(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    first_commit = gateway.put("scratch", "plan/plan.md", "feat/x", "one\n")
    gateway.put("scratch", "plan/plan.md", "feat/x", "two-and-three\n")

    result = CliRunner().invoke(
        cli_group,
        [
            "check",
            "plan/plan.md",
            "--namespace",
            "scratch",
            "--at",
            first_commit,
        ],
        obj=_make_obj(gateway=gateway),
    )

    assert result.exit_code == 0, result.stderr
    assert "Size: 4" in result.stdout
    assert f"Target: {first_commit}" in result.stdout


def test_brmem_json_check_present(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("scratch", "plan/plan.md", "feat/x", "hello\n")
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(
        cli_group,
        ["check", "plan/plan.md", "--namespace", "scratch", "--format", "json"],
        obj=obj,
    )
    payload = _json_output(result.output)

    assert result.exit_code == 0, result.output
    assert payload["exit_code"] == 0
    assert "message" not in payload
    assert "error_type" not in payload
    data = payload["data"]
    assert data["ref_name"] == "refs/brmem/ns/scratch/feat---x:plan/plan.md"
    assert data["size_bytes"] == 6
    assert data["head_sha"] == "fake-0001"
    assert data["blob_sha"] == "blob-fake-0001"


def test_brmem_json_check_missing(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["check", "plan/plan.md", "--namespace", "scratch", "--format", "json"],
        obj=_make_obj(),
    )
    payload = _json_output(result.output)

    assert result.exit_code == 1, result.output
    assert payload["exit_code"] == 1
    assert "not found: Entry Key=plan/plan.md" in payload["message"]
    data = payload["data"]
    assert data["head_sha"] is None
    assert data["size_bytes"] is None


# ---------------------------------------------------------------------------
# --json-schema eagerness / failure envelope
# ---------------------------------------------------------------------------


def test_brmem_put_json_schema_flag_is_eager(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["put", "--json-schema"])
    payload = json.loads(result.stdout)

    assert result.exit_code == 0, result.output
    assert set(payload) == {"input_json_schema", "output_json_schema"}


def test_brmem_get_json_schema_flag_is_eager(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["get", "--json-schema"])
    payload = json.loads(result.stdout)

    assert result.exit_code == 0, result.output
    assert set(payload) == {"input_json_schema", "output_json_schema"}


def test_brmem_list_json_schema_flag_is_eager(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["list", "--json-schema"])
    payload = json.loads(result.stdout)

    assert result.exit_code == 0, result.output
    assert set(payload) == {"input_json_schema", "output_json_schema"}


def test_brmem_put_format_json_reports_failure(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    source_file = tmp_path / "local.txt"
    source_file.write_text("hello\n", encoding="utf-8")

    result = CliRunner().invoke(
        cli_group,
        [
            "put",
            "plan/plan.md",
            "--namespace",
            "ns/with/slash",
            "--file",
            str(source_file),
            "--format",
            "json",
        ],
        obj=_make_obj(),
    )
    payload = json.loads(result.stdout)

    assert result.exit_code == 2
    assert payload["exit_code"] == 2
    assert payload["error_type"] == "invalid_namespace"
    assert "Invalid namespace 'ns/with/slash'" in payload["message"]


def test_brmem_get_format_json_reports_failure(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["get", "plan/plan.md", "--namespace", "scratch", "--format", "json"],
        obj=_make_obj(),
    )
    payload = json.loads(result.stdout)

    assert result.exit_code == 2
    assert payload["exit_code"] == 2
    assert payload["error_type"] == "branch_memory_missing"
    assert "No content for Entry Key plan/plan.md" in payload["message"]


def test_brmem_list_format_json_reports_failure(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["list", "--namespace", "ns/with/slash", "--format", "json"],
        obj=_make_obj(),
    )
    payload = json.loads(result.stdout)

    assert result.exit_code == 2
    assert payload["exit_code"] == 2
    assert payload["error_type"] == "invalid_namespace"
    assert "Invalid namespace 'ns/with/slash'" in payload["message"]


# ---------------------------------------------------------------------------
# brmem base (ad-hoc / unnamespaced) layer
# ---------------------------------------------------------------------------


def test_brmem_put_without_namespace_writes_to_base_ref(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    source_file = tmp_path / "local.txt"
    source_file.write_text("hello\n", encoding="utf-8")
    obj = _make_obj()

    put_result = CliRunner().invoke(
        cli_group,
        ["put", "scratchpad", "--file", str(source_file), "--format", "json"],
        obj=obj,
    )
    put_payload = _json_output(put_result.output)

    assert put_result.exit_code == 0, put_result.output
    assert put_payload["exit_code"] == 0
    assert put_payload["data"] == {
        "namespace": None,
        "key": "scratchpad",
        "branch": "feat/x",
        "ref_name": "refs/brmem/base/feat---x:scratchpad",
        "commit": "fake-0001",
        "source_file": str(source_file),
    }


def test_brmem_put_without_namespace_human_output(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    source_file = tmp_path / "local.txt"
    source_file.write_text("hello\n", encoding="utf-8")
    obj = _make_obj()

    result = CliRunner().invoke(
        cli_group,
        ["put", "scratchpad", "--file", str(source_file)],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    assert (
        f"Stored Entry Key scratchpad from {source_file} in Base on Branch feat/x." in result.output
    )
    assert "Ref: refs/brmem/base/feat---x:scratchpad" in result.output


def test_brmem_get_without_namespace_reads_base_ref(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put(None, "scratchpad", "feat/x", "hi\n")
    obj = _make_obj(gateway=gateway)

    get_result = CliRunner().invoke(
        cli_group,
        ["get", "scratchpad"],
        obj=obj,
    )

    assert get_result.exit_code == 0, get_result.output
    assert get_result.output == "hi\n"


def test_brmem_check_without_namespace_hit(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put(None, "scratchpad", "feat/x", "hello\n")

    result = CliRunner().invoke(
        cli_group,
        ["check", "scratchpad"],
        obj=_make_obj(gateway=gateway),
    )

    assert result.exit_code == 0, result.stderr
    assert "Namespace: (base)" in result.stdout
    assert "Entry Locator: refs/brmem/base/feat---x:scratchpad" in result.stdout


def test_brmem_check_without_namespace_miss(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["check", "scratchpad"],
        obj=_make_obj(),
    )

    assert result.exit_code == 1
    assert result.stderr.strip() == (
        "not found: Entry Key=scratchpad Namespace=(base) Branch=feat/x "
        "at refs/brmem/base/feat---x:scratchpad"
    )


def test_brmem_put_without_namespace_overwrites_prior_scratch_entry(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    first = tmp_path / "first.txt"
    first.write_text("first\n", encoding="utf-8")
    second = tmp_path / "second.txt"
    second.write_text("second\n", encoding="utf-8")
    obj = _make_obj()

    runner = CliRunner()
    runner.invoke(cli_group, ["put", "scratchpad", "--file", str(first)], obj=obj)
    runner.invoke(cli_group, ["put", "scratchpad", "--file", str(second)], obj=obj)

    get_result = runner.invoke(cli_group, ["get", "scratchpad"], obj=obj)

    assert get_result.exit_code == 0
    assert get_result.output == "second\n"


def test_brmem_base_and_namespaced_entries_do_not_collide(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    base_file = tmp_path / "base.txt"
    base_file.write_text("base\n", encoding="utf-8")
    ns_file = tmp_path / "ns.txt"
    ns_file.write_text("ns\n", encoding="utf-8")
    obj = _make_obj()

    runner = CliRunner()
    runner.invoke(cli_group, ["put", "plan.md", "--file", str(base_file)], obj=obj)
    runner.invoke(
        cli_group,
        ["put", "plan.md", "--namespace", "scratch", "--file", str(ns_file)],
        obj=obj,
    )

    base_get = runner.invoke(cli_group, ["get", "plan.md"], obj=obj)
    ns_get = runner.invoke(cli_group, ["get", "plan.md", "--namespace", "scratch"], obj=obj)

    assert base_get.exit_code == 0
    assert base_get.output == "base\n"
    assert ns_get.exit_code == 0
    assert ns_get.output == "ns\n"


def test_brmem_list_returns_base_and_namespaced_entries_intermixed(
    cli_group: ClinkrGroup,
) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put(None, "scratch", "feat/x", "a\n")
    gateway.put("scratch", "plan", "feat/x", "b\n")
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(cli_group, ["list"], obj=obj)

    assert result.exit_code == 0, result.output
    assert result.output.splitlines() == [
        _list_line(None, "scratch"),
        _list_line("scratch", "plan"),
    ]


def test_brmem_list_namespace_filter_excludes_base_entries(
    cli_group: ClinkrGroup,
) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put(None, "scratch", "feat/x", "a\n")
    gateway.put("scratch", "plan", "feat/x", "b\n")
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(cli_group, ["list", "--namespace", "scratch"], obj=obj)

    assert result.exit_code == 0, result.output
    assert result.output.splitlines() == [_list_line("scratch", "plan")]


def test_brmem_list_base_flag_returns_only_base_entries(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put(None, "scratch", "feat/x", "a\n")
    gateway.put("scratch", "plan", "feat/x", "b\n")
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(cli_group, ["list", "--base"], obj=obj)

    assert result.exit_code == 0, result.output
    assert result.output.splitlines() == [_list_line(None, "scratch")]


def test_brmem_list_base_and_namespace_are_mutually_exclusive(
    cli_group: ClinkrGroup,
) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["list", "--base", "--namespace", "scratch", "--format", "json"],
        obj=_make_obj(),
    )
    payload = _json_output(result.output)

    assert result.exit_code == 2
    assert payload["error_type"] == "base_and_namespace_conflict"
    assert "mutually exclusive" in payload["message"]


# ---------------------------------------------------------------------------
# brmem export
# ---------------------------------------------------------------------------


def test_brmem_export_help_lists_flags(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["export", "-h"])

    assert result.exit_code == 0
    assert "--output-dir" in result.output
    assert "--namespace" in result.output
    assert "--branch" in result.output
    assert "--overwrite" in result.output
    assert "--dry-run" in result.output


def test_brmem_export_base_entries_by_default(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put(None, "plan.md", "feat/x", "base plan\n")
    gateway.put(None, "notes/session.md", "feat/x", "base session\n")
    gateway.put("scratch", "notes/scratch.md", "feat/x", "scratch\n")
    output_dir = tmp_path / "brmem"

    result = CliRunner().invoke(
        cli_group,
        ["export", "--output-dir", str(output_dir)],
        obj=_make_obj(gateway=gateway),
    )

    assert result.exit_code == 0, result.output
    assert f"Exported 2 base entries on branch feat/x to {output_dir}." in result.output
    assert (output_dir / "plan.md").read_text(encoding="utf-8") == "base plan\n"
    assert (output_dir / "notes" / "session.md").read_text(encoding="utf-8") == "base session\n"
    assert not (output_dir / "notes" / "scratch.md").exists()


def test_brmem_export_defaults_to_unique_temp_dir(
    cli_group: ClinkrGroup,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import brmem.export as export_module

    monkeypatch.setattr(export_module.tempfile, "gettempdir", lambda: str(tmp_path))

    def _run() -> tuple[int, str]:
        gateway = FakeBranchMemoryGateway()
        gateway.put(None, "plan.md", "feat/x", "base plan\n")
        result = CliRunner().invoke(
            cli_group,
            ["export", "--format", "json"],
            obj=_make_obj(gateway=gateway),
        )
        assert result.exit_code == 0, result.output
        payload = _json_output(result.output)
        return payload["exit_code"], payload["data"]["output_dir"]  # type: ignore[index,return-value]

    _, first_dir = _run()
    _, second_dir = _run()

    first_path = Path(first_dir)
    second_path = Path(second_dir)

    assert first_path != second_path
    assert first_path.parent == tmp_path
    assert second_path.parent == tmp_path
    assert first_path.name.startswith("brmem-export-")
    assert second_path.name.startswith("brmem-export-")
    assert (first_path / "plan.md").read_text(encoding="utf-8") == "base plan\n"
    assert (second_path / "plan.md").read_text(encoding="utf-8") == "base plan\n"


def test_brmem_export_namespace_entries(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put(None, "plan.md", "feat/x", "base\n")
    gateway.put("scratch", "notes/a.md", "feat/x", "scratch a\n")
    gateway.put("scratch", "notes/b.md", "feat/x", "scratch b\n")
    gateway.put("objectives", "obj/body.md", "feat/x", "objective\n")
    output_dir = tmp_path / "scratch"

    result = CliRunner().invoke(
        cli_group,
        ["export", "--namespace", "scratch", "--output-dir", str(output_dir)],
        obj=_make_obj(gateway=gateway),
    )

    assert result.exit_code == 0, result.output
    assert (
        f"Exported 2 entries from namespace scratch on branch feat/x to {output_dir}."
        in result.output
    )
    assert (output_dir / "notes" / "a.md").read_text(encoding="utf-8") == "scratch a\n"
    assert (output_dir / "notes" / "b.md").read_text(encoding="utf-8") == "scratch b\n"
    assert not (output_dir / "plan.md").exists()
    assert not (output_dir / "obj" / "body.md").exists()


def test_brmem_export_nested_keys_create_directories(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put(None, "plans/foo/body.md", "feat/x", "body\n")
    output_dir = tmp_path / "nested"

    result = CliRunner().invoke(
        cli_group,
        ["export", "--output-dir", str(output_dir)],
        obj=_make_obj(gateway=gateway),
    )

    assert result.exit_code == 0, result.output
    assert (output_dir / "plans" / "foo" / "body.md").read_text(encoding="utf-8") == "body\n"


def test_brmem_export_explicit_branch_overrides_current(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put(None, "plan.md", "feat/current", "current\n")
    gateway.put(None, "plan.md", "feat/other", "other\n")
    output_dir = tmp_path / "other"

    result = CliRunner().invoke(
        cli_group,
        ["export", "--branch", "feat/other", "--output-dir", str(output_dir)],
        obj=_make_obj(gateway=gateway, branch="feat/current"),
    )

    assert result.exit_code == 0, result.output
    assert (output_dir / "plan.md").read_text(encoding="utf-8") == "other\n"


def test_brmem_export_fails_on_existing_file_without_overwrite(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put(None, "plan.md", "feat/x", "new plan\n")
    gateway.put(None, "notes/new.md", "feat/x", "new note\n")
    output_dir = tmp_path / "conflict"
    output_dir.mkdir()
    (output_dir / "plan.md").write_text("original\n", encoding="utf-8")

    result = CliRunner().invoke(
        cli_group,
        ["export", "--output-dir", str(output_dir)],
        obj=_make_obj(gateway=gateway),
    )

    assert result.exit_code == 2
    assert "Pass --overwrite" in result.output
    assert (output_dir / "plan.md").read_text(encoding="utf-8") == "original\n"
    assert not (output_dir / "notes" / "new.md").exists()


def test_brmem_export_overwrite_replaces_existing_file(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put(None, "plan.md", "feat/x", "replacement\n")
    output_dir = tmp_path / "overwrite"
    output_dir.mkdir()
    (output_dir / "plan.md").write_text("original\n", encoding="utf-8")

    result = CliRunner().invoke(
        cli_group,
        ["export", "--output-dir", str(output_dir), "--overwrite"],
        obj=_make_obj(gateway=gateway),
    )

    assert result.exit_code == 0, result.output
    assert (output_dir / "plan.md").read_text(encoding="utf-8") == "replacement\n"


def test_brmem_export_dry_run_writes_nothing(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put(None, "plan.md", "feat/x", "plan\n")
    output_dir = tmp_path / "dry-run"

    result = CliRunner().invoke(
        cli_group,
        ["export", "--output-dir", str(output_dir), "--dry-run"],
        obj=_make_obj(gateway=gateway),
    )

    assert result.exit_code == 0, result.output
    assert f"Would export 1 base entry on branch feat/x to {output_dir}." in result.output
    assert "plan.md" in result.output
    assert not output_dir.exists()


def test_brmem_export_empty_selection_is_negative(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("scratch", "plan.md", "feat/x", "scratch\n")
    output_dir = tmp_path / "empty"

    result = CliRunner().invoke(
        cli_group,
        ["export", "--output-dir", str(output_dir)],
        obj=_make_obj(gateway=gateway),
    )

    assert result.exit_code == 1
    assert result.stdout == ""
    assert result.stderr.strip() == "No base entries found on branch feat/x."
    assert not output_dir.exists()


def test_brmem_export_json_output(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put(None, "plan.md", "feat/x", "base\n")
    output_dir = tmp_path / "json"

    result = CliRunner().invoke(
        cli_group,
        ["export", "--output-dir", str(output_dir), "--format", "json"],
        obj=_make_obj(gateway=gateway),
    )
    payload = _json_output(result.output)

    assert result.exit_code == 0, result.output
    assert payload["exit_code"] == 0
    assert payload["data"] == {
        "namespace": None,
        "branch": "feat/x",
        "output_dir": str(output_dir),
        "overwrite": False,
        "dry_run": False,
        "exported": [
            {
                "key": "plan.md",
                "path": str(output_dir / "plan.md"),
                "ref_name": "refs/brmem/base/feat---x:plan.md",
                "size_bytes": 5,
            }
        ],
    }


def test_brmem_export_json_schema_flag_is_eager(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["export", "--json-schema"])
    payload = json.loads(result.stdout)

    assert result.exit_code == 0, result.output
    assert set(payload) == {"input_json_schema", "output_json_schema"}


# ---------------------------------------------------------------------------
# brmem copy
# ---------------------------------------------------------------------------


def _seed_for_copy() -> FakeBranchMemoryGateway:
    gateway = FakeBranchMemoryGateway()
    gateway.put("notes", "foo/body.md", "master", "body\n")
    gateway.put("notes", "foo/roadmap.md", "master", "road\n")
    gateway.put("notes", "foo/notes.md", "master", "notes\n")
    gateway.put("notes", "bar/body.md", "master", "other\n")
    return gateway


def test_brmem_copy_help_lists_flags(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["copy", "-h"])

    assert result.exit_code == 0
    assert "--namespace" in result.output
    assert "--from-branch" in result.output
    assert "--to-branch" in result.output
    assert "--overwrite" in result.output
    assert "--dry-run" in result.output
    assert "--key-glob" in result.output
    # The help text must warn that '*' matches '/' so skill authors know
    # `<slug>/*` is recursive (flat and nested keys both match).
    assert "'/'" in result.output


def test_brmem_copy_happy_path_copies_every_file_in_namespace(
    cli_group: ClinkrGroup,
) -> None:
    gateway = _seed_for_copy()
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(
        cli_group,
        [
            "copy",
            "--namespace",
            "notes",
            "--from-branch",
            "master",
            "--to-branch",
            "feat/x",
        ],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    assert (
        "Copied 4 Entries in Namespace notes from Branch master to Branch feat/x" in result.output
    )
    assert "foo/body.md" in result.output
    assert "foo/roadmap.md" in result.output
    assert "foo/notes.md" in result.output
    assert "bar/body.md" in result.output
    assert gateway.get("notes", "foo/body.md", "feat/x") == "body\n"
    assert gateway.get("notes", "foo/roadmap.md", "feat/x") == "road\n"
    assert gateway.get("notes", "foo/notes.md", "feat/x") == "notes\n"
    assert gateway.get("notes", "bar/body.md", "feat/x") == "other\n"


def test_brmem_copy_dry_run_does_not_mutate(cli_group: ClinkrGroup) -> None:
    gateway = _seed_for_copy()
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(
        cli_group,
        [
            "copy",
            "--namespace",
            "notes",
            "--from-branch",
            "master",
            "--to-branch",
            "feat/x",
            "--dry-run",
        ],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    assert "Would copy 4 Entries" in result.output
    assert gateway.check("notes", "foo/body.md", "feat/x") is None
    assert gateway.check("notes", "foo/roadmap.md", "feat/x") is None
    assert gateway.check("notes", "foo/notes.md", "feat/x") is None
    assert gateway.check("notes", "bar/body.md", "feat/x") is None


def test_brmem_copy_empty_source_exits_failure(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(gateway=FakeBranchMemoryGateway())

    result = CliRunner().invoke(
        cli_group,
        [
            "copy",
            "--namespace",
            "notes",
            "--from-branch",
            "master",
            "--to-branch",
            "feat/x",
        ],
        obj=obj,
    )

    assert result.exit_code == 2
    assert "No Entries found on Branch master" in result.output
    assert "notes" in result.output


def test_brmem_copy_conflict_without_overwrite_exits_failure(
    cli_group: ClinkrGroup,
) -> None:
    gateway = _seed_for_copy()
    gateway.put("notes", "foo/body.md", "feat/x", "existing\n")
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(
        cli_group,
        [
            "copy",
            "--namespace",
            "notes",
            "--from-branch",
            "master",
            "--to-branch",
            "feat/x",
        ],
        obj=obj,
    )

    assert result.exit_code == 2
    assert "already has Entries for: foo/body.md" in result.output
    assert gateway.get("notes", "foo/body.md", "feat/x") == "existing\n"
    assert gateway.check("notes", "foo/roadmap.md", "feat/x") is None


def test_brmem_copy_overwrite_replaces_destination(cli_group: ClinkrGroup) -> None:
    gateway = _seed_for_copy()
    gateway.put("notes", "foo/body.md", "feat/x", "existing\n")
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(
        cli_group,
        [
            "copy",
            "--namespace",
            "notes",
            "--from-branch",
            "master",
            "--to-branch",
            "feat/x",
            "--overwrite",
        ],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    assert gateway.get("notes", "foo/body.md", "feat/x") == "body\n"


def test_brmem_copy_invalid_branch_surfaces_clean_error(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        [
            "copy",
            "--namespace",
            "notes",
            "--from-branch",
            "feat---x",
            "--to-branch",
            "feat/y",
        ],
        obj=_make_obj(),
    )

    assert result.exit_code == 2
    assert "Invalid branch name 'feat---x'" in result.output


def test_brmem_copy_json_envelope_reports_plan(cli_group: ClinkrGroup) -> None:
    gateway = _seed_for_copy()
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(
        cli_group,
        [
            "copy",
            "--namespace",
            "notes",
            "--from-branch",
            "master",
            "--to-branch",
            "feat/x",
            "--format",
            "json",
        ],
        obj=obj,
    )
    payload = _json_output(result.output)

    assert result.exit_code == 0, result.output
    assert payload["exit_code"] == 0
    data = payload["data"]
    assert data["namespace"] == "notes"
    assert data["from_branch"] == "master"
    assert data["to_branch"] == "feat/x"
    assert data["overwrite"] is False
    assert data["dry_run"] is False
    assert [item["key"] for item in data["copied"]] == [
        "bar/body.md",
        "foo/body.md",
        "foo/notes.md",
        "foo/roadmap.md",
    ]
    for item in data["copied"]:
        assert item["source_ref"].startswith("refs/brmem/ns/notes/master:")
        assert item["destination_ref"].startswith("refs/brmem/ns/notes/feat---x:")
        assert item["source_sha"].startswith("fake-")


def test_brmem_copy_json_schema_flag_is_eager(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["copy", "--json-schema"])
    payload = json.loads(result.stdout)

    assert result.exit_code == 0, result.output
    assert set(payload) == {"input_json_schema", "output_json_schema"}


# ---------------------------------------------------------------------------
# brmem delete
# ---------------------------------------------------------------------------


def test_brmem_delete_existing_key(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("scratch", "plan/plan.md", "feat/x", "hello\n")
    obj = _make_obj(gateway=gateway)

    delete_result = CliRunner().invoke(
        cli_group,
        ["delete", "plan/plan.md", "--namespace", "scratch"],
        obj=obj,
    )
    get_result = CliRunner().invoke(
        cli_group,
        ["get", "plan/plan.md", "--namespace", "scratch"],
        obj=obj,
    )

    assert delete_result.exit_code == 0, delete_result.output
    assert (
        "Deleted Entry Key plan/plan.md from Namespace scratch on Branch feat/x."
        in delete_result.output
    )
    assert "Ref: refs/brmem/ns/scratch/feat---x:plan/plan.md" in delete_result.output
    assert "Commit: fake-0002" in delete_result.output
    assert get_result.exit_code == 2
    assert "No content for Entry Key plan/plan.md" in get_result.output


def test_brmem_delete_missing_key_errors(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["delete", "plan/plan.md", "--namespace", "scratch"],
        obj=_make_obj(),
    )

    assert result.exit_code == 2
    assert "key_not_found" not in result.output  # error_type only surfaces in JSON envelope
    assert "No Entry to delete" in result.output
    assert "Entry Key=plan/plan.md" in result.output
    assert "Namespace=scratch" in result.output
    assert "Branch=feat/x" in result.output


def test_brmem_delete_preserves_siblings(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("scratch", "plan/a.md", "feat/x", "a\n")
    gateway.put("scratch", "plan/b.md", "feat/x", "b\n")
    obj = _make_obj(gateway=gateway)

    runner = CliRunner()
    delete_result = runner.invoke(
        cli_group,
        ["delete", "plan/a.md", "--namespace", "scratch"],
        obj=obj,
    )
    a_get = runner.invoke(
        cli_group,
        ["get", "plan/a.md", "--namespace", "scratch"],
        obj=obj,
    )
    b_get = runner.invoke(
        cli_group,
        ["get", "plan/b.md", "--namespace", "scratch"],
        obj=obj,
    )

    assert delete_result.exit_code == 0, delete_result.output
    assert a_get.exit_code == 2
    assert b_get.exit_code == 0
    assert b_get.output == "b\n"


def test_brmem_delete_json_output(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("scratch", "plan/plan.md", "feat/x", "hello\n")
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(
        cli_group,
        ["delete", "plan/plan.md", "--namespace", "scratch", "--format", "json"],
        obj=obj,
    )
    payload = _json_output(result.output)

    assert result.exit_code == 0, result.output
    assert payload["exit_code"] == 0
    assert payload["data"] == {
        "namespace": "scratch",
        "key": "plan/plan.md",
        "branch": "feat/x",
        "ref_name": "refs/brmem/ns/scratch/feat---x:plan/plan.md",
        "commit": "fake-0002",
    }


def test_brmem_delete_json_missing_key_reports_failure(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["delete", "plan/plan.md", "--namespace", "scratch", "--format", "json"],
        obj=_make_obj(),
    )
    payload = _json_output(result.output)

    assert result.exit_code == 2
    assert payload["exit_code"] == 2
    assert payload["error_type"] == "key_not_found"
    assert "No Entry to delete" in payload["message"]


def test_brmem_delete_without_namespace_targets_base_entry(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put(None, "scratchpad", "feat/x", "hi\n")
    obj = _make_obj(gateway=gateway)

    runner = CliRunner()
    delete_result = runner.invoke(cli_group, ["delete", "scratchpad"], obj=obj)
    get_result = runner.invoke(cli_group, ["get", "scratchpad"], obj=obj)

    assert delete_result.exit_code == 0, delete_result.output
    assert "Deleted Entry Key scratchpad from Base on Branch feat/x." in delete_result.output
    assert "Ref: refs/brmem/base/feat---x:scratchpad" in delete_result.output
    assert get_result.exit_code == 2


def test_brmem_delete_invalid_branch_surfaces_clean_error(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        [
            "delete",
            "plan/plan.md",
            "--namespace",
            "scratch",
            "--branch",
            "feat---x",
        ],
        obj=_make_obj(branch=None),
    )

    assert result.exit_code == 2
    assert "Invalid branch name 'feat---x'" in result.output


def test_brmem_delete_json_schema_flag_is_eager(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["delete", "--json-schema"])
    payload = json.loads(result.stdout)

    assert result.exit_code == 0, result.output
    assert set(payload) == {"input_json_schema", "output_json_schema"}


# ---------------------------------------------------------------------------
# brmem copy --key-glob
# ---------------------------------------------------------------------------


def _seed_for_glob_copy() -> FakeBranchMemoryGateway:
    gateway = FakeBranchMemoryGateway()
    gateway.put("notes", "foo/body.md", "master", "foo-body\n")
    gateway.put("notes", "foo/roadmap.md", "master", "foo-road\n")
    gateway.put("notes", "foo/sub/x.md", "master", "foo-sub\n")
    gateway.put("notes", "foobar/body.md", "master", "foobar-body\n")
    gateway.put("notes", "bar/body.md", "master", "bar-body\n")
    return gateway


def test_brmem_copy_key_glob_copies_only_matching_source_keys(
    cli_group: ClinkrGroup,
) -> None:
    gateway = _seed_for_glob_copy()
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(
        cli_group,
        [
            "copy",
            "--namespace",
            "notes",
            "--from-branch",
            "master",
            "--to-branch",
            "feat/x",
            "--key-glob",
            "foo/*",
        ],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    assert "Copied 3 Entries" in result.output
    assert "(filtered by --key-glob 'foo/*')" in result.output
    dest_keys = sorted(e.key for e in gateway.list_entries(namespace="notes", branch="feat/x"))
    assert dest_keys == ["foo/body.md", "foo/roadmap.md", "foo/sub/x.md"]


def test_brmem_copy_key_glob_zero_matches_exits_failure(cli_group: ClinkrGroup) -> None:
    gateway = _seed_for_glob_copy()
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(
        cli_group,
        [
            "copy",
            "--namespace",
            "notes",
            "--from-branch",
            "master",
            "--to-branch",
            "feat/x",
            "--key-glob",
            "nope/*",
        ],
        obj=obj,
    )

    assert result.exit_code == 2
    assert "match --key-glob 'nope/*'" in result.output
    # Destination snapshot must not have been created.
    assert gateway.list_entries(namespace="notes", branch="feat/x") == []


def test_brmem_copy_key_glob_does_not_match_sibling_prefix(cli_group: ClinkrGroup) -> None:
    """`foo/*` must not copy `foobar/body.md` — the trailing slash anchors
    the prefix segment.
    """
    gateway = _seed_for_glob_copy()
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(
        cli_group,
        [
            "copy",
            "--namespace",
            "notes",
            "--from-branch",
            "master",
            "--to-branch",
            "feat/x",
            "--key-glob",
            "foo/*",
        ],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    assert gateway.check("notes", "foobar/body.md", "feat/x") is None


def test_brmem_copy_key_glob_is_slash_tolerant(cli_group: ClinkrGroup) -> None:
    """`foo/*` must match both flat (`foo/body.md`) and nested
    (`foo/sub/x.md`) keys — `*` matches `/`.
    """
    gateway = _seed_for_glob_copy()
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(
        cli_group,
        [
            "copy",
            "--namespace",
            "notes",
            "--from-branch",
            "master",
            "--to-branch",
            "feat/x",
            "--key-glob",
            "foo/*",
        ],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    assert gateway.get("notes", "foo/body.md", "feat/x") == "foo-body\n"
    assert gateway.get("notes", "foo/sub/x.md", "feat/x") == "foo-sub\n"


def test_brmem_copy_key_glob_conflict_lists_only_matching_dest_keys(
    cli_group: ClinkrGroup,
) -> None:
    gateway = _seed_for_glob_copy()
    gateway.put("notes", "foo/body.md", "feat/x", "existing-foo\n")
    gateway.put("notes", "bar/body.md", "feat/x", "existing-bar\n")
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(
        cli_group,
        [
            "copy",
            "--namespace",
            "notes",
            "--from-branch",
            "master",
            "--to-branch",
            "feat/x",
            "--key-glob",
            "foo/*",
        ],
        obj=obj,
    )

    assert result.exit_code == 2
    assert "foo/body.md" in result.output
    # Non-matching dest key (bar/body.md) is not a conflict, so it must not
    # appear in the conflict message.
    assert "bar/body.md" not in result.output
    assert gateway.get("notes", "foo/body.md", "feat/x") == "existing-foo\n"
    assert gateway.get("notes", "bar/body.md", "feat/x") == "existing-bar\n"


def test_brmem_copy_key_glob_overwrite_preserves_non_matching_dest_keys(
    cli_group: ClinkrGroup,
) -> None:
    gateway = _seed_for_glob_copy()
    gateway.put("notes", "foo/body.md", "feat/x", "existing-foo\n")
    gateway.put("notes", "bar/body.md", "feat/x", "existing-bar\n")
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(
        cli_group,
        [
            "copy",
            "--namespace",
            "notes",
            "--from-branch",
            "master",
            "--to-branch",
            "feat/x",
            "--key-glob",
            "foo/*",
            "--overwrite",
        ],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    # Matching dest key was replaced by the source content.
    assert gateway.get("notes", "foo/body.md", "feat/x") == "foo-body\n"
    # Non-matching dest key survived the copy verbatim.
    assert gateway.get("notes", "bar/body.md", "feat/x") == "existing-bar\n"
    # Other foo/* keys were copied too.
    dest_keys = sorted(e.key for e in gateway.list_entries(namespace="notes", branch="feat/x"))
    assert dest_keys == ["bar/body.md", "foo/body.md", "foo/roadmap.md", "foo/sub/x.md"]


def test_brmem_copy_key_glob_cross_slug_pattern_matches_multiple_prefixes(
    cli_group: ClinkrGroup,
) -> None:
    """`*.md` should match keys across every slug directory — verifies glob
    expressiveness beyond a single-prefix pattern.
    """
    gateway = _seed_for_glob_copy()
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(
        cli_group,
        [
            "copy",
            "--namespace",
            "notes",
            "--from-branch",
            "master",
            "--to-branch",
            "feat/x",
            "--key-glob",
            "*.md",
        ],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    dest_keys = sorted(e.key for e in gateway.list_entries(namespace="notes", branch="feat/x"))
    assert dest_keys == [
        "bar/body.md",
        "foo/body.md",
        "foo/roadmap.md",
        "foo/sub/x.md",
        "foobar/body.md",
    ]


def test_brmem_copy_key_glob_dry_run_reports_matching_plan_only(
    cli_group: ClinkrGroup,
) -> None:
    gateway = _seed_for_glob_copy()
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(
        cli_group,
        [
            "copy",
            "--namespace",
            "notes",
            "--from-branch",
            "master",
            "--to-branch",
            "feat/x",
            "--key-glob",
            "foo/*",
            "--dry-run",
        ],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    assert "Would copy 3 Entries" in result.output
    assert gateway.list_entries(namespace="notes", branch="feat/x") == []


def test_brmem_copy_empty_key_glob_exits_failure(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(gateway=_seed_for_glob_copy())

    result = CliRunner().invoke(
        cli_group,
        [
            "copy",
            "--namespace",
            "notes",
            "--from-branch",
            "master",
            "--to-branch",
            "feat/x",
            "--key-glob",
            "",
        ],
        obj=obj,
    )

    assert result.exit_code == 2
    assert "Invalid Entry Key glob" in result.output


def test_brmem_copy_key_glob_json_envelope_records_filter(
    cli_group: ClinkrGroup,
) -> None:
    gateway = _seed_for_glob_copy()
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(
        cli_group,
        [
            "copy",
            "--namespace",
            "notes",
            "--from-branch",
            "master",
            "--to-branch",
            "feat/x",
            "--key-glob",
            "foo/*",
            "--format",
            "json",
        ],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    payload = _json_output(result.output)
    data = payload["data"]
    assert data["key_glob"] == "foo/*"
    assert [item["key"] for item in data["copied"]] == [
        "foo/body.md",
        "foo/roadmap.md",
        "foo/sub/x.md",
    ]
