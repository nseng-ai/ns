"""Scenario tests for ``memjective exec digest``.

The skill `dev-memjective-digest` consumes this command's JSON output to
build the locked Markdown digest. These tests exercise the contract end
to end through `build_cli()` with the standard fake gateways used across
memjective scenario tests.
"""

from __future__ import annotations

import json
import textwrap
from pathlib import Path

import pytest
from click.testing import CliRunner

from twerk_core.brmem.fake import FakeBranchMemoryGateway
from twerk_core.clinkr.context import ClinkrContextObject, build_clinkr_context_object
from twerk_core.clinkr.group import ClinkrGroup
from twerk_core.gh.pr_gateway import PRGateway
from twerk_core.gh.pr_testing import FakePRGateway
from twerk_core.gh.types import PRLookupError, PRSummary
from twerk_core.git.testing import FakeGitGateway
from twerk_core.git.types import DetachedHead
from twerk_core.memjective.context import MemjectiveCliContext
from twerk_core.memjective.main import build_cli


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
    ctx = MemjectiveCliContext(
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


def _seed_widget_rewrite(
    *,
    extra_branches: tuple[str, ...] = (),
) -> FakeBranchMemoryGateway:
    gateway = FakeBranchMemoryGateway()
    gateway.put("memjectives", "widget-rewrite/body.md", "master", _BODY_MASTER)
    gateway.put("memjectives", "widget-rewrite/roadmap.md", "master", _ROADMAP_MASTER)
    gateway.put("memjectives", "widget-rewrite/body.md", "widget-rewrite-groundwork", _BODY_MASTER)
    gateway.put(
        "memjectives",
        "widget-rewrite/roadmap.md",
        "widget-rewrite-groundwork",
        _ROADMAP_GROUNDWORK_DONE,
    )
    gateway.put("memjectives", "widget-rewrite/body.md", "widget-rewrite-layer-1", _BODY_MASTER)
    gateway.put(
        "memjectives",
        "widget-rewrite/roadmap.md",
        "widget-rewrite-layer-1",
        _ROADMAP_LAYER1,
    )
    gateway.put(
        "memjectives",
        "widget-rewrite/notes.md",
        "widget-rewrite-layer-1",
        "- The plugin loader must be importable without optional deps.\n",
    )
    for branch in extra_branches:
        gateway.put("memjectives", "widget-rewrite/body.md", branch, _BODY_MASTER)
        gateway.put("memjectives", "widget-rewrite/roadmap.md", branch, _ROADMAP_MASTER)
    return gateway


# ---------------------------------------------------------------------------
# help / schema
# ---------------------------------------------------------------------------


def test_digest_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "digest", "-h"])

    assert result.exit_code == 0
    assert "Usage: memjective exec digest" in result.output
    assert "--no-drift" in result.output


def test_digest_schema_flag_is_eager(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "digest", "--schema"])

    assert result.exit_code == 0, result.output
    payload = json.loads(result.stdout)
    assert set(payload) == {"input_schema", "output_schema"}


# ---------------------------------------------------------------------------
# happy path
# ---------------------------------------------------------------------------


def test_digest_happy_path_emits_full_contract(cli_group: ClinkrGroup) -> None:
    gateway = _seed_widget_rewrite()
    file_last_touched = {
        (
            "refs/brmem/ns/memjectives/master",
            "widget-rewrite/body.md",
        ): "2026-04-26T06:52:00+00:00",
        (
            "refs/brmem/ns/memjectives/widget-rewrite-groundwork",
            "widget-rewrite/body.md",
        ): "2026-04-26T08:10:00+00:00",
        (
            "refs/brmem/ns/memjectives/widget-rewrite-layer-1",
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

    metadata = data["metadata"]
    assert metadata["status_line"] == "in progress · 1 PRs open, 1 merged"
    # Most-progressed (layer-1) has slice 1 fully checked; master has 0.
    assert metadata["roadmap_line"] == "1 / 3 slices checked on branches · 0 / 3 on master"
    assert metadata["completion_criteria_line"] == "0 / 3 met on branches · 0 / 3 on master"
    assert "widget-rewrite-layer-1" in metadata["live_branches_line"]
    assert "2026-04-26T20:54:00+00:00" in metadata["live_branches_line"]
    assert "2026-04-26T06:52:00+00:00" in metadata["master_canonical_line"]
    assert "reconcile pending — 1 merged PRs not yet folded in" in metadata["master_canonical_line"]

    thesis = data["thesis_inputs"]
    assert "Re-platform the widget pipeline" in thesis["description_md"]
    assert "legacy widget cache" in thesis["out_of_scope_md"]

    slices = data["slices"]
    assert [s["num"] for s in slices] == [1, 2, 3]
    assert [s["title"] for s in slices] == [
        "Plugin contract",
        "Migrate built-in widgets",
        "Drop legacy registry",
    ]
    assert slices[0]["checked_on_master"] is False
    assert slices[0]["checked_on_most_progressed"] is True
    assert slices[1]["checked_on_most_progressed"] is False
    assert slices[0]["checked_by_branch"] == {
        "widget-rewrite-groundwork": True,
        "widget-rewrite-layer-1": True,
    }

    tree = data["tree"]
    assert {entry["branch"] for entry in tree} == {
        "widget-rewrite-groundwork",
        "widget-rewrite-layer-1",
    }
    by_branch = {entry["branch"]: entry for entry in tree}
    assert by_branch["widget-rewrite-layer-1"]["pr_number"] == 833
    assert by_branch["widget-rewrite-layer-1"]["pr_state"] == "OPEN"
    assert by_branch["widget-rewrite-layer-1"]["deleted"] is False
    assert by_branch["widget-rewrite-groundwork"]["pr_state"] == "MERGED"
    # No branch_head_iso seeded on the FakeGitGateway → memj_state defaults
    # to "fresh" (insufficient info to mark stale).
    assert by_branch["widget-rewrite-layer-1"]["memj_state"] == "fresh"
    assert by_branch["widget-rewrite-layer-1"]["branch_head_iso"] is None

    notes = data["findings_inputs"]["notes_by_branch"]
    assert "widget-rewrite-layer-1" in notes
    assert "plugin loader" in notes["widget-rewrite-layer-1"]

    # No drift configured on the FakePRGateway → no warnings; drift no
    # longer appears as a top-level field.
    assert "drift_open_prs" not in data
    assert data["warnings"] == []


# ---------------------------------------------------------------------------
# auto-resolution
# ---------------------------------------------------------------------------


def test_digest_auto_resolves_sole_memjective_on_current_branch(
    cli_group: ClinkrGroup,
) -> None:
    gateway = _seed_widget_rewrite()
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


def test_digest_no_memjective_on_branch_fails(cli_group: ClinkrGroup) -> None:
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
    assert payload["error_type"] == "no_memjective_on_branch"


# ---------------------------------------------------------------------------
# slug not seeded
# ---------------------------------------------------------------------------


def test_digest_slug_not_seeded_anywhere_fails(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(
        gateway=_seed_widget_rewrite(),
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
    gateway.put("memjectives", "branch-only/body.md", "feat/x", _BODY_MASTER)
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
    gateway.put("memjectives", "widget-rewrite/body.md", "master", _BODY_MASTER)
    gateway.put("memjectives", "widget-rewrite/roadmap.md", "master", _ROADMAP_MASTER)
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
    assert data["tree"] == []
    assert "0 active" in data["metadata"]["live_branches_line"]
    assert data["metadata"]["roadmap_line"] == (
        "0 / 3 slices checked on branches · 0 / 3 on master"
    )


# ---------------------------------------------------------------------------
# missing roadmap section on master
# ---------------------------------------------------------------------------


def test_digest_missing_roadmap_warns(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("memjectives", "no-roadmap/body.md", "master", _BODY_MASTER)
    # No roadmap.md on master.
    gateway.put("memjectives", "no-roadmap/body.md", "feat/x", _BODY_MASTER)
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
    assert data["slices"] == []
    assert any(w.startswith("roadmap_missing_on_master") for w in data["warnings"])


# ---------------------------------------------------------------------------
# branch deleted (merged & gone)
# ---------------------------------------------------------------------------


def test_digest_marks_deleted_branch(cli_group: ClinkrGroup) -> None:
    gateway = _seed_widget_rewrite()
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
    by_branch = {e["branch"]: e for e in payload["data"]["tree"]}
    assert by_branch["widget-rewrite-groundwork"]["deleted"] is True
    assert by_branch["widget-rewrite-layer-1"]["deleted"] is False
    # +1 merged & deleted should appear in the live_branches_line.
    assert "(+1 merged & deleted)" in payload["data"]["metadata"]["live_branches_line"]


# ---------------------------------------------------------------------------
# drift detection
# ---------------------------------------------------------------------------


def test_digest_drift_detection_emits_unclaimed_pr_warning(
    cli_group: ClinkrGroup,
) -> None:
    gateway = _seed_widget_rewrite()
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
        pr_gateway=FakePRGateway(open_prs=(drift_pr,)),
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "digest", "widget-rewrite", "--format", "json"],
        obj=obj,
    )
    payload = json.loads(result.output)

    assert result.exit_code == 0, result.output
    assert "drift_open_prs" not in payload["data"]
    warnings = payload["data"]["warnings"]
    assert any(
        w.startswith("unclaimed_pr: PR #999 ") and "someone-else/cleanup-legacy" in w
        for w in warnings
    ), warnings


def test_digest_no_drift_flag_skips_search(cli_group: ClinkrGroup) -> None:
    gateway = _seed_widget_rewrite()
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
        pr_gateway=FakePRGateway(open_prs=(drift_pr,)),
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "digest", "widget-rewrite", "--no-drift", "--format", "json"],
        obj=obj,
    )
    payload = json.loads(result.output)

    assert result.exit_code == 0, result.output
    assert "drift_open_prs" not in payload["data"]
    assert payload["data"]["warnings"] == []


def test_digest_drift_failure_emits_warning_not_error(cli_group: ClinkrGroup) -> None:
    gateway = _seed_widget_rewrite()
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
    assert "drift_open_prs" not in payload["data"]


# ---------------------------------------------------------------------------
# memj_state — fresh / stale / merged
# ---------------------------------------------------------------------------


def test_digest_memj_state_fresh_when_snapshot_at_or_after_branch_head(
    cli_group: ClinkrGroup,
) -> None:
    gateway = _seed_widget_rewrite()
    file_last_touched = {
        (
            "refs/brmem/ns/memjectives/widget-rewrite-layer-1",
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
    by_branch = {e["branch"]: e for e in payload["data"]["tree"]}
    assert by_branch["widget-rewrite-layer-1"]["memj_state"] == "fresh"
    assert by_branch["widget-rewrite-layer-1"]["branch_head_iso"] == ("2026-04-26T20:54:00+00:00")


def test_digest_memj_state_stale_when_branch_head_newer_than_snapshot(
    cli_group: ClinkrGroup,
) -> None:
    gateway = _seed_widget_rewrite()
    file_last_touched = {
        (
            "refs/brmem/ns/memjectives/widget-rewrite-layer-1",
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
    by_branch = {e["branch"]: e for e in payload["data"]["tree"]}
    assert by_branch["widget-rewrite-layer-1"]["memj_state"] == "stale"


def test_digest_memj_state_fresh_for_deleted_branch_regardless_of_head(
    cli_group: ClinkrGroup,
) -> None:
    """A deleted branch's snapshot is fresh by definition — its history is frozen."""

    gateway = _seed_widget_rewrite()
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
    by_branch = {e["branch"]: e for e in payload["data"]["tree"]}
    assert by_branch["widget-rewrite-groundwork"]["deleted"] is True
    assert by_branch["widget-rewrite-groundwork"]["memj_state"] == "fresh"
    assert by_branch["widget-rewrite-groundwork"]["branch_head_iso"] is None
