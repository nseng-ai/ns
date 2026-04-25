from __future__ import annotations

import pytest

from twerk_core.brmem.fake import FakeBranchMemoryGateway
from twerk_core.gh.pr_gateway import PRGateway
from twerk_core.gh.pr_testing import FakePRGateway
from twerk_core.gh.types import PRLookupError, PRState, PRSummary
from twerk_core.git.testing import FakeGitGateway
from twerk_core.memjective.tree_model import (
    BranchPrAction,
    MemjectiveTreeModel,
    build_memjective_tree_model,
)


def _pr(
    *,
    branch: str,
    state: PRState,
    number: int = 42,
    title: str = "Example PR",
    url: str = "https://example.com/pull/42",
) -> PRSummary:
    return PRSummary(
        number=number,
        title=title,
        url=url,
        head_ref_name=branch,
        base_ref_name="master",
        state=state,
    )


def _build(
    gateway: FakeBranchMemoryGateway,
    *,
    slug: str = "widget",
    live_branches: tuple[str, ...] = (),
    pr_gateway: PRGateway | None = None,
) -> MemjectiveTreeModel:
    return build_memjective_tree_model(
        slug=slug,
        brmem_gateway=gateway,
        git_gateway=FakeGitGateway(branches=live_branches),
        pr_gateway=pr_gateway if pr_gateway is not None else FakePRGateway(),
    )


class _BrokenPRGateway(FakePRGateway):
    def get_pr_for_branch(self, branch: str) -> PRSummary | PRLookupError:
        return PRLookupError(stderr="auth failed", returncode=4)


def test_no_entries_for_slug_produces_empty_tree_model() -> None:
    gateway = FakeBranchMemoryGateway()

    result = _build(gateway)

    assert result.slug == "widget"
    assert result.seed_present is False
    assert result.branches == ()


def test_master_only_seed_produces_seed_with_no_branches() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("memjectives", "widget/body.md", "master", "seed\n")

    result = _build(gateway, live_branches=("master",))

    assert result.seed_present is True
    assert result.branches == ()


def test_multiple_files_under_same_slug_and_branch_collapse_to_one_branch() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("memjectives", "widget/body.md", "feat/x", "body\n")
    gateway.put("memjectives", "widget/roadmap.md", "feat/x", "roadmap\n")
    gateway.put("memjectives", "widget/notes.md", "feat/x", "notes\n")

    result = _build(gateway, live_branches=("feat/x",))

    assert [branch.branch for branch in result.branches] == ["feat/x"]


def test_unrelated_slugs_and_unrelated_namespaces_are_ignored() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("memjectives", "widget/body.md", "feat/widget", "snap\n")
    gateway.put("memjectives", "other/body.md", "feat/other", "snap\n")
    gateway.put("scratch", "widget/body.md", "feat/scratch", "scratch\n")

    result = _build(gateway, live_branches=("feat/widget", "feat/other", "feat/scratch"))

    assert [branch.branch for branch in result.branches] == ["feat/widget"]


@pytest.mark.parametrize(
    ("state", "expected_action"),
    [
        ("OPEN", "open"),
        ("MERGED", "merged"),
        ("CLOSED", "closed"),
    ],
)
def test_live_branch_with_pr_maps_lifecycle_state(
    state: PRState,
    expected_action: BranchPrAction,
) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("memjectives", "widget/body.md", "feat/x", "snap\n")
    pr = _pr(
        branch="feat/x",
        state=state,
        number=123,
        title="Widget slice",
        url="https://example.com/pull/123",
    )

    result = _build(
        gateway,
        live_branches=("feat/x",),
        pr_gateway=FakePRGateway(prs_by_branch={"feat/x": pr}),
    )

    [branch] = result.branches
    assert branch.stale is False
    assert branch.pr.action == expected_action
    assert branch.pr.number == 123
    assert branch.pr.state == state
    assert branch.pr.title == "Widget slice"
    assert branch.pr.url == "https://example.com/pull/123"
    assert branch.pr.head_ref_name == "feat/x"
    assert branch.pr.base_ref_name == "master"
    assert branch.pr.error_stderr is None


def test_deleted_branch_with_surviving_snapshot_is_stale() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("memjectives", "widget/body.md", "feat/deleted", "snap\n")

    result = _build(
        gateway,
        live_branches=(),
        pr_gateway=FakePRGateway(
            prs_by_branch={"feat/deleted": _pr(branch="feat/deleted", state="MERGED")}
        ),
    )

    [branch] = result.branches
    assert branch.branch == "feat/deleted"
    assert branch.stale is True
    assert branch.pr.action == "merged"


def test_missing_pr_maps_to_no_pr() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("memjectives", "widget/body.md", "feat/no-pr", "snap\n")

    result = _build(gateway, live_branches=("feat/no-pr",))

    [branch] = result.branches
    assert branch.pr.action == "no_pr"
    assert branch.pr.number is None
    assert branch.pr.state is None
    assert branch.pr.title is None
    assert branch.pr.url is None
    assert branch.pr.error_stderr is None


def test_non_no_pr_lookup_failure_maps_to_error() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("memjectives", "widget/body.md", "feat/broken", "snap\n")

    result = _build(
        gateway,
        live_branches=("feat/broken",),
        pr_gateway=_BrokenPRGateway(),
    )

    [branch] = result.branches
    assert branch.pr.action == "error"
    assert branch.pr.number is None
    assert branch.pr.error_stderr == "auth failed"


def test_master_is_never_emitted_as_a_branch_node() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("memjectives", "widget/body.md", "master", "seed\n")
    gateway.put("memjectives", "widget/notes.md", "master", "notes\n")
    gateway.put("memjectives", "widget/body.md", "feat/x", "snap\n")

    result = _build(gateway, live_branches=("master", "feat/x"))

    assert result.seed_present is True
    assert [branch.branch for branch in result.branches] == ["feat/x"]


def test_branches_are_sorted_alphabetically() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("memjectives", "widget/body.md", "feat/b", "snap\n")
    gateway.put("memjectives", "widget/body.md", "feat/a", "snap\n")

    result = _build(gateway, live_branches=("feat/a", "feat/b"))

    assert [branch.branch for branch in result.branches] == ["feat/a", "feat/b"]


def test_merge_provenance_threads_through_merged_pr() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("memjectives", "widget/body.md", "feat/x", "snap\n")
    pr = PRSummary(
        number=42,
        title="t",
        url="u",
        head_ref_name="feat/x",
        base_ref_name="master",
        state="MERGED",
        merged_at="2026-04-01T12:00:00Z",
        merge_commit_oid="deadbeef",
    )

    result = _build(
        gateway,
        live_branches=("feat/x",),
        pr_gateway=FakePRGateway(prs_by_branch={"feat/x": pr}),
    )

    [branch] = result.branches
    assert branch.pr.merged_at == "2026-04-01T12:00:00Z"
    assert branch.pr.merge_commit_oid == "deadbeef"


def test_merge_provenance_is_none_for_non_merged_pr() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("memjectives", "widget/body.md", "feat/x", "snap\n")

    result = _build(
        gateway,
        live_branches=("feat/x",),
        pr_gateway=FakePRGateway(prs_by_branch={"feat/x": _pr(branch="feat/x", state="OPEN")}),
    )

    [branch] = result.branches
    assert branch.pr.merged_at is None
    assert branch.pr.merge_commit_oid is None


def test_merge_provenance_is_none_when_pr_missing() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("memjectives", "widget/body.md", "feat/no-pr", "snap\n")

    result = _build(gateway, live_branches=("feat/no-pr",))

    [branch] = result.branches
    assert branch.pr.action == "no_pr"
    assert branch.pr.merged_at is None
    assert branch.pr.merge_commit_oid is None


def test_merge_provenance_is_none_when_pr_lookup_fails() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("memjectives", "widget/body.md", "feat/broken", "snap\n")

    result = _build(
        gateway,
        live_branches=("feat/broken",),
        pr_gateway=_BrokenPRGateway(),
    )

    [branch] = result.branches
    assert branch.pr.action == "error"
    assert branch.pr.merged_at is None
    assert branch.pr.merge_commit_oid is None
