"""Scenario tests for ``objective exec create-precheck``.

The skill ``objective-create`` runs this command before drafting prose so it
does not waste effort on a slug that is taken or malformed. These tests
exercise the contract end to end via ``build_cli()`` with the standard fake
gateways used across objective scenario tests, focusing on the structured
envelope shape (``status="ok"`` / ``status="error"``) and the hard
preconditions that must surface as :class:`ClinkrExit.failure`.
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
from twerk_objectives.exec.create_precheck import PRECHECK_SCHEMA
from twerk_objectives.main import build_cli


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def _make_obj(
    *,
    gateway: FakeBranchMemoryGateway,
    current_branch: str | DetachedHead = "feat/x",
    branches: tuple[str, ...] = ("master", "feat/x"),
    git_common_dir: Path | None = Path("/repo/.git"),
) -> ClinkrContextObject:
    git_gateway = FakeGitGateway(
        current_branch_by_path={Path.cwd(): current_branch},
        branches=branches,
        trunk_branch="master",
        git_common_dir=git_common_dir,
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


def test_create_precheck_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "create-precheck", "-h"])

    assert result.exit_code == 0
    assert "Usage: objective exec create-precheck" in result.output


def test_create_precheck_schema_flag_is_eager(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "create-precheck", "--schema"])

    assert result.exit_code == 0, result.output
    payload = json.loads(result.stdout)
    assert set(payload) == {"input_schema", "output_schema"}


# ---------------------------------------------------------------------------
# happy path
# ---------------------------------------------------------------------------


def test_create_precheck_ok_for_fresh_slug(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(gateway=FakeBranchMemoryGateway())

    result = CliRunner().invoke(
        cli_group,
        ["exec", "create-precheck", "widget-rewrite", "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["schema"] == PRECHECK_SCHEMA
    assert data["canonical_branch"] == "master"
    assert data["requested_slug"] == "widget-rewrite"
    assert data["status"] == "ok"
    assert data["slug"] == "widget-rewrite"
    assert data["error"] is None


def test_create_precheck_ok_when_other_slugs_exist(cli_group: ClinkrGroup) -> None:
    """A different slug on master is not a collision."""
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "alpha/body.md", "master", "# alpha\n")
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(
        cli_group,
        ["exec", "create-precheck", "beta", "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["status"] == "ok"
    assert data["slug"] == "beta"


# ---------------------------------------------------------------------------
# slug collision -> structured error
# ---------------------------------------------------------------------------


def test_create_precheck_slug_collision(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget-rewrite/body.md", "master", "# canonical\n")
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(
        cli_group,
        ["exec", "create-precheck", "widget-rewrite", "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["status"] == "error"
    err = data["error"]
    assert err["reason"] == "slug_collision"
    assert "widget-rewrite" in err["message"]
    assert "objective-update" in err["message"]
    assert data["slug"] is None


def test_create_precheck_slug_collision_via_roadmap_only(cli_group: ClinkrGroup) -> None:
    """A slug exists on master if any key under <slug>/ is present."""
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget-rewrite/roadmap.md", "master", "# roadmap\n")
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(
        cli_group,
        ["exec", "create-precheck", "widget-rewrite", "--format", "json"],
        obj=obj,
    )

    data = json.loads(result.output)["data"]
    assert data["status"] == "error"
    assert data["error"]["reason"] == "slug_collision"


def test_create_precheck_branch_only_slug_does_not_collide(cli_group: ClinkrGroup) -> None:
    """A slug that only exists on a feature branch is not a canonical collision."""
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget-rewrite/body.md", "feat/x", "# branch\n")
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(
        cli_group,
        ["exec", "create-precheck", "widget-rewrite", "--format", "json"],
        obj=obj,
    )

    data = json.loads(result.output)["data"]
    assert data["status"] == "ok"


# ---------------------------------------------------------------------------
# slug-format validation -> structured error
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "bad_slug,expected_reason_substring",
    [
        ("Widget-Rewrite", "lowercase"),  # uppercase
        ("widget_rewrite", "lowercase"),  # underscore (not lowercase ASCII letter/digit/hyphen)
        ("widget rewrite", "lowercase"),  # space
        ("widget/rewrite", "/"),  # slash
        ("foo/body.md", "/"),  # legacy key form
        ("body.md", "lowercase"),  # `.` disallowed by lowercase-ASCII rule
        ("objective-foo", "objective-"),  # forbidden prefix
        ("-leading-hyphen", "-"),  # leading hyphen
        ("trailing-hyphen-", "-"),  # trailing hyphen
        ("double--hyphen", "consecutive"),  # consecutive hyphens
        ("a" * 51, "50"),  # too long
        ("", "non-empty"),  # empty
    ],
)
def test_create_precheck_invalid_slug_format(
    cli_group: ClinkrGroup, bad_slug: str, expected_reason_substring: str
) -> None:
    obj = _make_obj(gateway=FakeBranchMemoryGateway())

    result = CliRunner().invoke(
        cli_group,
        # ``--`` so click treats hyphen-leading slugs as positional, not as options.
        ["exec", "create-precheck", "--format", "json", "--", bad_slug],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["status"] == "error"
    err = data["error"]
    assert err["reason"] == "invalid_slug_format"
    assert expected_reason_substring.lower() in err["message"].lower()


def test_create_precheck_slug_at_max_length_is_ok(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(gateway=FakeBranchMemoryGateway())
    slug = "a" * 50

    result = CliRunner().invoke(
        cli_group,
        ["exec", "create-precheck", slug, "--format", "json"],
        obj=obj,
    )

    data = json.loads(result.output)["data"]
    assert data["status"] == "ok"
    assert data["slug"] == slug


# ---------------------------------------------------------------------------
# hard preconditions
# ---------------------------------------------------------------------------


def test_create_precheck_detached_head_fails_hard(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(
        gateway=FakeBranchMemoryGateway(),
        current_branch=DetachedHead(),
        branches=("master",),
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "create-precheck", "widget-rewrite", "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 2
    payload = json.loads(result.output)
    assert payload["error_type"] == "detached_head"


def test_create_precheck_not_in_repo_fails_hard(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(
        gateway=FakeBranchMemoryGateway(),
        git_common_dir=None,
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "create-precheck", "widget-rewrite", "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 2
    payload = json.loads(result.output)
    assert payload["error_type"] == "not_in_repo"


# ---------------------------------------------------------------------------
# deterministic JSON shape
# ---------------------------------------------------------------------------


def test_create_precheck_envelope_shape_is_deterministic(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(gateway=FakeBranchMemoryGateway())

    result = CliRunner().invoke(
        cli_group,
        ["exec", "create-precheck", "widget-rewrite", "--format", "json"],
        obj=obj,
    )

    data = json.loads(result.output)["data"]
    assert set(data.keys()) == {
        "schema",
        "canonical_branch",
        "requested_slug",
        "status",
        "slug",
        "error",
    }
    assert data["schema"] == PRECHECK_SCHEMA
    assert data["canonical_branch"] == "master"
