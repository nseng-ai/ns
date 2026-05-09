from __future__ import annotations

import json
from pathlib import Path

import pytest
from click.testing import CliRunner

from asdl_core.clinkr.context import ClinkrContextObject, build_clinkr_context_object
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.gh.pr_testing import FakePRGateway
from asdl_core.git.testing import FakeGitGateway
from asdl_core.git.types import DetachedHead, GitCommandFailure
from asdl_objectives.context import ObjectiveCliContext
from asdl_objectives.main import build_cli
from brmem.fake import FakeBranchMemoryGateway


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def _make_obj(
    *,
    gateway: FakeBranchMemoryGateway | None = None,
    branch: str | DetachedHead | GitCommandFailure | None = "feat/x",
    live_branches: tuple[str, ...] = (),
) -> ClinkrContextObject:
    brmem_gateway = gateway if gateway is not None else FakeBranchMemoryGateway()
    if branch is None:
        git_gateway = FakeGitGateway(branches=live_branches, trunk_branch="master")
    else:
        git_gateway = FakeGitGateway(
            current_branch_by_path={Path.cwd(): branch},
            branches=live_branches,
            trunk_branch="master",
        )
    ctx = ObjectiveCliContext(
        brmem_gateway=brmem_gateway,
        git_gateway=git_gateway,
        pr_gateway=FakePRGateway(),
    )
    return build_clinkr_context_object(lambda: ctx)


# ---------------------------------------------------------------------------
# help / version
# ---------------------------------------------------------------------------


def test_objective_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["-h"])

    assert result.exit_code == 0
    assert "Usage: objective" in result.output
    assert "Inspect objective snapshots stored as brmem entries." in result.output
    assert "--version" in result.output
    assert "list" in result.output


def test_objective_version(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["--version"])

    assert result.exit_code == 0
    assert "version" in result.output


# ---------------------------------------------------------------------------
# objective list (repo-wide default)
# ---------------------------------------------------------------------------


def _seed(branch: str = "feat/x") -> FakeBranchMemoryGateway:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "clinkr-migration/body.md", branch, "seed\n")
    gateway.put("objectives", "objective-cli/body.md", branch, "seed\n")
    # Entries in other namespaces must not leak into objective list output.
    gateway.put("scratch", "plan.md", branch, "seed\n")
    # Entries on other branches must not leak into --here output.
    gateway.put("objectives", "other-branch-only/body.md", "feat/other", "seed\n")
    return gateway


def _seed_repo() -> FakeBranchMemoryGateway:
    gateway = FakeBranchMemoryGateway()
    # objective-cli: master seed + two branch snapshots (one deleted).
    gateway.put("objectives", "objective-cli/body.md", "master", "seed\n")
    gateway.put("objectives", "objective-cli/body.md", "mem-scaffold-list", "snap\n")
    gateway.put("objectives", "objective-cli/body.md", "mem-deleted-branch", "snap\n")
    # clinkr-migration: master seed only (seed-only case).
    gateway.put("objectives", "clinkr-migration/body.md", "master", "seed\n")
    # asdl-reviewer: branch snapshot only, no master seed (snapshot-only case).
    gateway.put("objectives", "asdl-reviewer/body.md", "feat/reviewer", "snap\n")
    # Non-objective namespace must not leak into repo-wide output.
    gateway.put("scratch", "plan.md", "feat/x", "seed\n")
    return gateway


def test_objective_list_defaults_to_repo_wide(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(
        gateway=_seed_repo(),
        live_branches=("master", "mem-scaffold-list", "feat/reviewer"),
    )

    result = CliRunner().invoke(cli_group, ["list"], obj=obj)

    assert result.exit_code == 0, result.output
    lines = result.output.splitlines()
    assert lines[0].startswith("SLUG")
    assert "CANONICAL" in lines[0]
    assert "BRANCHES" in lines[0]
    # slugs are sorted alphabetically by key
    assert "asdl-reviewer" in lines[1]
    assert "no" in lines[1]
    assert "clinkr-migration" in lines[2]
    assert "yes" in lines[2]
    assert "objective-cli" in lines[3]
    assert "(+1 deleted)" in lines[3]


def test_objective_list_alias_ls(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(
        gateway=_seed_repo(),
        live_branches=("master", "mem-scaffold-list", "feat/reviewer"),
    )

    result = CliRunner().invoke(cli_group, ["ls"], obj=obj)

    assert result.exit_code == 0, result.output
    lines = result.output.splitlines()
    assert lines[0].startswith("SLUG")
    assert "asdl-reviewer" in lines[1]
    assert "clinkr-migration" in lines[2]
    assert "objective-cli" in lines[3]


def test_objective_list_empty_returns_nothing(cli_group: ClinkrGroup) -> None:
    obj = _make_obj()

    result = CliRunner().invoke(cli_group, ["list"], obj=obj)

    assert result.exit_code == 0, result.output
    assert result.output == ""


def test_objective_list_ignores_other_namespaces(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("scratch", "plan.md", "feat/x", "seed\n")
    gateway.put("plans", "obj.md", "feat/x", "seed\n")

    result = CliRunner().invoke(
        cli_group,
        ["list"],
        obj=_make_obj(gateway=gateway, live_branches=("feat/x",)),
    )

    assert result.exit_code == 0, result.output
    assert result.output == ""


def test_objective_list_works_from_detached_head(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["list"],
        obj=_make_obj(
            gateway=_seed_repo(),
            branch=DetachedHead(),
            live_branches=("master", "mem-scaffold-list", "feat/reviewer"),
        ),
    )

    assert result.exit_code == 0, result.output
    assert "clinkr-migration" in result.output
    assert "objective-cli" in result.output


def test_objective_list_format_json(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["list", "--format", "json"],
        obj=_make_obj(
            gateway=_seed_repo(),
            live_branches=("master", "mem-scaffold-list", "feat/reviewer"),
        ),
    )
    payload = json.loads(result.output)

    assert result.exit_code == 0, result.output
    assert payload["exit_code"] == 0
    assert payload["data"] == {
        "scope": "repo",
        "objectives": [
            {
                "slug": "asdl-reviewer",
                "files": ["body.md"],
                "canonical_present": False,
                "state": "open",
                "branches": [
                    {"branch": "feat/reviewer", "deleted": False},
                ],
            },
            {
                "slug": "clinkr-migration",
                "files": ["body.md"],
                "canonical_present": True,
                "state": "open",
                "branches": [],
            },
            {
                "slug": "objective-cli",
                "files": ["body.md"],
                "canonical_present": True,
                "state": "open",
                "branches": [
                    {"branch": "mem-deleted-branch", "deleted": True},
                    {"branch": "mem-scaffold-list", "deleted": False},
                ],
            },
        ],
    }


def test_objective_list_json_schema_flag_is_eager(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["list", "--json-schema"])
    payload = json.loads(result.stdout)

    assert result.exit_code == 0, result.output
    assert set(payload) == {"input_json_schema", "output_json_schema"}


# ---------------------------------------------------------------------------
# objective list --here
# ---------------------------------------------------------------------------


def test_objective_list_here_returns_current_branch_slugs(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(gateway=_seed())

    result = CliRunner().invoke(cli_group, ["list", "--here"], obj=obj)

    assert result.exit_code == 0, result.output
    assert result.output.splitlines() == [
        "clinkr-migration",
        "objective-cli",
    ]


def test_objective_list_here_format_json(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "clinkr-migration/body.md", "feat/x", "seed\n")

    result = CliRunner().invoke(
        cli_group,
        ["list", "--here", "--format", "json"],
        obj=_make_obj(gateway=gateway),
    )
    payload = json.loads(result.output)

    assert result.exit_code == 0, result.output
    assert payload["exit_code"] == 0
    assert payload["data"] == {
        "branch": "feat/x",
        "slugs": ["clinkr-migration"],
        "entries": [
            {
                "namespace": "objectives",
                "key": "clinkr-migration/body.md",
                "branch": "feat/x",
                "ref_name": "refs/brmem/ns/objectives/feat---x:clinkr-migration/body.md",
            }
        ],
    }


def test_objective_list_here_rejects_detached_head(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["list", "--here"],
        obj=_make_obj(branch=DetachedHead()),
    )

    assert result.exit_code == 2
    assert "detached head" in result.output.lower()


def test_objective_list_here_surfaces_git_failure(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["list", "--here"],
        obj=_make_obj(
            branch=GitCommandFailure(
                message="fatal: not a git repository",
                returncode=128,
            )
        ),
    )

    assert result.exit_code == 2
    assert "not a git repository" in result.output


def test_objective_list_here_rejects_branch_flag(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["list", "--here", "--branch", "feat/x"],
        obj=_make_obj(),
    )

    assert result.exit_code == 2
    assert "--here cannot be combined with --branch" in result.output


def test_objective_list_here_and_branch_conflict_json(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["list", "--here", "--branch", "feat/x", "--format", "json"],
        obj=_make_obj(),
    )
    payload = json.loads(result.output)

    assert result.exit_code == 2
    assert payload["error_type"] == "conflicting_flags"
    assert payload["message"] == "--here cannot be combined with --branch."


# ---------------------------------------------------------------------------
# objective list --branch <name>
# ---------------------------------------------------------------------------


def test_objective_list_explicit_branch_bypasses_current_branch(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["list", "--branch", "feat/other"],
        obj=_make_obj(gateway=_seed(), branch=DetachedHead()),
    )

    assert result.exit_code == 0, result.output
    assert result.output.splitlines() == ["other-branch-only"]


def test_objective_list_rejects_invalid_branch_name(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["list", "--branch", "feat---x"],
        obj=_make_obj(branch=None),
    )

    assert result.exit_code == 2
    assert "Invalid branch name 'feat---x'" in result.output


# ---------------------------------------------------------------------------
# objective show
# ---------------------------------------------------------------------------


def test_objective_show_reports_seed_and_branches(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(
        gateway=_seed_repo(),
        live_branches=("master", "mem-scaffold-list", "feat/reviewer"),
    )

    result = CliRunner().invoke(cli_group, ["show", "objective-cli"], obj=obj)

    assert result.exit_code == 0, result.output
    assert "slug: objective-cli" in result.output
    assert "key:" not in result.output
    assert "canonical: present (master)" in result.output
    assert "mem-scaffold-list" in result.output
    assert "mem-deleted-branch [deleted]" in result.output
    assert "files:" in result.output
    assert "- body.md" in result.output


def test_objective_show_accepts_body_suffix(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(
        gateway=_seed_repo(),
        live_branches=("master", "mem-scaffold-list"),
    )

    result = CliRunner().invoke(cli_group, ["show", "objective-cli/body.md"], obj=obj)

    assert result.exit_code == 0, result.output
    assert "slug: objective-cli" in result.output


def test_objective_show_seed_only_slug(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(gateway=_seed_repo(), live_branches=("master",))

    result = CliRunner().invoke(cli_group, ["show", "clinkr-migration"], obj=obj)

    assert result.exit_code == 0, result.output
    assert "canonical: present (master)" in result.output
    assert "branches: (none)" in result.output
    assert "files:" in result.output
    assert "- body.md" in result.output


def test_objective_show_missing_slug_is_negative(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(gateway=_seed_repo(), live_branches=("master",))

    result = CliRunner().invoke(cli_group, ["show", "does-not-exist"], obj=obj)

    assert result.exit_code == 1
    assert "No objective found for slug 'does-not-exist'." in result.output


def test_objective_show_reads_archived_slug(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives-archive", "closed-one/body.md", "master", "archived body\n")
    gateway.put(
        "objectives-archive",
        "closed-one/.closed",
        "master",
        '{"schema":1,"closed_at":"t","reason":"done"}\n',
    )
    obj = _make_obj(gateway=gateway, live_branches=("master",))

    result = CliRunner().invoke(cli_group, ["show", "closed-one", "--format", "json"], obj=obj)
    payload = json.loads(result.output)

    assert result.exit_code == 0, result.output
    assert payload["data"]["state"] == "closed"
    assert payload["data"]["closed_at"] == "t"
    assert payload["data"]["closed_reason"] == "done"
    assert payload["data"]["body"] == {"source_branch": "master", "content": "archived body\n"}


def test_objective_show_format_json(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(
        gateway=_seed_repo(),
        live_branches=("master", "mem-scaffold-list", "feat/reviewer"),
    )

    result = CliRunner().invoke(
        cli_group,
        ["show", "objective-cli", "--format", "json"],
        obj=obj,
    )
    payload = json.loads(result.output)

    assert result.exit_code == 0, result.output
    assert payload["exit_code"] == 0
    assert payload["data"] == {
        "slug": "objective-cli",
        "canonical_present": True,
        "canonical_trunk": "master",
        "state": "open",
        "closed_at": None,
        "closed_reason": None,
        "branches": [
            {"branch": "mem-deleted-branch", "deleted": True},
            {"branch": "mem-scaffold-list", "deleted": False},
        ],
        "files": ["body.md"],
        "body": {"source_branch": "master", "content": "seed\n"},
        "roadmap": None,
        "notes": None,
    }


def test_objective_show_missing_slug_json(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(gateway=_seed_repo(), live_branches=("master",))

    result = CliRunner().invoke(
        cli_group,
        ["show", "does-not-exist", "--format", "json"],
        obj=obj,
    )
    payload = json.loads(result.output)

    assert result.exit_code == 1
    assert payload["exit_code"] == 1
    assert payload["message"] == "No objective found for slug 'does-not-exist'."
    assert payload["data"] == {
        "slug": "does-not-exist",
        "canonical_present": False,
        "canonical_trunk": "master",
        "state": "open",
        "closed_at": None,
        "closed_reason": None,
        "branches": [],
        "files": [],
        "body": None,
        "roadmap": None,
        "notes": None,
    }


def _seed_sole_objective_on_branch() -> FakeBranchMemoryGateway:
    gateway = FakeBranchMemoryGateway()
    # objective-cli is the only objective on the current branch feat/x,
    # with a master seed to verify the repo-wide view is returned.
    gateway.put("objectives", "objective-cli/body.md", "master", "seed\n")
    gateway.put("objectives", "objective-cli/body.md", "feat/x", "snap\n")
    # Objectives on other branches must not trigger ambiguity.
    gateway.put("objectives", "other-slug/body.md", "feat/other", "snap\n")
    # Entries in other namespaces must not count toward the total.
    gateway.put("scratch", "plan.md", "feat/x", "seed\n")
    return gateway


def test_objective_show_no_slug_defaults_to_sole_objective(
    cli_group: ClinkrGroup,
) -> None:
    obj = _make_obj(
        gateway=_seed_sole_objective_on_branch(),
        live_branches=("master", "feat/x", "feat/other"),
    )

    result = CliRunner().invoke(cli_group, ["show"], obj=obj)

    assert result.exit_code == 0, result.output
    assert "slug: objective-cli" in result.output
    assert "key:" not in result.output
    assert "canonical: present (master)" in result.output
    assert "feat/x" in result.output
    assert "files:" in result.output
    assert "- body.md" in result.output


def test_objective_show_no_slug_defaults_json(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(
        gateway=_seed_sole_objective_on_branch(),
        live_branches=("master", "feat/x", "feat/other"),
    )

    result = CliRunner().invoke(cli_group, ["show", "--format", "json"], obj=obj)
    payload = json.loads(result.output)

    assert result.exit_code == 0, result.output
    assert payload["exit_code"] == 0
    assert payload["data"] == {
        "slug": "objective-cli",
        "canonical_present": True,
        "canonical_trunk": "master",
        "state": "open",
        "closed_at": None,
        "closed_reason": None,
        "branches": [{"branch": "feat/x", "deleted": False}],
        "files": ["body.md"],
        "body": {"source_branch": "feat/x", "content": "snap\n"},
        "roadmap": None,
        "notes": None,
    }


def test_objective_show_no_slug_errors_when_branch_empty(
    cli_group: ClinkrGroup,
) -> None:
    # _seed_repo() seeds no objectives on feat/x (the default current branch),
    # so the branch-scoped default must fail even though other branches carry
    # objectives in the repo.
    obj = _make_obj(
        gateway=_seed_repo(),
        live_branches=("master", "mem-scaffold-list", "feat/reviewer"),
    )

    result = CliRunner().invoke(cli_group, ["show", "--format", "json"], obj=obj)
    payload = json.loads(result.output)

    assert result.exit_code == 2
    assert payload["exit_code"] == 2
    assert payload["error_type"] == "no_objective_on_branch"
    assert payload["message"] == "No objective on branch 'feat/x'."


def test_objective_show_with_multiple_slugs_on_branch_uses_explicit_slug(
    cli_group: ClinkrGroup,
) -> None:
    """A branch may legitimately carry multiple objective slugs (e.g. a
    parent objective plus an unrelated co-attachment). Passing an explicit
    SLUG resolves correctly without auto-picking; both slugs are
    independently inspectable from the same branch.

    Locks the multi-slug invariant of the objective tree / show / current
    path: attachments are per-slug, never per-branch. Exercises the C9 multi-
    slug-on-one-branch case from the canonicalization plan.
    """
    gateway = FakeBranchMemoryGateway()
    # Two unrelated objectives both attached on feat/x.
    gateway.put("objectives", "parent-objective/body.md", "feat/x", "parent-snap\n")
    gateway.put("objectives", "co-attached-objective/body.md", "feat/x", "co-snap\n")
    obj = _make_obj(gateway=gateway, live_branches=("feat/x",))

    parent = CliRunner().invoke(
        cli_group,
        ["show", "parent-objective", "--format", "json"],
        obj=obj,
    )
    co = CliRunner().invoke(
        cli_group,
        ["show", "co-attached-objective", "--format", "json"],
        obj=obj,
    )

    assert parent.exit_code == 0, parent.output
    assert co.exit_code == 0, co.output
    parent_data = json.loads(parent.output)["data"]
    co_data = json.loads(co.output)["data"]
    # Each slug renders independently with its own body content.
    assert parent_data["slug"] == "parent-objective"
    assert parent_data["body"] == {"source_branch": "feat/x", "content": "parent-snap\n"}
    assert co_data["slug"] == "co-attached-objective"
    assert co_data["body"] == {"source_branch": "feat/x", "content": "co-snap\n"}
    # The co-attachment does not leak into the other slug's branches list.
    assert parent_data["branches"] == [{"branch": "feat/x", "deleted": False}]
    assert co_data["branches"] == [{"branch": "feat/x", "deleted": False}]

    # ``list --here`` reports both slugs.
    listed = CliRunner().invoke(cli_group, ["list", "--here"], obj=obj)
    assert listed.exit_code == 0, listed.output
    assert listed.output.splitlines() == [
        "co-attached-objective",
        "parent-objective",
    ]


def test_objective_show_no_slug_errors_when_ambiguous(cli_group: ClinkrGroup) -> None:
    # _seed() puts two objective snapshots on feat/x (the default branch):
    # clinkr-migration.md and objective-cli.md.
    obj = _make_obj(gateway=_seed(), live_branches=("feat/x",))

    result = CliRunner().invoke(cli_group, ["show"], obj=obj)

    assert result.exit_code == 2
    assert "Multiple objectives on branch 'feat/x':" in result.output
    assert "clinkr-migration" in result.output
    assert "objective-cli" in result.output
    assert "Specify a SLUG." in result.output


def test_objective_show_no_slug_ambiguous_json(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(gateway=_seed(), live_branches=("feat/x",))

    result = CliRunner().invoke(cli_group, ["show", "--format", "json"], obj=obj)
    payload = json.loads(result.output)

    assert result.exit_code == 2
    assert payload["exit_code"] == 2
    assert payload["error_type"] == "ambiguous_objective"
    assert "clinkr-migration" in payload["message"]
    assert "objective-cli" in payload["message"]


def test_objective_show_no_slug_errors_on_detached_head(
    cli_group: ClinkrGroup,
) -> None:
    obj = _make_obj(
        gateway=_seed_sole_objective_on_branch(),
        branch=DetachedHead(),
        live_branches=("master", "feat/x"),
    )

    result = CliRunner().invoke(cli_group, ["show"], obj=obj)

    assert result.exit_code == 2


def test_objective_show_lists_multiple_files_under_slug(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "objective-cli/body.md", "master", "body seed\n")
    gateway.put("objectives", "objective-cli/notes.md", "master", "notes seed\n")
    obj = _make_obj(gateway=gateway, live_branches=("master",))

    result = CliRunner().invoke(cli_group, ["show", "objective-cli"], obj=obj)

    assert result.exit_code == 0, result.output
    assert "files:" in result.output
    assert "- body.md" in result.output
    assert "- notes.md" in result.output
    assert "body seed" in result.output
    assert "notes seed" in result.output
    assert "body.md (canonical: master)" in result.output
    assert "notes.md (canonical: master)" in result.output


def test_objective_show_lists_multiple_files_json(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "objective-cli/body.md", "master", "body seed\n")
    gateway.put("objectives", "objective-cli/notes.md", "master", "notes seed\n")
    obj = _make_obj(gateway=gateway, live_branches=("master",))

    result = CliRunner().invoke(
        cli_group,
        ["show", "objective-cli", "--format", "json"],
        obj=obj,
    )
    payload = json.loads(result.output)

    assert result.exit_code == 0, result.output
    assert payload["data"]["files"] == ["body.md", "notes.md"]
    assert payload["data"]["body"] == {"source_branch": "master", "content": "body seed\n"}
    assert payload["data"]["notes"] == {"source_branch": "master", "content": "notes seed\n"}
    assert payload["data"]["roadmap"] is None


def test_objective_show_renders_body_markdown(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    body = "# Heading\n\n- distinctive-item\n\nParagraph text.\n"
    gateway.put("objectives", "objective-cli/body.md", "master", body)
    obj = _make_obj(gateway=gateway, live_branches=("master",))

    result = CliRunner().invoke(cli_group, ["show", "objective-cli"], obj=obj)

    assert result.exit_code == 0, result.output
    assert "Heading" in result.output
    assert "distinctive-item" in result.output
    assert "Paragraph text." in result.output
    assert "body.md (canonical: master)" in result.output


def test_objective_show_prefers_current_branch_body(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put(
        "objectives",
        "objective-cli/body.md",
        "master",
        "master-only-sentinel\n",
    )
    gateway.put(
        "objectives",
        "objective-cli/body.md",
        "feat/x",
        "branch-only-sentinel\n",
    )
    obj = _make_obj(gateway=gateway, live_branches=("master", "feat/x"))

    result = CliRunner().invoke(cli_group, ["show", "objective-cli"], obj=obj)

    assert result.exit_code == 0, result.output
    assert "branch-only-sentinel" in result.output
    assert "master-only-sentinel" not in result.output
    assert "body.md (branch: feat/x)" in result.output


def test_objective_show_omits_body_when_only_non_body_files_present(
    cli_group: ClinkrGroup,
) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "objective-cli/notes.md", "master", "notes only\n")
    obj = _make_obj(gateway=gateway, live_branches=("master",))

    result = CliRunner().invoke(cli_group, ["show", "objective-cli"], obj=obj)

    assert result.exit_code == 0, result.output
    assert "files:" in result.output
    assert "- notes.md" in result.output
    assert "notes only" in result.output
    assert "notes.md (canonical: master)" in result.output
    assert "body.md (" not in result.output

    json_result = CliRunner().invoke(
        cli_group,
        ["show", "objective-cli", "--format", "json"],
        obj=obj,
    )
    payload = json.loads(json_result.output)
    assert payload["data"]["files"] == ["notes.md"]
    assert payload["data"]["body"] is None
    assert payload["data"]["notes"] == {"source_branch": "master", "content": "notes only\n"}


def test_objective_show_renders_body_roadmap_and_notes_markdown(
    cli_group: ClinkrGroup,
) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "objective-cli/body.md", "master", "# Body\n\nbody-sentinel\n")
    gateway.put(
        "objectives",
        "objective-cli/roadmap.md",
        "master",
        "# Roadmap\n\n- [ ] roadmap-sentinel\n",
    )
    gateway.put(
        "objectives",
        "objective-cli/notes.md",
        "master",
        "# Notes\n\n- notes-sentinel\n",
    )
    obj = _make_obj(gateway=gateway, live_branches=("master",))

    result = CliRunner().invoke(cli_group, ["show", "objective-cli"], obj=obj)

    assert result.exit_code == 0, result.output
    assert "body-sentinel" in result.output
    assert "roadmap-sentinel" in result.output
    assert "notes-sentinel" in result.output
    assert "body.md (canonical: master)" in result.output
    assert "roadmap.md (canonical: master)" in result.output
    assert "notes.md (canonical: master)" in result.output


def test_objective_show_prefers_current_branch_per_file(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "objective-cli/body.md", "master", "master-body\n")
    gateway.put("objectives", "objective-cli/body.md", "feat/x", "branch-body\n")
    gateway.put("objectives", "objective-cli/roadmap.md", "master", "master-roadmap\n")
    gateway.put("objectives", "objective-cli/notes.md", "feat/x", "branch-notes\n")
    obj = _make_obj(gateway=gateway, live_branches=("master", "feat/x"))

    result = CliRunner().invoke(
        cli_group,
        ["show", "objective-cli", "--format", "json"],
        obj=obj,
    )
    payload = json.loads(result.output)

    assert result.exit_code == 0, result.output
    assert payload["data"]["body"] == {"source_branch": "feat/x", "content": "branch-body\n"}
    assert payload["data"]["roadmap"] == {
        "source_branch": "master",
        "content": "master-roadmap\n",
    }
    assert payload["data"]["notes"] == {"source_branch": "feat/x", "content": "branch-notes\n"}


def test_objective_show_labels_per_file_source_in_mixed_render(
    cli_group: ClinkrGroup,
) -> None:
    """A mixed-source render labels each file with ``canonical: master``
    or ``branch: <name>`` so the effective view is unambiguous.

    Without ``--branch``, ``objective show`` resolves each file
    independently (current-branch first, canonical fallback). The
    rendered output must distinguish canonical files from branch-snapshot
    files so a reader cannot mistake the mixed view for a single
    snapshot. Exercises B8 of the canonicalization plan.
    """
    gateway = FakeBranchMemoryGateway()
    # Mixed sources within a single render: body from the current branch,
    # roadmap from canonical master, notes from the current branch.
    gateway.put("objectives", "objective-cli/body.md", "master", "master-body\n")
    gateway.put("objectives", "objective-cli/body.md", "feat/x", "branch-body\n")
    gateway.put("objectives", "objective-cli/roadmap.md", "master", "master-roadmap\n")
    gateway.put("objectives", "objective-cli/notes.md", "feat/x", "branch-notes\n")
    obj = _make_obj(gateway=gateway, live_branches=("master", "feat/x"))

    result = CliRunner().invoke(cli_group, ["show", "objective-cli"], obj=obj)

    assert result.exit_code == 0, result.output
    # Branch snapshot files use the ``branch: <name>`` label.
    assert "body.md (branch: feat/x)" in result.output
    assert "notes.md (branch: feat/x)" in result.output
    # Canonical fallback uses the explicit ``canonical: master`` label.
    assert "roadmap.md (canonical: master)" in result.output
    # The mixed view never renders an ambiguous "feat/x" or "master" header
    # without the source qualifier — the qualifier is what makes the
    # mixed-fallback contract legible.
    assert "body.md (master)" not in result.output
    assert "roadmap.md (feat/x)" not in result.output


def test_objective_show_branch_reads_from_requested_branch(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "objective-cli/body.md", "master", "master-sentinel\n")
    gateway.put("objectives", "objective-cli/body.md", "feat/x", "feat-x-sentinel\n")
    obj = _make_obj(
        gateway=gateway,
        branch="feat/other",
        live_branches=("master", "feat/x", "feat/other"),
    )

    result = CliRunner().invoke(
        cli_group,
        ["show", "objective-cli", "--branch", "feat/x", "--format", "json"],
        obj=obj,
    )
    payload = json.loads(result.output)

    assert result.exit_code == 0, result.output
    assert payload["data"]["body"] == {
        "source_branch": "feat/x",
        "content": "feat-x-sentinel\n",
    }


def test_objective_show_branch_strict_no_master_fallback(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "objective-cli/body.md", "master", "master-sentinel\n")
    obj = _make_obj(
        gateway=gateway,
        branch="feat/other",
        live_branches=("master", "feat/other"),
    )

    result = CliRunner().invoke(
        cli_group,
        ["show", "objective-cli", "--branch", "feat/x", "--format", "json"],
        obj=obj,
    )
    payload = json.loads(result.output)

    assert result.exit_code == 0, result.output
    assert payload["data"]["body"] is None
    assert payload["data"]["roadmap"] is None
    assert payload["data"]["notes"] is None
    assert payload["data"]["canonical_present"] is True
    assert payload["data"]["files"] == ["body.md"]


def test_objective_show_branch_auto_resolves_slug_from_requested_branch(
    cli_group: ClinkrGroup,
) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "objective-cli/body.md", "feat/x", "snap\n")
    obj = _make_obj(
        gateway=gateway,
        branch="feat/empty",
        live_branches=("feat/x", "feat/empty"),
    )

    result = CliRunner().invoke(
        cli_group,
        ["show", "--branch", "feat/x", "--format", "json"],
        obj=obj,
    )
    payload = json.loads(result.output)

    assert result.exit_code == 0, result.output
    assert payload["data"]["slug"] == "objective-cli"


def test_objective_show_branch_invalid_name_errors(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(gateway=_seed_repo(), live_branches=("master",))

    result = CliRunner().invoke(
        cli_group,
        ["show", "objective-cli", "--branch", "nope---bad", "--format", "json"],
        obj=obj,
    )
    payload = json.loads(result.output)

    assert result.exit_code != 0
    assert payload["error_type"] == "invalid_branch_name"


def test_objective_show_branch_repo_summary_unchanged(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(
        gateway=_seed_repo(),
        live_branches=("master", "mem-scaffold-list", "feat/reviewer"),
    )

    no_flag = CliRunner().invoke(
        cli_group,
        ["show", "objective-cli", "--format", "json"],
        obj=obj,
    )
    with_flag = CliRunner().invoke(
        cli_group,
        ["show", "objective-cli", "--branch", "mem-scaffold-list", "--format", "json"],
        obj=obj,
    )

    assert no_flag.exit_code == 0, no_flag.output
    assert with_flag.exit_code == 0, with_flag.output
    no_flag_data = json.loads(no_flag.output)["data"]
    with_flag_data = json.loads(with_flag.output)["data"]
    assert with_flag_data["branches"] == no_flag_data["branches"]
    assert with_flag_data["canonical_present"] == no_flag_data["canonical_present"]
    assert with_flag_data["files"] == no_flag_data["files"]


def test_objective_list_here_dedupes_slug_with_multiple_files(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "objective-cli/body.md", "feat/x", "body\n")
    gateway.put("objectives", "objective-cli/roadmap.md", "feat/x", "roadmap\n")
    gateway.put("objectives", "objective-cli/notes.md", "feat/x", "notes\n")
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(cli_group, ["list", "--here"], obj=obj)

    assert result.exit_code == 0, result.output
    assert result.output.splitlines() == ["objective-cli"]


def test_objective_list_groups_multiple_files_under_one_slug(
    cli_group: ClinkrGroup,
) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "objective-cli/body.md", "master", "body\n")
    gateway.put("objectives", "objective-cli/roadmap.md", "master", "roadmap\n")
    gateway.put("objectives", "objective-cli/notes.md", "master", "notes\n")
    obj = _make_obj(gateway=gateway, live_branches=("master",))

    result = CliRunner().invoke(
        cli_group,
        ["list", "--format", "json"],
        obj=obj,
    )
    payload = json.loads(result.output)

    assert result.exit_code == 0, result.output
    assert payload["data"]["objectives"] == [
        {
            "slug": "objective-cli",
            "files": ["body.md", "notes.md", "roadmap.md"],
            "canonical_present": True,
            "state": "open",
            "branches": [],
        }
    ]
