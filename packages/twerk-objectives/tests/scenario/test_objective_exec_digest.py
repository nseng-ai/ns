"""Scenario tests for ``objective exec digest``.

The skill `objective-digest` runs this command and prints its output
verbatim. These tests smoke-check the rendered brief through
`build_cli()`: that the CLI computes metadata facts correctly, embeds
the raw prose blocks, and emits the literal output template.
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
from twerk_core.gt.testing import FakeGtGateway
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
) -> ClinkrContextObject:
    if branch is None:
        git_gateway = FakeGitGateway(
            branches=live_branches,
            file_last_touched_by_ref_path=file_last_touched,
        )
    else:
        git_gateway = FakeGitGateway(
            current_branch_by_path={Path.cwd(): branch},
            branches=live_branches,
            file_last_touched_by_ref_path=file_last_touched,
        )
    ctx = ObjectiveCliContext(
        brmem_gateway=gateway,
        git_gateway=git_gateway,
        pr_gateway=pr_gateway if pr_gateway is not None else FakePRGateway(),
        gt_gateway=FakeGtGateway(),
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
    """
)

_NOTES_LAYER_1 = "- The plugin loader must be importable without optional deps.\n"


def _seed_widget_rewrite() -> FakeBranchMemoryGateway:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget-rewrite/body.md", "master", _BODY_MASTER)
    gateway.put("objectives", "widget-rewrite/body.md", "widget-rewrite-groundwork", _BODY_MASTER)
    gateway.put("objectives", "widget-rewrite/body.md", "widget-rewrite-layer-1", _BODY_MASTER)
    gateway.put(
        "objectives",
        "widget-rewrite/notes.md",
        "widget-rewrite-layer-1",
        _NOTES_LAYER_1,
    )
    return gateway


class _BrokenPRGateway(FakePRGateway):
    """PR gateway whose every lookup fails with a non-1 return code."""

    def get_pr_for_branch(self, branch: str) -> PRSummary | PRLookupError:
        return PRLookupError(stderr="auth failed", returncode=4)


# ---------------------------------------------------------------------------
# help / schema
# ---------------------------------------------------------------------------


def test_digest_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "digest", "-h"])

    assert result.exit_code == 0
    assert "Usage: objective exec digest" in result.output


def test_digest_schema_flag_is_eager(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "digest", "--schema"])

    assert result.exit_code == 0, result.output
    payload = json.loads(result.stdout)
    assert set(payload) == {"input_schema", "output_schema"}
    assert payload["output_schema"]["properties"]["prompt"]["type"] == "string"


# ---------------------------------------------------------------------------
# happy path — smoke check on rendered brief
# ---------------------------------------------------------------------------


def test_digest_emits_brief_with_facts_prose_and_template(cli_group: ClinkrGroup) -> None:
    gateway = _seed_widget_rewrite()
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
        ["exec", "digest", "widget-rewrite"],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    out = result.output

    # Pre-computed metadata.
    assert "| **Associated PRs**   | 1 open, 1 merged |" in out
    assert (
        "| **Branch snapshots** | 2 active · latest: `widget-rewrite-layer-1` "
        "(updated 2026-04-26T20:54:00+00:00) |"
    ) in out
    assert "| **Master canonical** | last touched 2026-04-26T06:52:00+00:00 |" in out

    # Master body is embedded verbatim for thesis prose.
    assert "Re-platform the widget pipeline" in out
    assert "<<<\n# Widget Rewrite" in out

    # Per-snapshot notes block carries the branch label and PR state.
    assert "[branch: widget-rewrite-layer-1 — PR #833 OPEN]" in out
    assert "plugin loader must be importable" in out

    # Branches without notes are not given an empty block.
    assert "[branch: widget-rewrite-groundwork" not in out

    # Merged PRs are pre-rendered as a linkified bullet list.
    assert "- [#812](https://example.com/pull/812) — Plugin contract scaffolding" in out

    # Empty roadmap renders the placeholder for the remaining-work step.
    assert "no roadmap recorded" in out
    assert "body shown in Step 3" in out

    # Output template is present.
    assert "# `widget-rewrite` — digest" in out
    assert "## Thesis" in out
    assert "## Merged PRs" in out
    assert "## Remaining work" in out
    assert "## Key findings (binding for future work)" in out
    assert "<METADATA TABLE FROM STEP 1, VERBATIM>" in out
    assert "<MERGED PRS FROM STEP 2, VERBATIM>" in out


def test_digest_emits_empty_findings_marker_when_no_notes(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget-rewrite/body.md", "master", _BODY_MASTER)
    gateway.put("objectives", "widget-rewrite/body.md", "widget-rewrite-layer-1", _BODY_MASTER)
    obj = _make_obj(
        gateway=gateway,
        live_branches=("master", "widget-rewrite-layer-1"),
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "digest", "widget-rewrite"],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    assert "no notes recorded across any snapshot" in result.output
    assert "_No durable findings recorded yet._" in result.output
    assert "_No merged PRs yet._" in result.output


def test_digest_marks_deleted_branch_in_metadata_and_notes_label(
    cli_group: ClinkrGroup,
) -> None:
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
        ["exec", "digest", "widget-rewrite"],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    assert "1 active (+1 merged & deleted)" in result.output


def test_digest_embeds_master_roadmap_for_remaining_work(cli_group: ClinkrGroup) -> None:
    roadmap = textwrap.dedent(
        """\
        # Roadmap

        ## Slice 1 — Plugin contract

        - [x] Define plugin entry point ABC
        - [ ] Wire plugin loader
        """
    )
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget-rewrite/body.md", "master", _BODY_MASTER)
    gateway.put("objectives", "widget-rewrite/roadmap.md", "master", roadmap)
    obj = _make_obj(
        gateway=gateway,
        branch="master",
        live_branches=("master",),
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "digest", "widget-rewrite"],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    assert "Source — master roadmap:" in result.output
    assert "## Slice 1 — Plugin contract" in result.output
    assert "no roadmap recorded" not in result.output


def test_digest_emits_no_branch_snapshots_row_when_seed_only(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget-rewrite/body.md", "master", _BODY_MASTER)
    obj = _make_obj(
        gateway=gateway,
        branch="master",
        live_branches=("master",),
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "digest", "widget-rewrite"],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    assert "0 active — no branch snapshots" in result.output


def test_digest_surfaces_pr_lookup_failures_in_metadata(cli_group: ClinkrGroup) -> None:
    gateway = _seed_widget_rewrite()
    obj = _make_obj(
        gateway=gateway,
        branch="master",
        live_branches=("master", "widget-rewrite-groundwork", "widget-rewrite-layer-1"),
        pr_gateway=_BrokenPRGateway(),
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "digest", "widget-rewrite"],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    assert (
        "| **Associated PRs**   | 0 open, 0 merged "
        "(lookup failed: `widget-rewrite-groundwork`: auth failed, "
        "`widget-rewrite-layer-1`: auth failed) |"
    ) in result.output


# ---------------------------------------------------------------------------
# auto-resolution
# ---------------------------------------------------------------------------


def test_digest_auto_resolves_sole_objective_on_current_branch(cli_group: ClinkrGroup) -> None:
    gateway = _seed_widget_rewrite()
    obj = _make_obj(
        gateway=gateway,
        branch="widget-rewrite-layer-1",
        live_branches=("master", "widget-rewrite-groundwork", "widget-rewrite-layer-1"),
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "digest"],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    assert "# `widget-rewrite` — digest" in result.output


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
