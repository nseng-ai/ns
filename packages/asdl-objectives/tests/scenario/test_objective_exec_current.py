"""Scenario tests for ``objective exec current``.

These exercise the rendered Markdown contract end-to-end through
``build_cli()`` with the fake gateway stack (`brmem`, git, gh) the rest of
the objective scenario suite uses. The skill `objective-current` prints this
output verbatim, so substring assertions on ``result.output`` cover the
user-facing surface.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from click.testing import CliRunner

from asdl_core.clinkr.context import ClinkrContextObject, build_clinkr_context_object
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.gh.pr_gateway import PRGateway
from asdl_core.gh.pr_testing import FakePRGateway
from asdl_core.gh.types import PRLookupError, PRSummary
from asdl_core.git.testing import FakeGitGateway
from asdl_core.git.types import CommitSummary, DetachedHead, GitCommandFailure
from asdl_objectives.context import ObjectiveCliContext
from asdl_objectives.exec.current import (
    _build_current_prompt,
    _CurrentBranchBlock,
    _ObjectiveSummary,
    _StackEntry,
    _TrunkObjectiveSummary,
    _TrunkRow,
)
from asdl_objectives.main import build_cli
from brmem.fake import FakeBranchMemoryGateway


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
    gateway: FakeBranchMemoryGateway | None = None,
    branch: str | DetachedHead | GitCommandFailure | None = "feat/current",
    live_branches: tuple[str, ...] = (),
    pr_gateway: PRGateway | None = None,
    file_last_touched: dict[tuple[str, str], str] | None = None,
    branch_head_iso: dict[str, str] | None = None,
    commits_by_range: dict[str, tuple[CommitSummary, ...]] | None = None,
    patch_ids_by_range: dict[str, tuple[tuple[str, str | None], ...]] | None = None,
) -> ClinkrContextObject:
    brmem_gateway = gateway if gateway is not None else FakeBranchMemoryGateway()
    if branch is None:
        git_gateway = FakeGitGateway(
            branches=live_branches,
            file_last_touched_by_ref_path=file_last_touched,
            branch_head_iso_by_branch=branch_head_iso,
            commits_by_range=commits_by_range,
            patch_ids_by_range=patch_ids_by_range,
            trunk_branch="master",
        )
    else:
        git_gateway = FakeGitGateway(
            current_branch_by_path={Path.cwd(): branch},
            branches=live_branches,
            file_last_touched_by_ref_path=file_last_touched,
            branch_head_iso_by_branch=branch_head_iso,
            commits_by_range=commits_by_range,
            patch_ids_by_range=patch_ids_by_range,
            trunk_branch="master",
        )
    ctx = ObjectiveCliContext(
        brmem_gateway=brmem_gateway,
        git_gateway=git_gateway,
        pr_gateway=pr_gateway if pr_gateway is not None else FakePRGateway(),
    )
    return build_clinkr_context_object(lambda: ctx)


def _invoke_current(cli_group: ClinkrGroup, obj: ClinkrContextObject) -> str:
    result = CliRunner().invoke(cli_group, ["exec", "current"], obj=obj)
    assert result.exit_code == 0, result.output
    return result.output


def _invoke_current_json(cli_group: ClinkrGroup, obj: ClinkrContextObject) -> dict[str, object]:
    result = CliRunner().invoke(cli_group, ["exec", "current", "--format", "json"], obj=obj)
    assert result.exit_code == 0, result.output
    return json.loads(result.output)


# ---------------------------------------------------------------------------
# help / schema
# ---------------------------------------------------------------------------


def test_current_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "current", "-h"])

    assert result.exit_code == 0
    assert "Usage: objective exec current" in result.output
    assert "orientation brief" in result.output


def test_current_schema_flag_is_eager(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "current", "--schema"])

    assert result.exit_code == 0, result.output
    payload = json.loads(result.stdout)
    assert set(payload) == {"input_schema", "output_schema"}
    output_schema = payload["output_schema"]
    assert output_schema["properties"]["prompt"]["type"] == "string"
    assert output_schema["properties"]["current_branch"]["type"] == ["string", "null"]
    assert output_schema["properties"]["trunk_branch"]["type"] == "string"
    assert output_schema["properties"]["objective"]["properties"]["kind"]["enum"] == [
        "claimed",
        "none",
    ]
    assert output_schema["properties"]["status_badge"]["properties"]["kind"]["enum"] == [
        "objective",
        "none",
    ]


# ---------------------------------------------------------------------------
# branch resolution
# ---------------------------------------------------------------------------


def test_current_detached_head(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(branch=DetachedHead())

    out = _invoke_current(cli_group, obj)

    assert "# Detached HEAD" in out
    assert "Trunk is `master`." in out
    assert "## Stack Map" not in out
    assert "## Current Branch Context" not in out


def test_current_detached_head_json_shape(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(branch=DetachedHead())

    payload = _invoke_current_json(cli_group, obj)

    assert payload["exit_code"] == 0
    assert payload["data"] == {
        "prompt": (
            "# Detached HEAD\n\n"
            "Trunk is `master`. Check out a feature branch to see objective context.\n"
        ),
        "current_branch": None,
        "trunk_branch": "master",
        "objective": {"kind": "none", "slug": None, "state": None},
        "status_badge": {"kind": "none", "slug": None},
    }


def test_current_git_failure_json_envelope(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(branch=GitCommandFailure(message="git broke", returncode=1))

    result = CliRunner().invoke(cli_group, ["exec", "current", "--format", "json"], obj=obj)
    payload = json.loads(result.output)

    assert result.exit_code == 2
    assert payload == {"exit_code": 2, "error_type": "git_failed", "message": "git broke"}


def test_current_on_trunk(cli_group: ClinkrGroup) -> None:
    """Sitting on master with an empty registry renders a bare trunk row."""
    obj = _make_obj(
        branch="master",
        live_branches=("master",),
    )

    out = _invoke_current(cli_group, obj)

    assert "# On `master`" in out
    assert "## Stack Map" in out
    assert "master  <- current" in out
    # current-branch-only orientation: no downstack ancestors, no upstack
    # children — only the trunk row (which is also the current row when on
    # master) appears in the stack map.
    stack_block = out.split("## Stack Map", 1)[1]
    fence_open, _, after_open = stack_block.partition("```text\n")
    fence_body, _, _ = after_open.partition("\n```")
    rows = [line for line in fence_body.splitlines() if line.strip()]
    assert rows == ["master  <- current"], rows


def test_current_on_trunk_with_n_canonicals_json_shape(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "alpha/body.md", "master", "alpha body")
    gateway.put("objectives", "bravo/body.md", "master", "bravo body")
    gateway.put("objectives", "charlie/body.md", "master", "charlie body")
    obj = _make_obj(
        gateway=gateway,
        branch="master",
        live_branches=("master",),
    )

    payload = _invoke_current_json(cli_group, obj)

    assert payload["exit_code"] == 0
    assert payload["data"] == {
        "prompt": _invoke_current(cli_group, obj),
        "current_branch": "master",
        "trunk_branch": "master",
        "objective": {"kind": "none", "slug": None, "state": None},
        "status_badge": {"kind": "none", "slug": None},
    }


def test_current_on_trunk_with_n_canonicals_renders_bare_row(cli_group: ClinkrGroup) -> None:
    """Master holding multiple canonical slugs must not be labeled with one."""
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "alpha/body.md", "master", "alpha body")
    gateway.put("objectives", "bravo/body.md", "master", "bravo body")
    gateway.put("objectives", "charlie/body.md", "master", "charlie body")
    obj = _make_obj(
        gateway=gateway,
        branch="master",
        live_branches=("master",),
    )

    out = _invoke_current(cli_group, obj)

    # Header still surfaces the multi-claim list (master IS the registry),
    # but the stack-map trunk row must be bare — never labeled with the
    # alphabetical-first slug, which would walk an agent toward maintenance
    # work on a slug it is not engaged with.
    stack_block = out.split("## Stack Map", 1)[1]
    fence_open, _, after_open = stack_block.partition("```text\n")
    fence_body, _, _ = after_open.partition("\n```")
    rows = [line for line in fence_body.splitlines() if line.strip()]
    assert rows == ["master  <- current"], rows
    assert "alpha fresh" not in fence_body
    assert "alpha stale" not in fence_body


# ---------------------------------------------------------------------------
# current-branch header
# ---------------------------------------------------------------------------


def test_current_no_objective_claimed_no_pr(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(branch="feat/current")

    out = _invoke_current(cli_group, obj)

    assert "# On `feat/current`" in out
    assert "**Objective:** _none claimed_" in out
    assert "**Snapshot:**" not in out
    assert "**PR:** _no PR_" in out
    assert "**brmem:** _none_" in out
    assert "## Current Branch Context" not in out
    assert "## Next Orientation Step" not in out


def test_current_no_objective_claimed_json_shape(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(branch="feat/current")

    payload = _invoke_current_json(cli_group, obj)

    assert payload["exit_code"] == 0
    assert payload["data"] == {
        "prompt": _invoke_current(cli_group, obj),
        "current_branch": "feat/current",
        "trunk_branch": "master",
        "objective": {"kind": "none", "slug": None, "state": None},
        "status_badge": {"kind": "none", "slug": None},
    }


def test_current_single_claim_fresh(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget/body.md", "feat/current", "# Widget objective\n")
    gateway.put(
        "objectives",
        "widget/.absorbed.jsonl",
        "feat/current",
        (
            '{"schema":1,"sha":"aaa111","patch_id":"pid-1",'
            '"author_iso":"2026-04-26T07:30:00+00:00","subject":"Wire widget"}\n'
        ),
    )
    file_last_touched = {
        ("refs/brmem/ns/objectives/feat---current", "widget/body.md"): "2026-04-26T08:00:00+00:00",
    }
    branch_head_iso = {"feat/current": "2026-04-26T07:00:00+00:00"}
    commits_by_range = {
        "master..feat/current": (
            CommitSummary(
                sha="aaa111",
                author_iso="2026-04-26T07:30:00+00:00",
                subject="Wire widget",
            ),
        ),
    }
    patch_ids_by_range = {
        "master..feat/current": (("aaa111", "pid-1"),),
    }
    obj = _make_obj(
        gateway=gateway,
        branch="feat/current",
        live_branches=("feat/current",),
        file_last_touched=file_last_touched,
        branch_head_iso=branch_head_iso,
        commits_by_range=commits_by_range,
        patch_ids_by_range=patch_ids_by_range,
    )

    out = _invoke_current(cli_group, obj)

    assert "**Objective:** `widget`" in out
    assert "**Snapshot:** fresh" in out
    assert "## Next Orientation Step" in out
    assert "`objective-digest widget`" in out


def test_current_single_claim_fresh_json_shape(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget/body.md", "feat/current", "# Widget objective\n")
    gateway.put(
        "objectives",
        "widget/.absorbed.jsonl",
        "feat/current",
        (
            '{"schema":1,"sha":"aaa111","patch_id":"pid-1",'
            '"author_iso":"2026-04-26T07:30:00+00:00","subject":"Wire widget"}\n'
        ),
    )
    file_last_touched = {
        ("refs/brmem/ns/objectives/feat---current", "widget/body.md"): "2026-04-26T08:00:00+00:00",
    }
    branch_head_iso = {"feat/current": "2026-04-26T07:00:00+00:00"}
    commits_by_range = {
        "master..feat/current": (
            CommitSummary(
                sha="aaa111",
                author_iso="2026-04-26T07:30:00+00:00",
                subject="Wire widget",
            ),
        ),
    }
    patch_ids_by_range = {
        "master..feat/current": (("aaa111", "pid-1"),),
    }
    obj = _make_obj(
        gateway=gateway,
        branch="feat/current",
        live_branches=("feat/current",),
        file_last_touched=file_last_touched,
        branch_head_iso=branch_head_iso,
        commits_by_range=commits_by_range,
        patch_ids_by_range=patch_ids_by_range,
    )

    payload = _invoke_current_json(cli_group, obj)

    assert payload["exit_code"] == 0
    assert payload["data"] == {
        "prompt": _invoke_current(cli_group, obj),
        "current_branch": "feat/current",
        "trunk_branch": "master",
        "objective": {"kind": "claimed", "slug": "widget", "state": "fresh"},
        "status_badge": {"kind": "objective", "slug": "widget"},
    }


def test_current_single_claim_stale(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget/body.md", "feat/current", "# Widget objective\n")
    file_last_touched = {
        ("refs/brmem/ns/objectives/feat---current", "widget/body.md"): "2026-04-26T07:00:00+00:00",
    }
    # Latest author time on master..branch is newer than snapshot — stale.
    branch_head_iso = {"feat/current": "2026-04-26T08:00:00+00:00"}
    commits_by_range = {
        "master..feat/current": (
            CommitSummary(
                sha="bbb222",
                author_iso="2026-04-26T08:00:00+00:00",
                subject="Wire widget",
            ),
        ),
    }
    # Branch carries a novel patch-id not absorbed by any ancestor.
    patch_ids_by_range = {
        "master..feat/current": (("bbb222", "pid-novel"),),
    }
    obj = _make_obj(
        gateway=gateway,
        branch="feat/current",
        live_branches=("feat/current",),
        file_last_touched=file_last_touched,
        branch_head_iso=branch_head_iso,
        commits_by_range=commits_by_range,
        patch_ids_by_range=patch_ids_by_range,
    )

    out = _invoke_current(cli_group, obj)

    assert "**Snapshot:** stale - run `objective-update widget` to refresh" in out


def test_current_multiple_claims_on_branch_json_shape(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "alpha/body.md", "feat/current", "alpha")
    gateway.put("objectives", "bravo/body.md", "feat/current", "bravo")
    gateway.put("objectives", "charlie/body.md", "feat/current", "charlie")
    obj = _make_obj(
        gateway=gateway,
        branch="feat/current",
        live_branches=("feat/current",),
    )

    payload = _invoke_current_json(cli_group, obj)

    assert payload["exit_code"] == 0
    assert payload["data"] == {
        "prompt": _invoke_current(cli_group, obj),
        "current_branch": "feat/current",
        "trunk_branch": "master",
        "objective": {"kind": "none", "slug": None, "state": None},
        "status_badge": {"kind": "none", "slug": None},
    }


def test_current_multiple_claims_on_branch(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "alpha/body.md", "feat/current", "alpha")
    gateway.put("objectives", "bravo/body.md", "feat/current", "bravo")
    gateway.put("objectives", "charlie/body.md", "feat/current", "charlie")
    obj = _make_obj(
        gateway=gateway,
        branch="feat/current",
        live_branches=("feat/current",),
    )

    out = _invoke_current(cli_group, obj)

    assert "**Objective:** `alpha`" in out
    assert "_also claimed: bravo, charlie_" in out


def test_current_brmem_listing_includes_multiple_namespaces(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget/body.md", "feat/current", "# Widget body\n\nbody text")
    gateway.put(None, "plans/feat-plan.md", "feat/current", "# Plan\n\nstep 1")
    obj = _make_obj(
        gateway=gateway,
        branch="feat/current",
        live_branches=("feat/current",),
    )

    out = _invoke_current(cli_group, obj)

    assert "**brmem:** 2 entries" in out
    assert "## Current Branch Context" in out
    assert "- `base` `plans/feat-plan.md` (14 bytes) - # Plan" in out
    assert "- `objectives` `widget/body.md`" in out


def test_current_pr_present(cli_group: ClinkrGroup) -> None:
    pr_gateway = FakePRGateway(
        prs_by_branch={
            "feat/current": _pr(
                number=42,
                title="Wire feat",
                url="https://example.com/pull/42",
                state="OPEN",
                head="feat/current",
            ),
        },
    )
    obj = _make_obj(
        branch="feat/current",
        live_branches=("feat/current",),
        pr_gateway=pr_gateway,
    )

    out = _invoke_current(cli_group, obj)

    assert "**PR:** [#42](https://example.com/pull/42) OPEN - Wire feat" in out


class _BrokenPRGateway(FakePRGateway):
    def get_pr_for_branch(self, branch: str) -> PRSummary | PRLookupError:
        return PRLookupError(stderr="auth failed", returncode=4)


def test_current_pr_gateway_failure_surfaces_error(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(
        branch="feat/current",
        live_branches=("feat/current",),
        pr_gateway=_BrokenPRGateway(),
    )

    out = _invoke_current(cli_group, obj)

    assert "**PR:** _lookup failed: auth failed_" in out


# ---------------------------------------------------------------------------
# stack map
# ---------------------------------------------------------------------------


def test_current_stack_map_shows_current_branch_only(cli_group: ClinkrGroup) -> None:
    """A3: `objective-current` is current-branch orientation only.

    No downstack ancestor row, no upstack child row, and (today) no trunk
    row above the current branch. The stack map renders exactly one line:
    the current branch.
    """
    obj = _make_obj(
        branch="feat/current",
        live_branches=("master", "feat/current"),
    )

    out = _invoke_current(cli_group, obj)

    assert "feat/current  no PR  no objective  <- current" in out
    stack_block = out.split("## Stack Map", 1)[1]
    _, _, after_open = stack_block.partition("```text\n")
    fence_body, _, _ = after_open.partition("\n```")
    rows = [line for line in fence_body.splitlines() if line.strip()]
    assert rows == ["feat/current  no PR  no objective  <- current"], rows


def test_current_stack_map_no_trunk_row_when_no_downstack(cli_group: ClinkrGroup) -> None:
    """Even with master holding canonical slugs, the trunk row stays out.

    A3 locks `objective-current` to current-branch-only orientation. Until
    a stack walker returns non-empty downstack, the trunk row must not
    appear above the current branch — otherwise master's canonical
    registry would label every feature-branch invocation.
    """
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "alpha/body.md", "master", "alpha body")
    gateway.put("objectives", "bravo/body.md", "master", "bravo body")
    obj = _make_obj(
        gateway=gateway,
        branch="feat/current",
        live_branches=("master", "feat/current"),
    )

    out = _invoke_current(cli_group, obj)

    stack_block = out.split("## Stack Map", 1)[1]
    _, _, after_open = stack_block.partition("```text\n")
    fence_body, _, _ = after_open.partition("\n```")
    rows = [line for line in fence_body.splitlines() if line.strip()]
    assert rows == ["feat/current  no PR  no objective  <- current"], rows
    assert "master" not in fence_body


def test_current_on_trunk_with_orphan_claim_renders_missing_on_master(
    cli_group: ClinkrGroup,
) -> None:
    """A5 case 3: current branch claims X but master lacks body.md → orphan.

    Sitting on master with slug ``widget`` listed (e.g. via a stray
    roadmap blob) but no canonical ``widget/body.md`` is the orphan case.
    The trunk row labels the row ``X missing on master`` so a reconcile
    candidate is not silently mistaken for a fresh canonical record.
    """
    gateway = FakeBranchMemoryGateway()
    # Orphan: roadmap exists, body.md does not — slug is listed but
    # canonical body is missing.
    gateway.put("objectives", "widget/roadmap.md", "master", "stray roadmap")
    obj = _make_obj(
        gateway=gateway,
        branch="master",
        live_branches=("master",),
    )

    out = _invoke_current(cli_group, obj)

    stack_block = out.split("## Stack Map", 1)[1]
    _, _, after_open = stack_block.partition("```text\n")
    fence_body, _, _ = after_open.partition("\n```")
    rows = [line for line in fence_body.splitlines() if line.strip()]
    assert rows == ["master  no PR  widget missing on master  <- current"], rows


def test_current_on_trunk_single_canonical_uses_master_vs_master_freshness(
    cli_group: ClinkrGroup,
) -> None:
    """A5 case 2: current branch claims X and master holds X → fresh|stale.

    Master-vs-master freshness compares ``<X>/body.md`` last-touch on
    master to master HEAD. Newer trunk HEAD than canonical body.md means
    the canonical record has fallen behind — answer to "should I
    reconcile?" — and the row is ``stale``.
    """
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget/body.md", "master", "# Widget")
    file_last_touched = {
        ("refs/brmem/ns/objectives/master", "widget/body.md"): "2026-04-26T07:00:00+00:00",
    }
    branch_head_iso = {"master": "2026-04-26T08:00:00+00:00"}
    obj = _make_obj(
        gateway=gateway,
        branch="master",
        live_branches=("master",),
        file_last_touched=file_last_touched,
        branch_head_iso=branch_head_iso,
    )

    out = _invoke_current(cli_group, obj)

    stack_block = out.split("## Stack Map", 1)[1]
    _, _, after_open = stack_block.partition("```text\n")
    fence_body, _, _ = after_open.partition("\n```")
    rows = [line for line in fence_body.splitlines() if line.strip()]
    assert rows == ["master  no PR  widget stale  <- current"], rows


def _trunk_row(
    *,
    branch: str = "master",
    in_scope: _TrunkObjectiveSummary | None = None,
) -> _TrunkRow:
    return _TrunkRow(branch=branch, pr=None, pr_error=None, in_scope=in_scope)


def _current_block(
    *,
    branch: str,
    objective: _ObjectiveSummary | None = None,
    objectives_extra: tuple[str, ...] = (),
) -> _CurrentBranchBlock:
    return _CurrentBranchBlock(
        branch=branch,
        objective=objective,
        objectives_extra=objectives_extra,
        pr=None,
        pr_error=None,
        brmem=(),
    )


def _stack_entry(
    *,
    branch: str,
    objective: _ObjectiveSummary | None = None,
    deleted: bool = False,
) -> _StackEntry:
    return _StackEntry(
        branch=branch,
        objective=objective,
        pr=None,
        pr_error=None,
        deleted=deleted,
    )


def _stack_rows(prompt: str) -> list[str]:
    block = prompt.split("## Stack Map", 1)[1]
    _, _, after_open = block.partition("```text\n")
    fence_body, _, _ = after_open.partition("\n```")
    return [line for line in fence_body.splitlines() if line.strip()]


# ---------------------------------------------------------------------------
# future-proof: stack map rendering with injected non-empty downstack
# ---------------------------------------------------------------------------
#
# `objective exec current` hardcodes empty `ancestors` / `children` today
# (A3 — current-branch-only orientation). When stack walking returns, the
# trunk row will appear at the bottom of every non-trunk stack. The tests
# below drive the rendering pipeline directly with synthetic stack entries
# to lock the in-scope-slug rule for that future case without waiting for
# the walker to land. The seam is the module-level `_build_current_prompt`,
# which already takes typed stack inputs.


def test_render_with_downstack_uses_in_scope_slug_for_trunk_row() -> None:
    """A5 case 2 under stack walking: trunk row adopts current's claim."""
    current = _current_block(
        branch="feat/widget",
        objective=_ObjectiveSummary(slug="widget", obj_state="fresh"),
    )
    trunk_row = _trunk_row(in_scope=_TrunkObjectiveSummary(slug="widget", state="fresh"))
    parent = _stack_entry(
        branch="feat/parent",
        objective=_ObjectiveSummary(slug="widget", obj_state="fresh"),
    )

    prompt = _build_current_prompt(
        detached_head=False,
        trunk="master",
        current=current,
        trunk_row=trunk_row,
        downstack=(parent,),
        upstack=(),
        warnings=(),
    )

    rows = _stack_rows(prompt)
    assert rows == [
        "master  no PR  widget fresh",
        "+- feat/parent  no PR  widget fresh",
        "   +- feat/widget  no PR  widget fresh  <- current",
    ], rows


def test_render_with_downstack_orphan_claim_labels_missing_on_master() -> None:
    """A5 case 3 under stack walking: trunk row says ``missing on master``."""
    current = _current_block(
        branch="feat/widget",
        objective=_ObjectiveSummary(slug="widget", obj_state="fresh"),
    )
    trunk_row = _trunk_row(
        in_scope=_TrunkObjectiveSummary(slug="widget", state="missing_on_master"),
    )
    parent = _stack_entry(
        branch="feat/parent",
        objective=_ObjectiveSummary(slug="widget", obj_state="fresh"),
    )

    prompt = _build_current_prompt(
        detached_head=False,
        trunk="master",
        current=current,
        trunk_row=trunk_row,
        downstack=(parent,),
        upstack=(),
        warnings=(),
    )

    rows = _stack_rows(prompt)
    assert "master  no PR  widget missing on master" in rows[0], rows


def test_render_with_downstack_no_claim_renders_bare_trunk_row() -> None:
    """Non-trunk current with no claim → trunk row stays bare even with downstack.

    Locks the in-scope-slug rule against accidentally falling back to
    master's canonical registry when the current branch claims nothing.
    """
    current = _current_block(branch="feat/widget", objective=None)
    trunk_row = _trunk_row(in_scope=None)
    parent = _stack_entry(branch="feat/parent", objective=None)

    prompt = _build_current_prompt(
        detached_head=False,
        trunk="master",
        current=current,
        trunk_row=trunk_row,
        downstack=(parent,),
        upstack=(),
        warnings=(),
    )

    rows = _stack_rows(prompt)
    assert rows == [
        "master",
        "+- feat/parent  no PR  no objective",
        "   +- feat/widget  no PR  no objective  <- current",
    ], rows
