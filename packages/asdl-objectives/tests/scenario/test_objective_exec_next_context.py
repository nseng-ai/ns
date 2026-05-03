"""Scenario tests for ``objective exec next-context`` and collisions."""

from __future__ import annotations

import json
import textwrap
from pathlib import Path

import pytest
from click.testing import CliRunner

from brmem.fake import FakeBranchMemoryGateway
from asdl_core.clinkr.context import ClinkrContextObject, build_clinkr_context_object
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.gh.pr_testing import FakePRGateway
from asdl_core.git.testing import FakeGitGateway
from asdl_core.git.types import DetachedHead, GitCommandFailure
from asdl_objectives.context import ObjectiveCliContext
from asdl_objectives.main import build_cli


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


_BODY = textwrap.dedent(
    """\
    # Widget Rewrite

    Status: in progress

    ## Description

    Re-platform the widget pipeline for plugin-based loading.

    ## Completion Criteria

    - [ ] Fallback body criterion
    """
)

_ROADMAP = textwrap.dedent(
    """\
    # Roadmap

    ## Slice 1

    - [x] Define the architecture
    - [ ] Define plugin entry point ABC

    ## Slice 2

    - [ ] Wire CLI command
    """
)

_NOTES = "- The plugin loader must be importable without optional deps.\n"


def _make_obj(
    *,
    gateway: FakeBranchMemoryGateway,
    current_branch: str | DetachedHead | GitCommandFailure = "feat/widget",
    branches: tuple[str, ...] = ("master", "feat/widget"),
    patch_ids_by_range: dict[str, tuple[tuple[str, str | None], ...]] | None = None,
) -> ClinkrContextObject:
    git_gateway = FakeGitGateway(
        current_branch_by_path={Path.cwd(): current_branch},
        branches=branches,
        patch_ids_by_range=patch_ids_by_range,
        trunk_branch="master",
    )
    ctx = ObjectiveCliContext(
        brmem_gateway=gateway,
        git_gateway=git_gateway,
        pr_gateway=FakePRGateway(),
    )
    return build_clinkr_context_object(lambda: ctx)


def _seed_objective(
    branch: str,
    *,
    gateway: FakeBranchMemoryGateway | None = None,
    slug: str = "widget-rewrite",
    body: str = _BODY,
    roadmap: str | None = _ROADMAP,
    notes: str | None = _NOTES,
) -> FakeBranchMemoryGateway:
    brmem_gateway = gateway if gateway is not None else FakeBranchMemoryGateway()
    brmem_gateway.put("objectives", f"{slug}/body.md", branch, body)
    if roadmap is not None:
        brmem_gateway.put("objectives", f"{slug}/roadmap.md", branch, roadmap)
    if notes is not None:
        brmem_gateway.put("objectives", f"{slug}/notes.md", branch, notes)
    return brmem_gateway


def _invoke_json(
    cli_group: ClinkrGroup,
    obj: ClinkrContextObject,
    args: list[str],
) -> dict[str, object]:
    result = CliRunner().invoke(cli_group, [*args, "--format", "json"], obj=obj)
    assert result.output
    return json.loads(result.output)


def test_next_context_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "next-context", "-h"])

    assert result.exit_code == 0
    assert "Usage: objective exec next-context" in result.output


def test_next_collision_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "next-collision", "-h"])

    assert result.exit_code == 0
    assert "Usage: objective exec next-collision" in result.output


def test_next_context_one_objective_on_branch_emits_full_context(
    cli_group: ClinkrGroup,
) -> None:
    gateway = _seed_objective("feat/widget")
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(
        cli_group,
        ["exec", "next-context", "--format", "json"],
        obj=obj,
    )
    payload = json.loads(result.output)

    assert result.exit_code == 0, result.output
    data = payload["data"]
    assert data["current_branch"] == "feat/widget"
    assert data["trunk_branch"] == "master"
    assert data["on_trunk"] is False
    assert data["slug"] == "widget-rewrite"
    assert data["files_present"] == ["body.md", "roadmap.md", "notes.md"]
    assert data["freshness"] == "fresh"
    assert data["freshness_advisory"] is None
    assert data["notes_present"] is True
    assert data["body_content"] == _BODY
    assert data["roadmap_content"] == _ROADMAP
    assert data["notes_content"] == _NOTES
    assert "title" not in data
    assert "suggested_slug" not in data


def test_next_context_no_objective_on_branch_fails(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(gateway=FakeBranchMemoryGateway())

    payload = _invoke_json(cli_group, obj, ["exec", "next-context"])

    assert payload["exit_code"] == 2
    assert payload["error_type"] == "no_objective_on_branch"


def test_next_context_multiple_objectives_without_slug_fails(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    _seed_objective("feat/widget", gateway=gateway, slug="alpha")
    _seed_objective("feat/widget", gateway=gateway, slug="beta")
    obj = _make_obj(gateway=gateway)

    payload = _invoke_json(cli_group, obj, ["exec", "next-context"])

    assert payload["exit_code"] == 2
    assert payload["error_type"] == "ambiguous_objective"
    assert "alpha" in str(payload["message"])
    assert "beta" in str(payload["message"])


def test_next_context_multiple_objectives_with_explicit_slug_resolves(
    cli_group: ClinkrGroup,
) -> None:
    gateway = FakeBranchMemoryGateway()
    _seed_objective("feat/widget", gateway=gateway, slug="alpha")
    _seed_objective("feat/widget", gateway=gateway, slug="beta", body="# Beta\n\nStatus: blocked\n")
    obj = _make_obj(gateway=gateway)

    payload = _invoke_json(cli_group, obj, ["exec", "next-context", "beta"])

    assert payload["exit_code"] == 0
    data = payload["data"]
    assert data["slug"] == "beta"
    assert data["body_content"] == "# Beta\n\nStatus: blocked\n"


def test_next_context_trunk_with_zero_canonicals_fails(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(
        gateway=FakeBranchMemoryGateway(),
        current_branch="master",
        branches=("master",),
    )

    payload = _invoke_json(cli_group, obj, ["exec", "next-context"])

    assert payload["exit_code"] == 2
    assert payload["error_type"] == "no_objective_on_branch"
    assert "No canonical objectives" in str(payload["message"])


def test_next_context_trunk_with_one_canonical_skips_freshness(
    cli_group: ClinkrGroup,
) -> None:
    gateway = _seed_objective("master")
    obj = _make_obj(gateway=gateway, current_branch="master", branches=("master",))

    payload = _invoke_json(cli_group, obj, ["exec", "next-context"])

    assert payload["exit_code"] == 0
    data = payload["data"]
    assert data["on_trunk"] is True
    assert data["freshness"] is None
    assert data["freshness_advisory"] is None


def test_next_context_trunk_with_multiple_canonicals_without_slug_fails(
    cli_group: ClinkrGroup,
) -> None:
    gateway = FakeBranchMemoryGateway()
    _seed_objective("master", gateway=gateway, slug="alpha")
    _seed_objective("master", gateway=gateway, slug="beta")
    obj = _make_obj(gateway=gateway, current_branch="master", branches=("master",))

    payload = _invoke_json(cli_group, obj, ["exec", "next-context"])

    assert payload["exit_code"] == 2
    assert payload["error_type"] == "ambiguous_objective"


def test_next_context_explicit_missing_slug_fails(cli_group: ClinkrGroup) -> None:
    gateway = _seed_objective("feat/widget")
    obj = _make_obj(gateway=gateway)

    payload = _invoke_json(cli_group, obj, ["exec", "next-context", "missing"])

    assert payload["exit_code"] == 2
    assert payload["error_type"] == "no_objective_on_branch"
    assert "missing" in str(payload["message"])


def test_next_context_stale_freshness_populates_advisory(cli_group: ClinkrGroup) -> None:
    gateway = _seed_objective("feat/widget")
    obj = _make_obj(
        gateway=gateway,
        patch_ids_by_range={"master..feat/widget": (("sha-1", "pid-1"),)},
    )

    payload = _invoke_json(cli_group, obj, ["exec", "next-context"])

    assert payload["exit_code"] == 0
    data = payload["data"]
    assert data["freshness"] == "stale"
    assert "objective-update widget-rewrite" in data["freshness_advisory"]


def test_next_context_fresh_snapshot_has_no_advisory(cli_group: ClinkrGroup) -> None:
    gateway = _seed_objective("feat/widget")
    obj = _make_obj(gateway=gateway, patch_ids_by_range={"master..feat/widget": ()})

    payload = _invoke_json(cli_group, obj, ["exec", "next-context"])

    assert payload["exit_code"] == 0
    data = payload["data"]
    assert data["freshness"] == "fresh"
    assert data["freshness_advisory"] is None


def test_next_context_detached_head_fails(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(gateway=FakeBranchMemoryGateway(), current_branch=DetachedHead())

    payload = _invoke_json(cli_group, obj, ["exec", "next-context"])

    assert payload["exit_code"] == 2
    assert payload["error_type"] == "detached_head"


def test_next_collision_reports_branch_collision(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(gateway=FakeBranchMemoryGateway(), branches=("master", "candidate"))

    payload = _invoke_json(cli_group, obj, ["exec", "next-collision", "candidate"])

    assert payload["exit_code"] == 0
    data = payload["data"]
    assert data["candidate_slug"] == "candidate"
    assert data["branch_exists"] is True
    assert data["canonical_exists"] is False
    assert data["clear"] is False


def test_next_collision_reports_canonical_collision(cli_group: ClinkrGroup) -> None:
    gateway = _seed_objective("master", slug="candidate")
    obj = _make_obj(gateway=gateway, branches=("master",))

    payload = _invoke_json(cli_group, obj, ["exec", "next-collision", "candidate"])

    assert payload["exit_code"] == 0
    data = payload["data"]
    assert data["branch_exists"] is False
    assert data["canonical_exists"] is True
    assert data["clear"] is False


def test_next_collision_reports_clear(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(gateway=FakeBranchMemoryGateway(), branches=("master",))

    payload = _invoke_json(cli_group, obj, ["exec", "next-collision", "candidate"])

    assert payload["exit_code"] == 0
    data = payload["data"]
    assert data["branch_exists"] is False
    assert data["canonical_exists"] is False
    assert data["clear"] is True
    assert data["warnings"] == []
