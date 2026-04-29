"""Scenario tests for ``objective exec claim-plan``.

The skill ``objective-claim`` runs this command to plan a one-slug
carry-forward deterministically. These tests exercise the contract end to
end via ``build_cli()`` with the standard fake gateways used across
objective scenario tests, focusing on the structured envelope shape
(plan / ambiguity / error), the source cascade, and the hard preconditions.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from click.testing import CliRunner

from brmem.fake import FakeBranchMemoryGateway
from twerk_core.clinkr.context import ClinkrContextObject, build_clinkr_context_object
from twerk_core.clinkr.group import ClinkrGroup
from twerk_core.gh.pr_testing import FakePRGateway
from twerk_core.git.testing import FakeGitGateway
from twerk_core.git.types import DetachedHead
from twerk_objectives.context import ObjectiveCliContext
from twerk_objectives.exec.claim_plan import PLAN_SCHEMA
from twerk_objectives.main import build_cli


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def _make_obj(
    *,
    gateway: FakeBranchMemoryGateway,
    current_branch: str | DetachedHead = "feat/x",
    branches: tuple[str, ...] = ("master", "feat/x"),
    ancestors: tuple[tuple[str, str], ...] = (),
    commit_count_by_range: dict[str, int] | None = None,
) -> ClinkrContextObject:
    git_gateway = FakeGitGateway(
        current_branch_by_path={Path.cwd(): current_branch},
        branches=branches,
        trunk_branch="master",
        ancestors=ancestors,
        commit_count_by_range=commit_count_by_range,
    )
    ctx = ObjectiveCliContext(
        brmem_gateway=gateway,
        git_gateway=git_gateway,
        pr_gateway=FakePRGateway(),
    )
    return build_clinkr_context_object(lambda: ctx)


# ---------------------------------------------------------------------------
# help / schema
# ---------------------------------------------------------------------------


def test_claim_plan_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "claim-plan", "-h"])

    assert result.exit_code == 0
    assert "Usage: objective exec claim-plan" in result.output


def test_claim_plan_schema_flag_is_eager(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "claim-plan", "--schema"])

    assert result.exit_code == 0, result.output
    payload = json.loads(result.stdout)
    assert set(payload) == {"input_schema", "output_schema"}


# ---------------------------------------------------------------------------
# explicit slug + canonical fallback (no ancestors, no --from)
# ---------------------------------------------------------------------------


def test_claim_plan_explicit_slug_falls_back_to_canonical(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget-rewrite/body.md", "master", "# canonical\n")
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(
        cli_group,
        ["exec", "claim-plan", "widget-rewrite", "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["schema"] == PLAN_SCHEMA
    assert data["status"] == "plan"
    assert data["plan"]["slug"] == "widget-rewrite"
    assert data["plan"]["target_branch"] == "feat/x"
    assert data["plan"]["source"]["kind"] == "canonical"
    assert data["plan"]["source"]["branch"] == "master"
    assert data["plan"]["source"]["from_file_path"] is None
    assert data["plan"]["source"]["label"] == "canonical objective"
    assert data["ambiguity"] is None
    assert data["error"] is None


# ---------------------------------------------------------------------------
# explicit slug + --from <branch> happy path
# ---------------------------------------------------------------------------


def test_claim_plan_explicit_slug_explicit_from_branch(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget-rewrite/body.md", "master", "# canonical\n")
    gateway.put("objectives", "widget-rewrite/body.md", "feat/source", "# source\n")
    obj = _make_obj(
        gateway=gateway,
        branches=("master", "feat/x", "feat/source"),
    )

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "claim-plan",
            "widget-rewrite",
            "--from",
            "feat/source",
            "--format",
            "json",
        ],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["status"] == "plan"
    assert data["plan"]["source"]["kind"] == "branch"
    assert data["plan"]["source"]["branch"] == "feat/source"
    assert "explicit --from" in data["plan"]["source"]["label"]


# ---------------------------------------------------------------------------
# explicit slug + --from-file <path> happy path
# ---------------------------------------------------------------------------


def test_claim_plan_explicit_slug_explicit_from_file(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    body_path = tmp_path / "body.md"
    body_path.write_text("# new body\n", encoding="utf-8")
    obj = _make_obj(gateway=FakeBranchMemoryGateway())

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "claim-plan",
            "widget-rewrite",
            "--from-file",
            str(body_path),
            "--format",
            "json",
        ],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["status"] == "plan"
    assert data["plan"]["source"]["kind"] == "local_file"
    assert data["plan"]["source"]["from_file_path"] == str(body_path)
    assert data["plan"]["source"]["branch"] is None
    assert "local file" in data["plan"]["source"]["label"]


# ---------------------------------------------------------------------------
# no-slug + single-candidate ancestor -> unique plan
# ---------------------------------------------------------------------------


def test_claim_plan_no_slug_single_candidate_ancestor(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "alpha/body.md", "master", "# canonical alpha\n")
    gateway.put("objectives", "alpha/body.md", "feat/parent", "# parent alpha\n")
    obj = _make_obj(
        gateway=gateway,
        branches=("master", "feat/x", "feat/parent"),
        ancestors=(("feat/parent", "HEAD"),),
        commit_count_by_range={"feat/parent..HEAD": 3},
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "claim-plan", "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["status"] == "plan"
    assert data["plan"]["slug"] == "alpha"
    assert data["plan"]["source"]["kind"] == "branch"
    assert data["plan"]["source"]["branch"] == "feat/parent"
    assert data["plan"]["source"]["label"].startswith("ancestor branch ")


# ---------------------------------------------------------------------------
# no-slug + multi-candidate ancestor -> structured ambiguity
# ---------------------------------------------------------------------------


def test_claim_plan_no_slug_multi_candidate_ancestor(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "alpha/body.md", "feat/parent", "# alpha\n")
    gateway.put("objectives", "beta/body.md", "feat/parent", "# beta\n")
    obj = _make_obj(
        gateway=gateway,
        branches=("master", "feat/x", "feat/parent"),
        ancestors=(("feat/parent", "HEAD"),),
        commit_count_by_range={"feat/parent..HEAD": 2},
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "claim-plan", "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["status"] == "ambiguous"
    amb = data["ambiguity"]
    assert amb["reason"] == "ambiguous_slug_candidates"
    assert {a["slug"] for a in amb["slug_alternatives"]} == {"alpha", "beta"}
    assert amb["branch_alternatives"] == []
    assert all(a["available_on_branch"] == "feat/parent" for a in amb["slug_alternatives"])


# ---------------------------------------------------------------------------
# no-slug + canonical fallback (no ancestor, master has slugs) -> ambiguity
# ---------------------------------------------------------------------------


def test_claim_plan_no_slug_canonical_fallback_lists_master_slugs(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "alpha/body.md", "master", "# alpha\n")
    gateway.put("objectives", "beta/body.md", "master", "# beta\n")
    gateway.put("objectives", "gamma/body.md", "master", "# gamma\n")
    obj = _make_obj(gateway=gateway, branches=("master", "feat/x"))

    result = CliRunner().invoke(
        cli_group,
        ["exec", "claim-plan", "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["status"] == "ambiguous"
    amb = data["ambiguity"]
    assert amb["reason"] == "ambiguous_slug_candidates"
    assert {a["slug"] for a in amb["slug_alternatives"]} == {"alpha", "beta", "gamma"}
    assert all(a["available_on_branch"] == "master" for a in amb["slug_alternatives"])


# ---------------------------------------------------------------------------
# no-slug + nothing reachable -> structured error
# ---------------------------------------------------------------------------


def test_claim_plan_no_slug_nothing_reachable(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(gateway=FakeBranchMemoryGateway(), branches=("master", "feat/x"))

    result = CliRunner().invoke(
        cli_group,
        ["exec", "claim-plan", "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["status"] == "ambiguous"
    amb = data["ambiguity"]
    assert amb["reason"] == "no_slug_no_candidates"
    assert "objective-create" in amb["message"]
    assert "--from-file" in amb["message"]
    assert amb["slug_alternatives"] == []
    assert amb["branch_alternatives"] == []


# ---------------------------------------------------------------------------
# target collision (target already carries <slug>/)
# ---------------------------------------------------------------------------


def test_claim_plan_target_collision(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget-rewrite/body.md", "master", "# canonical\n")
    gateway.put("objectives", "widget-rewrite/body.md", "feat/x", "# already attached\n")
    obj = _make_obj(gateway=gateway, branches=("master", "feat/x"))

    result = CliRunner().invoke(
        cli_group,
        ["exec", "claim-plan", "widget-rewrite", "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["status"] == "error"
    err = data["error"]
    assert err["reason"] == "target_collision"
    assert "feat/x" in err["message"]
    assert "widget-rewrite" in err["message"]


# ---------------------------------------------------------------------------
# explicit slug not present at canonical or any ancestor -> structured error
# ---------------------------------------------------------------------------


def test_claim_plan_explicit_slug_not_found_anywhere(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(gateway=FakeBranchMemoryGateway(), branches=("master", "feat/x"))

    result = CliRunner().invoke(
        cli_group,
        ["exec", "claim-plan", "ghost", "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["status"] == "error"
    err = data["error"]
    assert err["reason"] == "explicit_slug_not_found"
    assert "ghost" in err["message"]


# ---------------------------------------------------------------------------
# --from source missing the slug -> structured error
# ---------------------------------------------------------------------------


def test_claim_plan_from_branch_missing_slug(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    # Source branch has the namespace but not this slug.
    gateway.put("objectives", "other/body.md", "feat/source", "# other\n")
    obj = _make_obj(gateway=gateway, branches=("master", "feat/x", "feat/source"))

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "claim-plan",
            "widget-rewrite",
            "--from",
            "feat/source",
            "--format",
            "json",
        ],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["status"] == "error"
    err = data["error"]
    assert err["reason"] == "from_missing_slug"
    assert "feat/source" in err["message"]


# ---------------------------------------------------------------------------
# --from-file path missing or unreadable -> structured error
# ---------------------------------------------------------------------------


def test_claim_plan_from_file_missing(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    obj = _make_obj(gateway=FakeBranchMemoryGateway())

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "claim-plan",
            "widget-rewrite",
            "--from-file",
            str(tmp_path / "does-not-exist.md"),
            "--format",
            "json",
        ],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["status"] == "error"
    err = data["error"]
    assert err["reason"] == "from_file_unreadable"


# ---------------------------------------------------------------------------
# hard preconditions
# ---------------------------------------------------------------------------


def test_claim_plan_detached_head_without_target_fails_hard(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(
        gateway=FakeBranchMemoryGateway(),
        current_branch=DetachedHead(),
        branches=("master",),
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "claim-plan", "widget-rewrite", "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 2
    payload = json.loads(result.output)
    assert payload["error_type"] == "detached_head"


def test_claim_plan_target_trunk_fails_hard(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(gateway=FakeBranchMemoryGateway())

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "claim-plan",
            "widget-rewrite",
            "--target",
            "master",
            "--format",
            "json",
        ],
        obj=obj,
    )

    assert result.exit_code == 2
    payload = json.loads(result.output)
    assert payload["error_type"] == "target_is_trunk"


def test_claim_plan_from_branch_and_from_file_together_fail_hard(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    body_path = tmp_path / "body.md"
    body_path.write_text("# body\n", encoding="utf-8")
    obj = _make_obj(gateway=FakeBranchMemoryGateway())

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "claim-plan",
            "widget-rewrite",
            "--from",
            "feat/source",
            "--from-file",
            str(body_path),
            "--format",
            "json",
        ],
        obj=obj,
    )

    assert result.exit_code == 2
    payload = json.loads(result.output)
    assert payload["error_type"] == "conflicting_source_flags"


def test_claim_plan_from_branch_without_slug_fails_hard(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(gateway=FakeBranchMemoryGateway())

    result = CliRunner().invoke(
        cli_group,
        ["exec", "claim-plan", "--from", "feat/source", "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 2
    payload = json.loads(result.output)
    assert payload["error_type"] == "source_flag_without_slug"


def test_claim_plan_from_file_without_slug_fails_hard(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    body_path = tmp_path / "body.md"
    body_path.write_text("# body\n", encoding="utf-8")
    obj = _make_obj(gateway=FakeBranchMemoryGateway())

    result = CliRunner().invoke(
        cli_group,
        ["exec", "claim-plan", "--from-file", str(body_path), "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 2
    payload = json.loads(result.output)
    assert payload["error_type"] == "source_flag_without_slug"


# ---------------------------------------------------------------------------
# deterministic JSON shape
# ---------------------------------------------------------------------------


def test_claim_plan_envelope_shape_is_deterministic(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    body_path = tmp_path / "body.md"
    body_path.write_text("# body\n", encoding="utf-8")
    obj = _make_obj(gateway=FakeBranchMemoryGateway())

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "claim-plan",
            "widget-rewrite",
            "--from-file",
            str(body_path),
            "--format",
            "json",
        ],
        obj=obj,
    )

    data = json.loads(result.output)["data"]
    assert set(data.keys()) == {
        "schema",
        "canonical_branch",
        "requested_slug",
        "requested_target",
        "requested_from_branch",
        "requested_from_file",
        "status",
        "plan",
        "ambiguity",
        "error",
    }
    assert data["schema"] == PLAN_SCHEMA
    assert data["canonical_branch"] == "master"
    assert data["requested_slug"] == "widget-rewrite"
    assert data["requested_target"] is None
    assert data["requested_from_branch"] is None
    assert data["requested_from_file"] == str(body_path)


# ---------------------------------------------------------------------------
# ancestor walking: nearest beats farther
# ---------------------------------------------------------------------------


def test_claim_plan_nearest_ancestor_wins(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget-rewrite/body.md", "feat/near", "# near\n")
    gateway.put("objectives", "widget-rewrite/body.md", "feat/far", "# far\n")
    obj = _make_obj(
        gateway=gateway,
        branches=("master", "feat/x", "feat/near", "feat/far"),
        ancestors=(("feat/near", "HEAD"), ("feat/far", "HEAD")),
        commit_count_by_range={
            "feat/near..HEAD": 1,
            "feat/far..HEAD": 5,
        },
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "claim-plan", "widget-rewrite", "--format", "json"],
        obj=obj,
    )

    data = json.loads(result.output)["data"]
    assert data["status"] == "plan"
    assert data["plan"]["source"]["branch"] == "feat/near"


def test_claim_plan_tied_ancestors_are_ambiguous(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget-rewrite/body.md", "feat/a", "# a\n")
    gateway.put("objectives", "widget-rewrite/body.md", "feat/b", "# b\n")
    obj = _make_obj(
        gateway=gateway,
        branches=("master", "feat/x", "feat/a", "feat/b"),
        ancestors=(("feat/a", "HEAD"), ("feat/b", "HEAD")),
        commit_count_by_range={
            "feat/a..HEAD": 2,
            "feat/b..HEAD": 2,
        },
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "claim-plan", "widget-rewrite", "--format", "json"],
        obj=obj,
    )

    data = json.loads(result.output)["data"]
    assert data["status"] == "ambiguous"
    amb = data["ambiguity"]
    assert amb["reason"] == "ambiguous_source_branches"
    assert [c["branch"] for c in amb["branch_alternatives"]] == ["feat/a", "feat/b"]
    assert all(c["distance"] == 2 for c in amb["branch_alternatives"])
