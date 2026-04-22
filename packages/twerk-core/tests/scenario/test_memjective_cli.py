from __future__ import annotations

import json
from pathlib import Path

import pytest
from click.testing import CliRunner

from twerk_core.brmem.context import BrmemCliContext
from twerk_core.brmem.fake import FakeBranchMemoryGateway
from twerk_core.clinkr.context import ClinkrContextObject, build_clinkr_context_object
from twerk_core.clinkr.group import ClinkrGroup
from twerk_core.git.testing import FakeGitGateway
from twerk_core.git.types import DetachedHead, GitCommandFailure
from twerk_core.memjective.main import build_cli


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


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


def test_memjective_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["-h"])

    assert result.exit_code == 0
    assert "Usage: memjective" in result.output
    assert "Inspect memjective snapshots stored as brmem entries." in result.output
    assert "--version" in result.output
    assert "list" in result.output


def test_memjective_version(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["--version"])

    assert result.exit_code == 0
    assert "version" in result.output


# ---------------------------------------------------------------------------
# memjective list
# ---------------------------------------------------------------------------


def _seed(branch: str = "feat/x") -> FakeBranchMemoryGateway:
    gateway = FakeBranchMemoryGateway()
    gateway.put("memjectives", "clinkr-migration.md", branch, "seed\n")
    gateway.put("memjectives", "memjective-cli.md", branch, "seed\n")
    # Entries in other namespaces must not leak into memjective list output.
    gateway.put("workbr", "plan.md", branch, "seed\n")
    # Entries on other branches must not leak into current-branch output.
    gateway.put("memjectives", "other-branch-only.md", "feat/other", "seed\n")
    return gateway


def test_memjective_list_defaults_to_current_branch(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(gateway=_seed())

    result = CliRunner().invoke(cli_group, ["list"], obj=obj)

    assert result.exit_code == 0, result.output
    assert result.output.splitlines() == [
        "clinkr-migration.md",
        "memjective-cli.md",
    ]


def test_memjective_list_alias_ls(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(gateway=_seed())

    result = CliRunner().invoke(cli_group, ["ls"], obj=obj)

    assert result.exit_code == 0, result.output
    assert result.output.splitlines() == [
        "clinkr-migration.md",
        "memjective-cli.md",
    ]


def test_memjective_list_empty_returns_nothing(cli_group: ClinkrGroup) -> None:
    obj = _make_obj()

    result = CliRunner().invoke(cli_group, ["list"], obj=obj)

    assert result.exit_code == 0, result.output
    assert result.output == ""


def test_memjective_list_explicit_branch_bypasses_current_branch(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["list", "--branch", "feat/other"],
        obj=_make_obj(gateway=_seed(), branch=DetachedHead()),
    )

    assert result.exit_code == 0, result.output
    assert result.output.splitlines() == ["other-branch-only.md"]


def test_memjective_list_rejects_detached_head_when_branch_omitted(
    cli_group: ClinkrGroup,
) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["list"],
        obj=_make_obj(branch=DetachedHead()),
    )

    assert result.exit_code == 2
    assert "detached head" in result.output.lower()


def test_memjective_list_surfaces_git_failure_when_branch_omitted(
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


def test_memjective_list_rejects_invalid_branch_name(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["list", "--branch", "feat---x"],
        obj=_make_obj(branch=None),
    )

    assert result.exit_code == 2
    assert "Invalid branch name 'feat---x'" in result.output


def test_memjective_list_ignores_other_namespaces(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("workbr", "plan.md", "feat/x", "seed\n")
    gateway.put("objectives", "obj.md", "feat/x", "seed\n")

    result = CliRunner().invoke(cli_group, ["list"], obj=_make_obj(gateway=gateway))

    assert result.exit_code == 0, result.output
    assert result.output == ""


def test_memjective_json_list(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("memjectives", "clinkr-migration.md", "feat/x", "seed\n")

    result = CliRunner().invoke(
        cli_group,
        ["json", "list"],
        input=json.dumps({}),
        obj=_make_obj(gateway=gateway),
    )
    payload = json.loads(result.output)

    assert result.exit_code == 0, result.output
    assert payload["exit_code"] == 0
    assert payload["data"] == {
        "branch": "feat/x",
        "entries": [
            {
                "namespace": "memjectives",
                "key": "clinkr-migration.md",
                "branch": "feat/x",
                "ref_name": "refs/brmem/memjectives/feat---x/clinkr-migration.md",
            }
        ],
    }


def test_memjective_list_schema_flag_is_eager(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["list", "--schema"])
    payload = json.loads(result.stdout)

    assert result.exit_code == 0, result.output
    assert set(payload) == {"input_schema", "output_schema"}


def test_memjective_list_format_json_matches_json_subtree(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("memjectives", "clinkr-migration.md", "feat/x", "seed\n")

    flag_result = CliRunner().invoke(
        cli_group,
        ["list", "--format", "json"],
        obj=_make_obj(gateway=gateway),
    )
    subtree_result = CliRunner().invoke(
        cli_group,
        ["json", "list"],
        input=json.dumps({}),
        obj=_make_obj(gateway=gateway),
    )

    assert flag_result.exit_code == 0, flag_result.output
    assert subtree_result.exit_code == 0, subtree_result.output
    assert flag_result.stdout == subtree_result.stdout
