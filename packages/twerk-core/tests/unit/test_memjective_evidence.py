from __future__ import annotations

from typing import Any

from twerk_core.brmem.fake import FakeBranchMemoryGateway
from twerk_core.gh.pr_gateway import PRGateway
from twerk_core.gh.pr_testing import FakePRGateway
from twerk_core.gh.types import PRLookupError, PRState, PRSummary
from twerk_core.git.git_gateway import GitGateway
from twerk_core.git.testing import FakeGitGateway
from twerk_core.memjective.evidence import (
    BranchEvidence,
    EvidenceBundle,
    PrEvidence,
    SourceEvidence,
    classify_branch_incorporation_state,
    compute_evidence,
)
from twerk_core.memjective.state import (
    MemjectiveState,
    StateAbsent,
    StateEntry,
    StateInvalid,
    StateRoot,
)


def _pr(
    *,
    branch: str,
    state: PRState,
    number: int = 42,
    merged_at: str | None = None,
    merge_commit_oid: str | None = None,
) -> PRSummary:
    return PRSummary(
        number=number,
        title="t",
        url=f"https://example.com/pull/{number}",
        head_ref_name=branch,
        base_ref_name="master",
        state=state,
        merged_at=merged_at,
        merge_commit_oid=merge_commit_oid,
    )


def _build(
    gateway: FakeBranchMemoryGateway,
    *,
    slug: str = "widget",
    live_branches: tuple[str, ...] = (),
    pr_gateway: PRGateway | None = None,
    git_gateway: GitGateway | None = None,
) -> EvidenceBundle:
    git = git_gateway if git_gateway is not None else FakeGitGateway(branches=live_branches)
    return compute_evidence(
        slug=slug,
        brmem_gateway=gateway,
        git_gateway=git,
        pr_gateway=pr_gateway if pr_gateway is not None else FakePRGateway(),
    )


def test_root_tree_sha_populated_when_seed_present() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("memjectives", "widget/body.md", "master", "seed\n")

    bundle = _build(gateway, live_branches=("master",))

    assert bundle.root.exists is True
    assert bundle.root.tree_sha is not None
    assert bundle.root.tree_sha.startswith("faketree-")


def test_root_tree_sha_none_when_seed_absent() -> None:
    gateway = FakeBranchMemoryGateway()

    bundle = _build(gateway)

    assert bundle.root.exists is False
    assert bundle.root.tree_sha is None


def test_source_tree_sha_populated_for_branch_snapshot() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("memjectives", "widget/body.md", "master", "seed\n")
    gateway.put("memjectives", "widget/body.md", "feat/x", "snap\n")

    bundle = _build(
        gateway,
        live_branches=("master", "feat/x"),
        pr_gateway=FakePRGateway(prs_by_branch={"feat/x": _pr(branch="feat/x", state="OPEN")}),
    )

    [branch] = bundle.branches
    assert branch.source.tree_sha is not None
    assert branch.source.tree_sha.startswith("faketree-")


def test_stale_branch_still_yields_tree_sha_when_snapshot_survives() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("memjectives", "widget/body.md", "master", "seed\n")
    gateway.put("memjectives", "widget/body.md", "feat/deleted", "snap\n")

    bundle = _build(
        gateway,
        # Note: feat/deleted is NOT in live_branches.
        live_branches=("master",),
        pr_gateway=FakePRGateway(
            prs_by_branch={
                "feat/deleted": _pr(
                    branch="feat/deleted",
                    state="MERGED",
                    merged_at="2026-04-01T12:00:00Z",
                    merge_commit_oid="abc123",
                ),
            },
        ),
    )

    [branch] = bundle.branches
    assert branch.source.stale is True
    assert branch.source.tree_sha is not None


def test_pr_evidence_carries_merge_provenance() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("memjectives", "widget/body.md", "master", "seed\n")
    gateway.put("memjectives", "widget/body.md", "feat/x", "snap\n")

    bundle = _build(
        gateway,
        live_branches=("master", "feat/x"),
        pr_gateway=FakePRGateway(
            prs_by_branch={
                "feat/x": _pr(
                    branch="feat/x",
                    state="MERGED",
                    merged_at="2026-04-01T12:00:00Z",
                    merge_commit_oid="abc123",
                ),
            },
        ),
    )

    [branch] = bundle.branches
    assert branch.pr.merged_at == "2026-04-01T12:00:00Z"
    assert branch.pr.merge_commit_oid == "abc123"


def test_matching_stored_entry_ids_threads_through() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("memjectives", "widget/body.md", "master", "seed\n")
    gateway.put("memjectives", "widget/body.md", "feat/x", "snap\n")
    gateway.put(
        "memjective-state",
        "widget/state.json",
        "master",
        '{"version": 1, "slug": "widget", '
        '"root": {"namespace": "memjectives", "branch": "master", "path": "widget"}, '
        '"entries": [{"id": "pr-42", "resolution": "incorporated", "pr": {"number": 42}}]}',
    )

    bundle = _build(
        gateway,
        live_branches=("master", "feat/x"),
        pr_gateway=FakePRGateway(prs_by_branch={"feat/x": _pr(branch="feat/x", state="MERGED")}),
    )

    [branch] = bundle.branches
    assert branch.matching_stored_entry_ids == ("pr-42",)


def test_matching_stored_entry_ids_empty_when_state_absent() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("memjectives", "widget/body.md", "master", "seed\n")
    gateway.put("memjectives", "widget/body.md", "feat/x", "snap\n")

    bundle = _build(
        gateway,
        live_branches=("master", "feat/x"),
        pr_gateway=FakePRGateway(prs_by_branch={"feat/x": _pr(branch="feat/x", state="MERGED")}),
    )

    assert not isinstance(bundle.state, MemjectiveState)
    [branch] = bundle.branches
    assert branch.matching_stored_entry_ids == ()


class _BrokenPRGateway(FakePRGateway):
    def get_pr_for_branch(self, branch: str) -> PRSummary | PRLookupError:
        return PRLookupError(stderr="auth failed", returncode=4)


def test_pr_lookup_error_surfaces_in_evidence() -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("memjectives", "widget/body.md", "master", "seed\n")
    gateway.put("memjectives", "widget/body.md", "feat/x", "snap\n")

    bundle = _build(
        gateway,
        live_branches=("master", "feat/x"),
        pr_gateway=_BrokenPRGateway(),
    )

    [branch] = bundle.branches
    assert branch.pr.lookup_status == "error"
    assert branch.pr.error_stderr == "auth failed"


# ---------------------------------------------------------------------------
# classify_branch_incorporation_state — one fabricated case per bucket.
# ---------------------------------------------------------------------------


def _branch(
    *,
    branch_name: str = "feat/x",
    lookup_status: str = "found",
    pr_state: PRState | None = "OPEN",
    pr_number: int | None = 42,
    matching_stored_entry_ids: tuple[str, ...] = (),
) -> BranchEvidence:
    return BranchEvidence(
        source=SourceEvidence(
            namespace="memjectives",
            branch=branch_name,
            path="widget",
            stale=False,
            tree_sha="faketree-1",
        ),
        pr=PrEvidence(
            lookup_status=lookup_status,  # type: ignore[arg-type]
            number=pr_number,
            state=pr_state,
            title="t",
            url="https://example.com/pull/42",
            head_ref_name=branch_name,
            base_ref_name="master",
            merged_at=None,
            merge_commit_oid=None,
            error_stderr=None,
        ),
        matching_stored_entry_ids=matching_stored_entry_ids,
    )


def _state_with(*entries: dict[str, Any]) -> MemjectiveState:
    return MemjectiveState(
        version=1,
        slug="widget",
        root=StateRoot(namespace="memjectives", branch="master", path="widget"),
        entries=tuple(StateEntry(id=entry["id"], raw=entry) for entry in entries),
    )


def test_classify_lookup_error() -> None:
    branch = _branch(lookup_status="error", pr_state=None, pr_number=None)
    assert classify_branch_incorporation_state(branch, StateAbsent()) == "lookup_error"


def test_classify_tracked_when_no_pr() -> None:
    branch = _branch(lookup_status="missing", pr_state=None, pr_number=None)
    assert classify_branch_incorporation_state(branch, StateAbsent()) == "tracked"


def test_classify_open() -> None:
    branch = _branch(pr_state="OPEN")
    assert classify_branch_incorporation_state(branch, StateAbsent()) == "open"


def test_classify_merged_pending_no_stored_entry() -> None:
    branch = _branch(pr_state="MERGED")
    assert (
        classify_branch_incorporation_state(branch, StateAbsent()) == "merged_pending_incorporation"
    )


def test_classify_merged_pending_when_only_tracked_entry_present() -> None:
    branch = _branch(pr_state="MERGED", matching_stored_entry_ids=("pr-42",))
    state = _state_with({"id": "pr-42", "resolution": "tracked", "pr": {"number": 42}})
    assert classify_branch_incorporation_state(branch, state) == "merged_pending_incorporation"


def test_classify_merged_incorporated() -> None:
    branch = _branch(pr_state="MERGED", matching_stored_entry_ids=("pr-42",))
    state = _state_with({"id": "pr-42", "resolution": "incorporated", "pr": {"number": 42}})
    assert classify_branch_incorporation_state(branch, state) == "merged_incorporated"


def test_classify_merged_incorporated_no_doc_change() -> None:
    branch = _branch(pr_state="MERGED", matching_stored_entry_ids=("pr-42",))
    state = _state_with(
        {"id": "pr-42", "resolution": "incorporated_no_doc_change", "pr": {"number": 42}},
    )
    assert classify_branch_incorporation_state(branch, state) == "merged_incorporated"


def test_classify_closed_needs_decision_no_entry() -> None:
    branch = _branch(pr_state="CLOSED")
    assert classify_branch_incorporation_state(branch, StateAbsent()) == "closed_needs_decision"


def test_classify_closed_skipped() -> None:
    branch = _branch(pr_state="CLOSED", matching_stored_entry_ids=("pr-42",))
    state = _state_with({"id": "pr-42", "resolution": "skipped", "pr": {"number": 42}})
    assert classify_branch_incorporation_state(branch, state) == "closed_skipped"


def test_classify_state_absent_merged_buckets_to_pending() -> None:
    branch = _branch(pr_state="MERGED")
    assert (
        classify_branch_incorporation_state(branch, StateAbsent()) == "merged_pending_incorporation"
    )


def test_classify_state_invalid_merged_buckets_to_pending() -> None:
    branch = _branch(pr_state="MERGED")
    assert (
        classify_branch_incorporation_state(branch, StateInvalid(reason="bad json"))
        == "merged_pending_incorporation"
    )


def test_classify_state_absent_closed_buckets_to_needs_decision() -> None:
    branch = _branch(pr_state="CLOSED")
    assert classify_branch_incorporation_state(branch, StateAbsent()) == "closed_needs_decision"


def test_classify_state_invalid_closed_buckets_to_needs_decision() -> None:
    branch = _branch(pr_state="CLOSED")
    assert (
        classify_branch_incorporation_state(branch, StateInvalid(reason="bad json"))
        == "closed_needs_decision"
    )
