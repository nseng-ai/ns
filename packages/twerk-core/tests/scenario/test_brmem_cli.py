from __future__ import annotations

import json
from pathlib import Path

import pytest
from click.testing import CliRunner

from twerk_core.brmem.context import BrmemCliContext
from twerk_core.brmem.fake import FakeBranchMemoryGateway
from twerk_core.brmem.main import build_cli
from twerk_core.clinkr.context import ClinkrContextObject, build_clinkr_context_object
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
    assert "Manage branch-scoped memory stored in git refs." in result.output
    assert "--version" in result.output
    assert "put" in result.output
    assert "get" in result.output
    assert "list" in result.output
    assert "check" in result.output
    assert "copy" not in result.output
    assert "list-artifacts" not in result.output
    assert "check-artifact" not in result.output
    assert "check-entry" not in result.output
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
            "plan/plan.md",
            "--namespace",
            "workbr",
            "--file",
            str(source_file),
        ],
        obj=obj,
    )
    get_result = CliRunner().invoke(
        cli_group,
        ["get", "plan/plan.md", "--namespace", "workbr"],
        obj=obj,
    )

    assert put_result.exit_code == 0, put_result.output
    assert (
        f"Stored plan/plan.md from {source_file} for workbr on branch feat/x." in put_result.output
    )
    assert "Ref: refs/brmem/ns/workbr/feat---x/plan/plan.md" in put_result.output
    assert "Commit: fake-0001" in put_result.output
    assert (
        "Inspect: git show refs/brmem/ns/workbr/feat---x/plan/plan.md:content" in put_result.output
    )
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
        ["put", "plan/a.md", "--namespace", "workbr", "--file", str(a_v1)],
        obj=obj,
    )
    runner.invoke(
        cli_group,
        ["put", "plan/b.md", "--namespace", "workbr", "--file", str(b_v1)],
        obj=obj,
    )
    runner.invoke(
        cli_group,
        ["put", "plan/a.md", "--namespace", "workbr", "--file", str(a_v2)],
        obj=obj,
    )

    a_get = runner.invoke(
        cli_group,
        ["get", "plan/a.md", "--namespace", "workbr"],
        obj=obj,
    )
    b_get = runner.invoke(
        cli_group,
        ["get", "plan/b.md", "--namespace", "workbr"],
        obj=obj,
    )
    list_result = runner.invoke(
        cli_group,
        ["list", "--namespace", "workbr"],
        obj=obj,
    )

    assert a_get.exit_code == 0
    assert a_get.output == "a2\n"
    assert b_get.exit_code == 0
    assert b_get.output == "b1\n"
    assert list_result.exit_code == 0
    assert list_result.output.splitlines() == [
        "workbr/plan/a.md",
        "workbr/plan/b.md",
    ]


def test_brmem_get_at_reads_older_snapshot(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    first_commit = gateway.put("workbr", "plan/plan.md", "feat/x", "one\n")
    gateway.put("workbr", "plan/plan.md", "feat/x", "two\n")

    result = CliRunner().invoke(
        cli_group,
        [
            "get",
            "plan/plan.md",
            "--namespace",
            "workbr",
            "--at",
            first_commit,
        ],
        obj=_make_obj(gateway=gateway),
    )

    assert result.exit_code == 0, result.output
    assert result.output == "one\n"


def test_brmem_at_accepts_raw_treeish(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("workbr", "plan/plan.md", "feat/x", "one\n")
    # Hand an at value that has no known history; fake returns None -> missing.
    result = CliRunner().invoke(
        cli_group,
        [
            "get",
            "plan/plan.md",
            "--namespace",
            "workbr",
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
            "workbr",
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
            "workbr",
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
        "namespace": "workbr",
        "key": "plan/plan.md",
        "branch": "feat/x",
        "ref_name": "refs/brmem/ns/workbr/feat---x/plan/plan.md",
        "commit": "fake-0001",
        "source_file": str(source_file),
    }
    assert get_result.exit_code == 0
    assert get_payload["exit_code"] == 0
    assert get_payload["data"] == {
        "namespace": "workbr",
        "key": "plan/plan.md",
        "branch": "feat/x",
        "content": "json\n",
        "ref_name": "refs/brmem/ns/workbr/feat---x/plan/plan.md",
        "target": "refs/brmem/ns/workbr/feat---x/plan/plan.md",
        "at": None,
    }


def test_brmem_put_from_stdin(cli_group: ClinkrGroup) -> None:
    obj = _make_obj()

    put_result = CliRunner().invoke(
        cli_group,
        ["put", "plan/plan.md", "--namespace", "workbr", "--stdin"],
        input="contents\n",
        obj=obj,
    )
    get_result = CliRunner().invoke(
        cli_group,
        ["get", "plan/plan.md", "--namespace", "workbr"],
        obj=obj,
    )

    assert put_result.exit_code == 0, put_result.output
    assert "Stored plan/plan.md from stdin for workbr on branch feat/x." in put_result.output
    assert "Ref: refs/brmem/ns/workbr/feat---x/plan/plan.md" in put_result.output
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
            "workbr",
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
            "workbr",
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
            "workbr",
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
            "workbr",
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
            "workbr",
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
            "workbr",
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
        ["put", "plan/plan.md", "--namespace", "workbr"],
        obj=obj,
    )
    get_result = CliRunner().invoke(
        cli_group,
        ["get", "plan/plan.md", "--namespace", "workbr"],
        obj=obj,
    )

    assert put_result.exit_code == 0, put_result.output
    assert "Stored plan/plan.md from plan.md for workbr on branch feat/x." in put_result.output
    assert "Ref: refs/brmem/ns/workbr/feat---x/plan/plan.md" in put_result.output
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
            "workbr",
            "--stdin",
            "--file",
            str(source_file),
        ],
        input="contents\n",
        obj=obj,
    )

    assert result.exit_code == 2
    assert "--stdin and --file are mutually exclusive." in result.output


def test_brmem_get_surfaces_git_failure_when_branch_omitted(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["get", "plan/plan.md", "--namespace", "workbr"],
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
            "workbr",
            "--branch",
            "feat/x",
        ],
        obj=_make_obj(branch=None),
    )

    assert result.exit_code == 2
    assert "refs/brmem/ns/workbr/feat---x/plan/missing.md" in result.output
    assert "git show refs/brmem/ns/workbr/feat---x/plan/missing.md:content" in result.output


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
        obj={"brmem_gateway": FakeBranchMemoryGateway()},
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
    gateway.put("workbr", "plan", "feat/x", "a\n")
    gateway.put("workbr", "plan", "feat/y", "a\n")
    gateway.put("workbr", "notes", "feat/x", "a\n")
    gateway.put("objectives", "obj-1", "feat/x", "a\n")
    return gateway


@pytest.mark.parametrize(
    ("args", "expected_lines"),
    [
        (
            [],
            [
                "objectives/obj-1",
                "workbr/notes",
                "workbr/plan",
            ],
        ),
        (
            ["--namespace", "workbr"],
            [
                "workbr/notes",
                "workbr/plan",
            ],
        ),
        (
            ["--key", "plan"],
            ["workbr/plan"],
        ),
        (
            ["--branch", "feat/x"],
            [
                "objectives/obj-1",
                "workbr/notes",
                "workbr/plan",
            ],
        ),
        (
            ["--namespace", "workbr", "--key", "plan"],
            ["workbr/plan"],
        ),
        (
            ["--namespace", "workbr", "--branch", "feat/y"],
            ["workbr/plan"],
        ),
        (
            ["--key", "plan", "--branch", "feat/x"],
            ["workbr/plan"],
        ),
        (
            ["--namespace", "workbr", "--key", "plan", "--branch", "feat/x"],
            ["workbr/plan"],
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
    assert result.output.splitlines() == ["workbr/plan"]


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
    gateway.put("workbr", "plan", "feat/other", "a\n")

    result = CliRunner().invoke(
        cli_group,
        ["list", "--branch", "feat/other"],
        obj=_make_obj(gateway=gateway, branch=DetachedHead()),
    )

    assert result.exit_code == 0, result.output
    assert result.output.splitlines() == ["workbr/plan"]


def test_brmem_list_empty_returns_nothing(cli_group: ClinkrGroup) -> None:
    obj = _make_obj()

    result = CliRunner().invoke(cli_group, ["list"], obj=obj)

    assert result.exit_code == 0, result.output
    assert result.output == ""


def test_brmem_list_filters_by_key_with_slash(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("workbr", "plan/a.md", "feat/x", "a\n")
    gateway.put("workbr", "plan/b.md", "feat/x", "b\n")
    gateway.put("workbr", "plan/a.md", "feat/y", "a\n")
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(
        cli_group, ["list", "--namespace", "workbr", "--key", "plan/a.md"], obj=obj
    )

    assert result.exit_code == 0, result.output
    assert result.output.splitlines() == ["workbr/plan/a.md"]


def test_brmem_json_list(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("workbr", "plan/a.md", "feat/x", "a\n")
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(
        cli_group,
        ["list", "--namespace", "workbr", "--format", "json"],
        obj=obj,
    )
    payload = _json_output(result.output)

    assert result.exit_code == 0, result.output
    assert payload["exit_code"] == 0
    assert payload["data"] == {
        "namespace": "workbr",
        "key": None,
        "branch": "feat/x",
        "base": False,
        "entries": [
            {
                "namespace": "workbr",
                "key": "plan/a.md",
                "branch": "feat/x",
                "ref_name": "refs/brmem/ns/workbr/feat---x/plan/a.md",
            }
        ],
    }


# ---------------------------------------------------------------------------
# brmem check
# ---------------------------------------------------------------------------


def test_brmem_check_hit_exits_zero(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("workbr", "plan/plan.md", "feat/x", "hello\n")

    result = CliRunner().invoke(
        cli_group,
        ["check", "plan/plan.md", "--namespace", "workbr"],
        obj=_make_obj(gateway=gateway),
    )

    assert result.exit_code == 0, result.stderr
    assert result.stderr == ""
    assert "key: plan/plan.md" in result.stdout
    assert "namespace: workbr" in result.stdout
    assert "branch: feat/x" in result.stdout
    assert "ref: refs/brmem/ns/workbr/feat---x/plan/plan.md" in result.stdout
    assert "head: fake-0001" in result.stdout
    assert "blob: blob-fake-0001" in result.stdout
    assert "size: 6" in result.stdout


def test_brmem_check_miss_exits_one_with_absent_message(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["check", "plan/plan.md", "--namespace", "workbr"],
        obj=_make_obj(),
    )

    assert result.exit_code == 1
    assert result.stdout == ""
    assert result.stderr.strip() == (
        "not found: key=plan/plan.md namespace=workbr branch=feat/x "
        "at refs/brmem/ns/workbr/feat---x/plan/plan.md"
    )


def test_brmem_check_invalid_branch_exits_two(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        [
            "check",
            "plan/plan.md",
            "--namespace",
            "workbr",
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
        ["check", "plan/plan.md", "--namespace", "workbr"],
        obj=_make_obj(branch=DetachedHead()),
    )

    assert result.exit_code == 2
    assert "detached head" in result.stderr.lower()


def test_brmem_check_at_historical(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    first_commit = gateway.put("workbr", "plan/plan.md", "feat/x", "one\n")
    gateway.put("workbr", "plan/plan.md", "feat/x", "two-and-three\n")

    result = CliRunner().invoke(
        cli_group,
        [
            "check",
            "plan/plan.md",
            "--namespace",
            "workbr",
            "--at",
            first_commit,
        ],
        obj=_make_obj(gateway=gateway),
    )

    assert result.exit_code == 0, result.stderr
    assert "size: 4" in result.stdout
    assert f"target: {first_commit}" in result.stdout


def test_brmem_json_check_present(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("workbr", "plan/plan.md", "feat/x", "hello\n")
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(
        cli_group,
        ["check", "plan/plan.md", "--namespace", "workbr", "--format", "json"],
        obj=obj,
    )
    payload = _json_output(result.output)

    assert result.exit_code == 0, result.output
    assert payload["exit_code"] == 0
    assert "message" not in payload
    assert "error_type" not in payload
    data = payload["data"]
    assert data["ref_name"] == "refs/brmem/ns/workbr/feat---x/plan/plan.md"
    assert data["size_bytes"] == 6
    assert data["head_sha"] == "fake-0001"
    assert data["blob_sha"] == "blob-fake-0001"


def test_brmem_json_check_missing(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["check", "plan/plan.md", "--namespace", "workbr", "--format", "json"],
        obj=_make_obj(),
    )
    payload = _json_output(result.output)

    assert result.exit_code == 1, result.output
    assert payload["exit_code"] == 1
    assert "not found: key=plan/plan.md" in payload["message"]
    data = payload["data"]
    assert data["head_sha"] is None
    assert data["size_bytes"] is None


# ---------------------------------------------------------------------------
# --schema eagerness / failure envelope
# ---------------------------------------------------------------------------


def test_brmem_put_schema_flag_is_eager(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["put", "--schema"])
    payload = json.loads(result.stdout)

    assert result.exit_code == 0, result.output
    assert set(payload) == {"input_schema", "output_schema"}


def test_brmem_get_schema_flag_is_eager(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["get", "--schema"])
    payload = json.loads(result.stdout)

    assert result.exit_code == 0, result.output
    assert set(payload) == {"input_schema", "output_schema"}


def test_brmem_list_schema_flag_is_eager(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["list", "--schema"])
    payload = json.loads(result.stdout)

    assert result.exit_code == 0, result.output
    assert set(payload) == {"input_schema", "output_schema"}


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
        ["get", "plan/plan.md", "--namespace", "workbr", "--format", "json"],
        obj=_make_obj(),
    )
    payload = json.loads(result.stdout)

    assert result.exit_code == 2
    assert payload["exit_code"] == 2
    assert payload["error_type"] == "branch_memory_missing"
    assert "No content for key plan/plan.md" in payload["message"]


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
        "ref_name": "refs/brmem/base/feat---x/scratchpad",
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
    assert f"Stored scratchpad from {source_file} for base on branch feat/x." in result.output
    assert "Ref: refs/brmem/base/feat---x/scratchpad" in result.output


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
    assert "namespace: (base)" in result.stdout
    assert "ref: refs/brmem/base/feat---x/scratchpad" in result.stdout


def test_brmem_check_without_namespace_miss(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["check", "scratchpad"],
        obj=_make_obj(),
    )

    assert result.exit_code == 1
    assert result.stderr.strip() == (
        "not found: key=scratchpad namespace=(base) branch=feat/x "
        "at refs/brmem/base/feat---x/scratchpad"
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
        ["put", "plan.md", "--namespace", "workbr", "--file", str(ns_file)],
        obj=obj,
    )

    base_get = runner.invoke(cli_group, ["get", "plan.md"], obj=obj)
    ns_get = runner.invoke(cli_group, ["get", "plan.md", "--namespace", "workbr"], obj=obj)

    assert base_get.exit_code == 0
    assert base_get.output == "base\n"
    assert ns_get.exit_code == 0
    assert ns_get.output == "ns\n"


def test_brmem_list_returns_base_and_namespaced_entries_intermixed(
    cli_group: ClinkrGroup,
) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put(None, "scratch", "feat/x", "a\n")
    gateway.put("workbr", "plan", "feat/x", "b\n")
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(cli_group, ["list"], obj=obj)

    assert result.exit_code == 0, result.output
    assert result.output.splitlines() == [
        "(base)/scratch",
        "workbr/plan",
    ]


def test_brmem_list_namespace_filter_excludes_base_entries(
    cli_group: ClinkrGroup,
) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put(None, "scratch", "feat/x", "a\n")
    gateway.put("workbr", "plan", "feat/x", "b\n")
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(cli_group, ["list", "--namespace", "workbr"], obj=obj)

    assert result.exit_code == 0, result.output
    assert result.output.splitlines() == ["workbr/plan"]


def test_brmem_list_base_flag_returns_only_base_entries(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put(None, "scratch", "feat/x", "a\n")
    gateway.put("workbr", "plan", "feat/x", "b\n")
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(cli_group, ["list", "--base"], obj=obj)

    assert result.exit_code == 0, result.output
    assert result.output.splitlines() == ["(base)/scratch"]


def test_brmem_list_base_and_namespace_are_mutually_exclusive(
    cli_group: ClinkrGroup,
) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["list", "--base", "--namespace", "workbr", "--format", "json"],
        obj=_make_obj(),
    )
    payload = _json_output(result.output)

    assert result.exit_code == 2
    assert payload["error_type"] == "base_and_namespace_conflict"
    assert "mutually exclusive" in payload["message"]
