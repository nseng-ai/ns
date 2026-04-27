"""Scenario tests for ``objective exec digest``.

The skill `objective-digest` consumes this command's JSON output to
build the locked Markdown digest. These tests exercise the contract end
to end through `build_cli()` with the standard fake gateways used across
objective scenario tests.
"""

from __future__ import annotations

import json
import textwrap
from pathlib import Path

import pytest
from click.testing import CliRunner

from brmem.fake import FakeBranchMemoryGateway
from twerk_core.clinkr.context import ClinkrContextObject, build_clinkr_context_object
from twerk_core.clinkr.group import ClinkrGroup
from twerk_core.gh.pr_gateway import PRGateway
from twerk_core.gh.pr_testing import FakePRGateway
from twerk_core.gh.types import PRLookupError, PRSummary
from twerk_core.git.testing import FakeGitGateway
from twerk_core.git.types import DetachedHead
from twerk_objectives.context import ObjectiveCliContext
from twerk_objectives.main import build_cli


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def _pr(
    *,
    number: int,
    title: str,
    url: str,
    state: str,
    head: str,
    base: str = "master",
) -> PRSummary:
    return PRSummary(
        number=number,
        title=title,
        url=url,
        head_ref_name=head,
        base_ref_name=base,
        state=state,  # type: ignore[arg-type]
    )


def _make_obj(
    *,
    gateway: FakeBranchMemoryGateway,
    branch: str | DetachedHead | None = "feat/x",
    live_branches: tuple[str, ...] = (),
    pr_gateway: PRGateway | None = None,
    file_last_touched: dict[tuple[str, str], str] | None = None,
    branch_head_iso: dict[str, str] | None = None,
) -> ClinkrContextObject:
    if branch is None:
        git_gateway = FakeGitGateway(
            branches=live_branches,
            file_last_touched_by_ref_path=file_last_touched,
            branch_head_iso_by_branch=branch_head_iso,
        )
    else:
        git_gateway = FakeGitGateway(
            current_branch_by_path={Path.cwd(): branch},
            branches=live_branches,
            file_last_touched_by_ref_path=file_last_touched,
            branch_head_iso_by_branch=branch_head_iso,
        )
    ctx = ObjectiveCliContext(
        brmem_gateway=gateway,
        git_gateway=git_gateway,
        pr_gateway=pr_gateway if pr_gateway is not None else FakePRGateway(),
    )
    return build_clinkr_context_object(lambda: ctx)


# ---------------------------------------------------------------------------
# fixtures: documents
# ---------------------------------------------------------------------------


_BODY_MASTER = textwrap.dedent(
    """\
    # Widget Rewrite

    Status: in progress

    ## Description

    Re-platform the widget pipeline so plugins can ship without a core
    release.

    ## Out of scope

    Migrating the legacy widget cache; that's a separate workstream.

    ## Completion Criteria

    - [ ] Plugins can register without core changes
    - [ ] Old widget cache deprecated
    - [ ] Docs updated
    """
)

_ROADMAP_MASTER = textwrap.dedent(
    """\
    # Roadmap

    ## Slice 1 — Plugin contract

    - [ ] Define plugin entry point ABC
    - [ ] Wire plugin loader

    ## Slice 2 — Migrate built-in widgets

    - [ ] Port widget A
    - [ ] Port widget B

    ## Slice 3 — Drop legacy registry

    - [ ] Delete legacy registry module
    """
)

_ROADMAP_GROUNDWORK_DONE = textwrap.dedent(
    """\
    # Roadmap

    ## Slice 1 — Plugin contract

    - [x] Define plugin entry point ABC
    - [x] Wire plugin loader

    ## Slice 2 — Migrate built-in widgets

    - [ ] Port widget A
    - [ ] Port widget B

    ## Slice 3 — Drop legacy registry

    - [ ] Delete legacy registry module
    """
)

_ROADMAP_LAYER1 = textwrap.dedent(
    """\
    # Roadmap

    ## Slice 1 — Plugin contract

    - [x] Define plugin entry point ABC
    - [x] Wire plugin loader

    ## Slice 2 — Migrate built-in widgets

    - [x] Port widget A
    - [ ] Port widget B

    ## Slice 3 — Drop legacy registry

    - [ ] Delete legacy registry module
    """
)


def _seed_sole_objective_widget_rewrite(
    *,
    extra_branches: tuple[str, ...] = (),
) -> FakeBranchMemoryGateway:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget-rewrite/body.md", "master", _BODY_MASTER)
    gateway.put("objectives", "widget-rewrite/roadmap.md", "master", _ROADMAP_MASTER)
    gateway.put("objectives", "widget-rewrite/body.md", "widget-rewrite-groundwork", _BODY_MASTER)
    gateway.put(
        "objectives",
        "widget-rewrite/roadmap.md",
        "widget-rewrite-groundwork",
        _ROADMAP_GROUNDWORK_DONE,
    )
    gateway.put("objectives", "widget-rewrite/body.md", "widget-rewrite-layer-1", _BODY_MASTER)
    gateway.put(
        "objectives",
        "widget-rewrite/roadmap.md",
        "widget-rewrite-layer-1",
        _ROADMAP_LAYER1,
    )
    gateway.put(
        "objectives",
        "widget-rewrite/notes.md",
        "widget-rewrite-layer-1",
        "- The plugin loader must be importable without optional deps.\n",
    )
    for branch in extra_branches:
        gateway.put("objectives", "widget-rewrite/body.md", branch, _BODY_MASTER)
        gateway.put("objectives", "widget-rewrite/roadmap.md", branch, _ROADMAP_MASTER)
    return gateway


# ---------------------------------------------------------------------------
# help / schema
# ---------------------------------------------------------------------------


def test_digest_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "digest", "-h"])

    assert result.exit_code == 0
    assert "Usage: objective exec digest" in result.output
    assert "--no-drift" in result.output


def test_digest_schema_flag_is_eager(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "digest", "--schema"])

    assert result.exit_code == 0, result.output
    payload = json.loads(result.stdout)
    assert set(payload) == {"input_schema", "output_schema"}


# ---------------------------------------------------------------------------
# happy path
# ---------------------------------------------------------------------------


def test_digest_happy_path_emits_raw_facts(cli_group: ClinkrGroup) -> None:
    gateway = _seed_sole_objective_widget_rewrite()
    file_last_touched = {
        (
            "refs/brmem/ns/objectives/master",
            "widget-rewrite/body.md",
        ): "2026-04-26T06:52:00+00:00",
        (
            "refs/brmem/ns/objectives/widget-rewrite-groundwork",
            "widget-rewrite/body.md",
        ): "2026-04-26T08:10:00+00:00",
        (
            "refs/brmem/ns/objectives/widget-rewrite-layer-1",
            "widget-rewrite/body.md",
        ): "2026-04-26T20:54:00+00:00",
    }
    obj = _make_obj(
        gateway=gateway,
        live_branches=("master", "widget-rewrite-groundwork", "widget-rewrite-layer-1"),
        pr_gateway=FakePRGateway(
            prs_by_branch={
                "widget-rewrite-groundwork": _pr(
                    number=812,
                    title="Plugin contract scaffolding",
                    url="https://example.com/pull/812",
                    state="MERGED",
                    head="widget-rewrite-groundwork",
                ),
                "widget-rewrite-layer-1": _pr(
                    number=833,
                    title="Migrate widget A to plugin",
                    url="https://example.com/pull/833",
                    state="OPEN",
                    head="widget-rewrite-layer-1",
                ),
            },
        ),
        file_last_touched=file_last_touched,
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "digest", "widget-rewrite", "--format", "json"],
        obj=obj,
    )
    payload = json.loads(result.output)

    assert result.exit_code == 0, result.output
    data = payload["data"]
    assert data["slug"] == "widget-rewrite"

    master = data["master"]
    assert "Re-platform the widget pipeline" in master["body_md"]
    assert "## Slice 1 — Plugin contract" in master["roadmap_md"]
    assert master["notes_md"] == ""
    assert master["body_last_touched"] == "2026-04-26T06:52:00+00:00"

    branches = {b["branch"]: b for b in data["branches"]}
    assert set(branches) == {"widget-rewrite-groundwork", "widget-rewrite-layer-1"}

    layer_1 = branches["widget-rewrite-layer-1"]
    assert layer_1["deleted"] is False
    assert "## Slice 2 — Migrate built-in widgets" in layer_1["roadmap_md"]
    assert "- [x] Port widget A" in layer_1["roadmap_md"]
    assert "plugin loader" in layer_1["notes_md"]
    assert layer_1["body_last_touched"] == "2026-04-26T20:54:00+00:00"
    assert layer_1["pr_number"] == 833
    assert layer_1["pr_state"] == "OPEN"
    assert layer_1["pr_title"] == "Migrate widget A to plugin"
    assert layer_1["pr_url"] == "https://example.com/pull/833"
    assert layer_1["pr_error"] is None
    # No branch_head_iso seeded → memj_state defaults to "fresh".
    assert layer_1["memj_state"] == "fresh"
    assert layer_1["branch_head_iso"] is None

    groundwork = branches["widget-rewrite-groundwork"]
    assert groundwork["pr_state"] == "MERGED"
    assert groundwork["notes_md"] == ""

    assert data["unclaimed_pr_candidates"] == []
    assert data["warnings"] == []


# ---------------------------------------------------------------------------
# auto-resolution
# ---------------------------------------------------------------------------


def test_digest_auto_resolves_sole_objective_on_current_branch(
    cli_group: ClinkrGroup,
) -> None:
    gateway = _seed_sole_objective_widget_rewrite()
    obj = _make_obj(
        gateway=gateway,
        branch="widget-rewrite-layer-1",
        live_branches=("master", "widget-rewrite-groundwork", "widget-rewrite-layer-1"),
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "digest", "--format", "json"],
        obj=obj,
    )
    payload = json.loads(result.output)

    assert result.exit_code == 0, result.output
    assert payload["data"]["slug"] == "widget-rewrite"


def test_digest_no_objective_on_branch_fails(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(
        gateway=FakeBranchMemoryGateway(),
        branch="feat/blank",
        live_branches=("feat/blank",),
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "digest", "--format", "json"],
        obj=obj,
    )
    payload = json.loads(result.output)

    assert result.exit_code == 2
    assert payload["error_type"] == "no_objective_on_branch"


# ---------------------------------------------------------------------------
# slug not seeded
# ---------------------------------------------------------------------------


def test_digest_slug_not_seeded_anywhere_fails(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(
        gateway=_seed_sole_objective_widget_rewrite(),
        branch="master",
        live_branches=("master",),
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "digest", "does-not-exist", "--format", "json"],
        obj=obj,
    )
    payload = json.loads(result.output)

    assert result.exit_code == 2
    assert payload["error_type"] == "slug_not_seeded"
    assert "does-not-exist" in payload["message"]


def test_digest_slug_branch_only_no_master_seed_fails(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "branch-only/body.md", "feat/x", _BODY_MASTER)
    obj = _make_obj(
        gateway=gateway,
        branch="feat/x",
        live_branches=("feat/x",),
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "digest", "branch-only", "--format", "json"],
        obj=obj,
    )
    payload = json.loads(result.output)

    assert result.exit_code == 2
    assert payload["error_type"] == "slug_not_seeded"
    assert "no master seed" in payload["message"]


# ---------------------------------------------------------------------------
# no live branches
# ---------------------------------------------------------------------------


def test_digest_seed_only_no_branches(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget-rewrite/body.md", "master", _BODY_MASTER)
    gateway.put("objectives", "widget-rewrite/roadmap.md", "master", _ROADMAP_MASTER)
    obj = _make_obj(
        gateway=gateway,
        branch="master",
        live_branches=("master",),
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "digest", "widget-rewrite", "--format", "json"],
        obj=obj,
    )
    payload = json.loads(result.output)

    assert result.exit_code == 0, result.output
    data = payload["data"]
    assert data["branches"] == []
    assert "Re-platform the widget pipeline" in data["master"]["body_md"]


# ---------------------------------------------------------------------------
# missing roadmap on master
# ---------------------------------------------------------------------------


def test_digest_missing_roadmap_on_master_returns_empty_blob(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "no-roadmap/body.md", "master", _BODY_MASTER)
    # No roadmap.md on master.
    gateway.put("objectives", "no-roadmap/body.md", "feat/x", _BODY_MASTER)
    obj = _make_obj(
        gateway=gateway,
        branch="feat/x",
        live_branches=("master", "feat/x"),
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "digest", "no-roadmap", "--format", "json"],
        obj=obj,
    )
    payload = json.loads(result.output)

    assert result.exit_code == 0, result.output
    data = payload["data"]
    # The skill decides what to render when roadmap is missing — the CLI
    # just hands over the empty blob.
    assert data["master"]["roadmap_md"] == ""
    assert data["warnings"] == []


# ---------------------------------------------------------------------------
# branch deleted (merged & gone)
# ---------------------------------------------------------------------------


def test_digest_marks_deleted_branch(cli_group: ClinkrGroup) -> None:
    gateway = _seed_sole_objective_widget_rewrite()
    obj = _make_obj(
        gateway=gateway,
        branch="master",
        live_branches=("master", "widget-rewrite-layer-1"),  # groundwork is gone
        pr_gateway=FakePRGateway(
            prs_by_branch={
                "widget-rewrite-groundwork": _pr(
                    number=812,
                    title="Plugin contract scaffolding",
                    url="https://example.com/pull/812",
                    state="MERGED",
                    head="widget-rewrite-groundwork",
                ),
            },
        ),
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "digest", "widget-rewrite", "--format", "json"],
        obj=obj,
    )
    payload = json.loads(result.output)

    assert result.exit_code == 0, result.output
    by_branch = {b["branch"]: b for b in payload["data"]["branches"]}
    assert by_branch["widget-rewrite-groundwork"]["deleted"] is True
    assert by_branch["widget-rewrite-layer-1"]["deleted"] is False


# ---------------------------------------------------------------------------
# unclaimed PR candidates (no markdown semantics)
# ---------------------------------------------------------------------------


def test_digest_lists_open_prs_outside_snapshot_tree(cli_group: ClinkrGroup) -> None:
    gateway = _seed_sole_objective_widget_rewrite()
    drift_pr = _pr(
        number=999,
        title="WIP: drop legacy registry tests",
        url="https://example.com/pull/999",
        state="OPEN",
        head="someone-else/cleanup-legacy",
    )
    obj = _make_obj(
        gateway=gateway,
        branch="master",
        live_branches=("master", "widget-rewrite-layer-1"),
        pr_gateway=FakePRGateway(prs=(drift_pr,)),
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "digest", "widget-rewrite", "--format", "json"],
        obj=obj,
    )
    payload = json.loads(result.output)

    assert result.exit_code == 0, result.output
    candidates = payload["data"]["unclaimed_pr_candidates"]
    assert candidates == [
        {
            "number": 999,
            "title": "WIP: drop legacy registry tests",
            "url": "https://example.com/pull/999",
            "head_ref": "someone-else/cleanup-legacy",
        }
    ]
    assert payload["data"]["warnings"] == []


def test_digest_excludes_open_prs_already_in_snapshot_tree(cli_group: ClinkrGroup) -> None:
    gateway = _seed_sole_objective_widget_rewrite()
    attached_pr = _pr(
        number=833,
        title="Migrate widget A to plugin",
        url="https://example.com/pull/833",
        state="OPEN",
        head="widget-rewrite-layer-1",
    )
    obj = _make_obj(
        gateway=gateway,
        branch="master",
        live_branches=("master", "widget-rewrite-groundwork", "widget-rewrite-layer-1"),
        pr_gateway=FakePRGateway(prs=(attached_pr,)),
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "digest", "widget-rewrite", "--format", "json"],
        obj=obj,
    )
    payload = json.loads(result.output)

    assert result.exit_code == 0, result.output
    assert payload["data"]["unclaimed_pr_candidates"] == []


def test_digest_no_drift_flag_skips_unclaimed_lookup(cli_group: ClinkrGroup) -> None:
    gateway = _seed_sole_objective_widget_rewrite()
    drift_pr = _pr(
        number=999,
        title="legacy registry cleanup",
        url="https://example.com/pull/999",
        state="OPEN",
        head="other/cleanup",
    )
    obj = _make_obj(
        gateway=gateway,
        branch="master",
        live_branches=("master", "widget-rewrite-layer-1"),
        pr_gateway=FakePRGateway(prs=(drift_pr,)),
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "digest", "widget-rewrite", "--no-drift", "--format", "json"],
        obj=obj,
    )
    payload = json.loads(result.output)

    assert result.exit_code == 0, result.output
    assert payload["data"]["unclaimed_pr_candidates"] == []
    assert payload["data"]["warnings"] == []


def test_digest_drift_failure_emits_warning_not_error(cli_group: ClinkrGroup) -> None:
    gateway = _seed_sole_objective_widget_rewrite()
    failing_pr_gateway = FakePRGateway(
        search_failure=PRLookupError(stderr="auth failed", returncode=4),
    )
    obj = _make_obj(
        gateway=gateway,
        branch="master",
        live_branches=("master", "widget-rewrite-layer-1"),
        pr_gateway=failing_pr_gateway,
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "digest", "widget-rewrite", "--format", "json"],
        obj=obj,
    )
    payload = json.loads(result.output)

    assert result.exit_code == 0, result.output
    warnings = payload["data"]["warnings"]
    assert any(w.startswith("drift_check_skipped:") for w in warnings)
    assert payload["data"]["unclaimed_pr_candidates"] == []


# ---------------------------------------------------------------------------
# memj_state — fresh / stale / merged
# ---------------------------------------------------------------------------


def test_digest_memj_state_fresh_when_snapshot_at_or_after_branch_head(
    cli_group: ClinkrGroup,
) -> None:
    gateway = _seed_sole_objective_widget_rewrite()
    file_last_touched = {
        (
            "refs/brmem/ns/objectives/widget-rewrite-layer-1",
            "widget-rewrite/body.md",
        ): "2026-04-26T20:54:00+00:00",
    }
    obj = _make_obj(
        gateway=gateway,
        live_branches=("master", "widget-rewrite-groundwork", "widget-rewrite-layer-1"),
        file_last_touched=file_last_touched,
        branch_head_iso={"widget-rewrite-layer-1": "2026-04-26T20:54:00+00:00"},
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "digest", "widget-rewrite", "--format", "json"],
        obj=obj,
    )
    payload = json.loads(result.output)

    assert result.exit_code == 0, result.output
    by_branch = {b["branch"]: b for b in payload["data"]["branches"]}
    assert by_branch["widget-rewrite-layer-1"]["memj_state"] == "fresh"
    assert by_branch["widget-rewrite-layer-1"]["branch_head_iso"] == ("2026-04-26T20:54:00+00:00")


def test_digest_memj_state_stale_when_branch_head_newer_than_snapshot(
    cli_group: ClinkrGroup,
) -> None:
    gateway = _seed_sole_objective_widget_rewrite()
    file_last_touched = {
        (
            "refs/brmem/ns/objectives/widget-rewrite-layer-1",
            "widget-rewrite/body.md",
        ): "2026-04-26T20:54:00+00:00",
    }
    obj = _make_obj(
        gateway=gateway,
        live_branches=("master", "widget-rewrite-groundwork", "widget-rewrite-layer-1"),
        file_last_touched=file_last_touched,
        branch_head_iso={"widget-rewrite-layer-1": "2026-04-27T08:30:00+00:00"},
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "digest", "widget-rewrite", "--format", "json"],
        obj=obj,
    )
    payload = json.loads(result.output)

    assert result.exit_code == 0, result.output
    by_branch = {b["branch"]: b for b in payload["data"]["branches"]}
    assert by_branch["widget-rewrite-layer-1"]["memj_state"] == "stale"


def test_digest_memj_state_fresh_for_deleted_branch_regardless_of_head(
    cli_group: ClinkrGroup,
) -> None:
    """A deleted branch's snapshot is fresh by definition — its history is frozen."""

    gateway = _seed_sole_objective_widget_rewrite()
    obj = _make_obj(
        gateway=gateway,
        branch="master",
        live_branches=("master", "widget-rewrite-layer-1"),  # groundwork is gone
        pr_gateway=FakePRGateway(
            prs_by_branch={
                "widget-rewrite-groundwork": _pr(
                    number=812,
                    title="Plugin contract scaffolding",
                    url="https://example.com/pull/812",
                    state="MERGED",
                    head="widget-rewrite-groundwork",
                ),
            },
        ),
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "digest", "widget-rewrite", "--format", "json"],
        obj=obj,
    )
    payload = json.loads(result.output)

    assert result.exit_code == 0, result.output
    by_branch = {b["branch"]: b for b in payload["data"]["branches"]}
    assert by_branch["widget-rewrite-groundwork"]["deleted"] is True
    assert by_branch["widget-rewrite-groundwork"]["memj_state"] == "fresh"
    assert by_branch["widget-rewrite-groundwork"]["branch_head_iso"] is None
