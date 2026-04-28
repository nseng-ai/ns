from __future__ import annotations

import json
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
    gateway: FakeBranchMemoryGateway | None = None,
    branch: str | DetachedHead | None = "feat/x",
    live_branches: tuple[str, ...] = (),
    pr_gateway: PRGateway | None = None,
) -> ClinkrContextObject:
    brmem_gateway = gateway if gateway is not None else FakeBranchMemoryGateway()
    if branch is None:
        git_gateway = FakeGitGateway(branches=live_branches)
    else:
        git_gateway = FakeGitGateway(
            current_branch_by_path={Path.cwd(): branch},
            branches=live_branches,
        )
    ctx = ObjectiveCliContext(
        brmem_gateway=brmem_gateway,
        git_gateway=git_gateway,
        pr_gateway=pr_gateway if pr_gateway is not None else FakePRGateway(),
        gt_gateway=FakeGtGateway(),
    )
    return build_clinkr_context_object(lambda: ctx)


class _BrokenPRGateway(FakePRGateway):
    """PR gateway whose every lookup fails with a non-1 return code."""

    def get_pr_for_branch(self, branch: str) -> PRSummary | PRLookupError:
        return PRLookupError(stderr="auth failed", returncode=4)


# ---------------------------------------------------------------------------
# help / schema
# ---------------------------------------------------------------------------


def test_tree_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["tree", "-h"])

    assert result.exit_code == 0
    assert "Usage: objective tree" in result.output
    assert "Display the tree of branches carrying a objective snapshot" in result.output
    assert "SLUG" in result.output


def test_tree_schema_flag_is_eager(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["tree", "--schema"])
    payload = json.loads(result.stdout)

    assert result.exit_code == 0, result.output
    assert set(payload) == {"input_schema", "output_schema"}


# ---------------------------------------------------------------------------
# auto-resolve
# ---------------------------------------------------------------------------


def _seed_sole_objective_on_feat_x() -> FakeBranchMemoryGateway:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget-rewrite/body.md", "master", "seed\n")
    gateway.put("objectives", "widget-rewrite/body.md", "feat/x", "snap\n")
    # An unrelated objective on a different branch must not cause ambiguity.
    gateway.put("objectives", "other-slug/body.md", "feat/other", "snap\n")
    # Other namespaces must not count.
    gateway.put("scratch", "plan.md", "feat/x", "seed\n")
    return gateway


def test_tree_auto_resolves_sole_objective_on_current_branch(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(
        gateway=_seed_sole_objective_on_feat_x(),
        live_branches=("master", "feat/x"),
    )

    result = CliRunner().invoke(cli_group, ["tree"], obj=obj)

    assert result.exit_code == 0, result.output
    assert "slug: widget-rewrite" in result.output
    assert "canonical: present (master)" in result.output
    assert "feat/x" in result.output


def test_tree_auto_resolve_ambiguous_fails(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "slug-a/body.md", "feat/x", "snap\n")
    gateway.put("objectives", "slug-b/body.md", "feat/x", "snap\n")
    obj = _make_obj(gateway=gateway, live_branches=("feat/x",))

    result = CliRunner().invoke(cli_group, ["tree", "--format", "json"], obj=obj)
    payload = json.loads(result.output)

    assert result.exit_code == 2
    assert payload["error_type"] == "ambiguous_objective"
    assert "slug-a" in payload["message"]
    assert "slug-b" in payload["message"]
    assert "Specify a SLUG." in payload["message"]


def test_tree_auto_resolve_none_fails(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(live_branches=("feat/x",))

    result = CliRunner().invoke(cli_group, ["tree", "--format", "json"], obj=obj)
    payload = json.loads(result.output)

    assert result.exit_code == 2
    assert payload["error_type"] == "no_objective_on_branch"
    assert payload["message"] == "No objective on branch 'feat/x'."


def test_tree_detached_head_with_no_slug_fails(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(
        gateway=_seed_sole_objective_on_feat_x(),
        branch=DetachedHead(),
        live_branches=("master", "feat/x"),
    )

    result = CliRunner().invoke(cli_group, ["tree", "--format", "json"], obj=obj)
    payload = json.loads(result.output)

    assert result.exit_code == 2
    assert payload["error_type"] == "detached_head"


# ---------------------------------------------------------------------------
# explicit slug — happy paths
# ---------------------------------------------------------------------------


def test_tree_explicit_slug_happy_path(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget-rewrite/body.md", "master", "seed\n")
    gateway.put("objectives", "widget-rewrite/body.md", "widget-rewrite-layer-1", "snap\n")
    obj = _make_obj(
        gateway=gateway,
        live_branches=("master", "widget-rewrite-layer-1"),
        pr_gateway=FakePRGateway(
            prs_by_branch={
                "widget-rewrite-layer-1": _pr(
                    number=833,
                    title="Widget rewrite: layer 1",
                    url="https://example.com/pull/833",
                    state="OPEN",
                    head="widget-rewrite-layer-1",
                ),
            },
        ),
    )

    result = CliRunner().invoke(cli_group, ["tree", "widget-rewrite"], obj=obj)

    assert result.exit_code == 0, result.output
    assert "slug: widget-rewrite" in result.output
    assert "canonical: present (master)" in result.output
    assert "widget-rewrite-layer-1" in result.output
    assert "open" in result.output
    assert "#833" in result.output
    assert "Widget rewrite: layer 1" in result.output


def test_tree_unknown_slug_is_negative(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(gateway=_seed_sole_objective_on_feat_x(), live_branches=("master",))

    result = CliRunner().invoke(cli_group, ["tree", "does-not-exist"], obj=obj)

    assert result.exit_code == 1
    assert "No objective found for slug 'does-not-exist'." in result.output


def test_tree_unknown_slug_json(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(gateway=_seed_sole_objective_on_feat_x(), live_branches=("master",))

    result = CliRunner().invoke(
        cli_group,
        ["tree", "does-not-exist", "--format", "json"],
        obj=obj,
    )
    payload = json.loads(result.output)

    assert result.exit_code == 1
    assert payload["exit_code"] == 1
    assert payload["message"] == "No objective found for slug 'does-not-exist'."
    assert payload["data"] == {
        "slug": "does-not-exist",
        "canonical_present": False,
        "entries": [],
    }


# ---------------------------------------------------------------------------
# mixed row states, seed exclusion, stale tagging, ordering, gh error
# ---------------------------------------------------------------------------


def _seed_mixed() -> FakeBranchMemoryGateway:
    gateway = FakeBranchMemoryGateway()
    slug = "widget-rewrite"
    gateway.put("objectives", f"{slug}/body.md", "master", "seed\n")
    gateway.put("objectives", f"{slug}/body.md", "widget-rewrite-groundwork", "snap\n")
    gateway.put("objectives", f"{slug}/body.md", "widget-rewrite-layer-1", "snap\n")
    gateway.put("objectives", f"{slug}/body.md", "widget-rewrite-layer-2", "snap\n")
    gateway.put("objectives", f"{slug}/body.md", "widget-rewrite-closed", "snap\n")
    gateway.put("objectives", f"{slug}/body.md", "widget-rewrite-stale-broken", "snap\n")
    return gateway


class _PartialBrokenPRGateway(FakePRGateway):
    """Seed most PRs normally, but make one branch fail with non-1 exit."""

    def __init__(
        self,
        *,
        prs_by_branch: dict[str, PRSummary],
        broken_branches: tuple[str, ...],
    ) -> None:
        super().__init__(prs_by_branch=prs_by_branch)
        self._broken_branches = set(broken_branches)

    def get_pr_for_branch(self, branch: str) -> PRSummary | PRLookupError:
        if branch in self._broken_branches:
            return PRLookupError(stderr="auth failed", returncode=4)
        return super().get_pr_for_branch(branch)


def test_tree_mixed_rows_json(cli_group: ClinkrGroup) -> None:
    pr_gateway = _PartialBrokenPRGateway(
        prs_by_branch={
            "widget-rewrite-groundwork": _pr(
                number=812,
                title="Scaffold widget rewrite",
                url="https://example.com/pull/812",
                state="MERGED",
                head="widget-rewrite-groundwork",
            ),
            "widget-rewrite-layer-1": _pr(
                number=833,
                title="Widget rewrite: layer 1",
                url="https://example.com/pull/833",
                state="OPEN",
                head="widget-rewrite-layer-1",
            ),
            "widget-rewrite-closed": _pr(
                number=900,
                title="Abandoned attempt",
                url="https://example.com/pull/900",
                state="CLOSED",
                head="widget-rewrite-closed",
            ),
        },
        broken_branches=("widget-rewrite-stale-broken",),
    )
    obj = _make_obj(
        gateway=_seed_mixed(),
        live_branches=(
            "master",
            "widget-rewrite-layer-1",
            "widget-rewrite-closed",
            "widget-rewrite-groundwork",
        ),
        pr_gateway=pr_gateway,
    )

    result = CliRunner().invoke(
        cli_group,
        ["tree", "widget-rewrite", "--format", "json"],
        obj=obj,
    )
    payload = json.loads(result.output)

    assert result.exit_code == 0, result.output
    assert payload["exit_code"] == 0
    data = payload["data"]
    assert data["slug"] == "widget-rewrite"
    assert data["canonical_present"] is True

    entries = data["entries"]
    # Ordering: merged → open → closed → no_pr → error, alpha within group.
    assert [e["branch"] for e in entries] == [
        "widget-rewrite-groundwork",
        "widget-rewrite-layer-1",
        "widget-rewrite-closed",
        "widget-rewrite-layer-2",
        "widget-rewrite-stale-broken",
    ]
    assert [e["action"] for e in entries] == [
        "merged",
        "open",
        "closed",
        "no_pr",
        "error",
    ]
    # master is excluded from rows despite carrying a seed.
    assert "master" not in {e["branch"] for e in entries}

    merged = entries[0]
    assert merged["pr_number"] == 812
    assert merged["pr_state"] == "MERGED"
    assert merged["pr_title"] == "Scaffold widget rewrite"
    assert merged["pr_url"] == "https://example.com/pull/812"
    assert merged["pr_error_stderr"] is None
    assert merged["stale"] is False

    no_pr = entries[3]
    assert no_pr["pr_number"] is None
    assert no_pr["pr_error_stderr"] is None
    assert no_pr["stale"] is True  # not in live_branches

    error = entries[4]
    assert error["pr_number"] is None
    assert error["pr_error_stderr"] == "auth failed"
    assert error["stale"] is True


def test_tree_human_output_omits_stale_marker(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget-rewrite/body.md", "master", "seed\n")
    gateway.put("objectives", "widget-rewrite/body.md", "widget-rewrite-stale", "snap\n")
    obj = _make_obj(
        gateway=gateway,
        live_branches=("master",),  # the snapshot branch is stale
        pr_gateway=FakePRGateway(
            prs_by_branch={
                "widget-rewrite-stale": _pr(
                    number=900,
                    title="Stale merged",
                    url="https://example.com/pull/900",
                    state="MERGED",
                    head="widget-rewrite-stale",
                ),
            },
        ),
    )

    result = CliRunner().invoke(cli_group, ["tree", "widget-rewrite"], obj=obj)

    assert result.exit_code == 0, result.output
    assert "widget-rewrite-stale" in result.output
    assert "[stale]" not in result.output
    assert "merged" in result.output
    assert "#900" in result.output


def test_tree_seed_only_has_empty_rows(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "clinkr-migration/body.md", "master", "seed\n")
    obj = _make_obj(gateway=gateway, live_branches=("master",))

    result = CliRunner().invoke(
        cli_group,
        ["tree", "clinkr-migration", "--format", "json"],
        obj=obj,
    )
    payload = json.loads(result.output)

    assert result.exit_code == 0, result.output
    assert payload["data"] == {
        "slug": "clinkr-migration",
        "canonical_present": True,
        "entries": [],
    }

    human = CliRunner().invoke(cli_group, ["tree", "clinkr-migration"], obj=obj)
    assert human.exit_code == 0, human.output
    assert "canonical: present (master)" in human.output
    assert "(no branches)" in human.output


def test_tree_all_broken_gh_becomes_error_rows(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget-rewrite/body.md", "feat/x", "snap\n")
    obj = _make_obj(
        gateway=gateway,
        live_branches=("feat/x",),
        pr_gateway=_BrokenPRGateway(),
    )

    result = CliRunner().invoke(
        cli_group,
        ["tree", "widget-rewrite", "--format", "json"],
        obj=obj,
    )
    payload = json.loads(result.output)

    assert result.exit_code == 0, result.output
    assert payload["data"]["canonical_present"] is False
    entries = payload["data"]["entries"]
    assert [e["action"] for e in entries] == ["error"]
    assert entries[0]["pr_error_stderr"] == "auth failed"
