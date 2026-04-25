from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from click.testing import CliRunner

from twerk_core.brmem.fake import FakeBranchMemoryGateway
from twerk_core.clinkr.context import ClinkrContextObject, build_clinkr_context_object
from twerk_core.clinkr.group import ClinkrGroup
from twerk_core.gh.pr_gateway import PRGateway
from twerk_core.gh.pr_testing import FakePRGateway
from twerk_core.gh.types import PRLookupError, PRSummary
from twerk_core.git.testing import FakeGitGateway
from twerk_core.memjective.context import MemjectiveCliContext
from twerk_core.memjective.main import build_cli


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def _make_obj(
    *,
    gateway: FakeBranchMemoryGateway,
    branch: str = "feat/x",
    live_branches: tuple[str, ...] = (),
    pr_gateway: PRGateway | None = None,
) -> ClinkrContextObject:
    git = FakeGitGateway(
        current_branch_by_path={Path.cwd(): branch},
        branches=live_branches,
    )
    ctx = MemjectiveCliContext(
        brmem_gateway=gateway,
        git_gateway=git,
        pr_gateway=pr_gateway if pr_gateway is not None else FakePRGateway(),
    )
    return build_clinkr_context_object(lambda: ctx)


def _seed_root(gateway: FakeBranchMemoryGateway, slug: str) -> None:
    gateway.put("memjectives", f"{slug}/body.md", "master", "seed\n")


def _seed_branch_snapshot(
    gateway: FakeBranchMemoryGateway, slug: str, branch: str, content: str = "snap\n"
) -> None:
    gateway.put("memjectives", f"{slug}/body.md", branch, content)


def _seed_state(
    gateway: FakeBranchMemoryGateway,
    slug: str,
    payload: dict[str, Any] | str,
) -> None:
    blob = payload if isinstance(payload, str) else json.dumps(payload)
    gateway.put("memjective-state", f"{slug}/state.json", "master", blob)


def _state_payload(slug: str, entries: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "version": 1,
        "slug": slug,
        "root": {"namespace": "memjectives", "branch": "master", "path": slug},
        "entries": entries,
    }


def _data(output: str) -> dict[str, Any]:
    payload = json.loads(output)
    assert "data" in payload, payload
    return payload["data"]


def _pr(
    *,
    number: int,
    state: str,
    head: str,
    title: str = "t",
    url: str | None = None,
    base: str = "master",
    merged_at: str | None = None,
    merge_commit_oid: str | None = None,
) -> PRSummary:
    return PRSummary(
        number=number,
        title=title,
        url=url if url is not None else f"https://example.com/pull/{number}",
        head_ref_name=head,
        base_ref_name=base,
        state=state,  # type: ignore[arg-type]
        merged_at=merged_at,
        merge_commit_oid=merge_commit_oid,
    )


# ---------------------------------------------------------------------------
# help / schema
# ---------------------------------------------------------------------------


def test_compute_pending_entries_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "compute-pending-entries", "-h"])

    assert result.exit_code == 0
    assert "Usage: memjective exec compute-pending-entries" in result.output
    assert "SLUG" in result.output


def test_compute_pending_entries_schema_flag_is_eager(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "compute-pending-entries", "--schema"])
    payload = json.loads(result.stdout)

    assert result.exit_code == 0, result.output
    assert set(payload) == {"input_schema", "output_schema"}


# ---------------------------------------------------------------------------
# pending
# ---------------------------------------------------------------------------


def test_merged_pr_with_no_stored_entry_yields_pending(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    _seed_root(gateway, "widget")
    _seed_branch_snapshot(gateway, "widget", "feat/example")
    _seed_state(gateway, "widget", _state_payload("widget", entries=[]))
    obj = _make_obj(
        gateway=gateway,
        live_branches=("master", "feat/example"),
        pr_gateway=FakePRGateway(
            prs_by_branch={
                "feat/example": _pr(
                    number=123,
                    state="MERGED",
                    head="feat/example",
                    merged_at="2026-04-01T12:00:00Z",
                    merge_commit_oid="abc",
                ),
            },
        ),
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "compute-pending-entries", "widget", "--format", "json"],
        obj=obj,
    )
    data = _data(result.output)

    assert result.exit_code == 0, result.output
    assert len(data["pending_entries"]) == 1
    [entry] = data["pending_entries"]
    assert entry["id"] == "pr-123"
    assert entry["origin"] == "computed"
    assert entry["action"] == "incorporate"
    assert entry["candidate_entry"] == {
        "id": "pr-123",
        "kind": "pull_request",
        "pr_number": 123,
    }
    [read] = entry["recommended_reads"]
    assert read["namespace"] == "memjectives"
    assert read["branch"] == "feat/example"
    assert read["path"] == "widget"
    assert read["tree_sha"] is not None
    assert read["tree_sha"].startswith("faketree-")
    assert data["blocked_entries"] == []
    assert data["ignored_entries"] == []
    assert data["errors"] == []


def test_re_run_after_record_entry_omits_pending(cli_group: ClinkrGroup) -> None:
    """Once the merged PR is recorded in state, it must drop out of pending_entries."""
    gateway = FakeBranchMemoryGateway()
    _seed_root(gateway, "widget")
    _seed_branch_snapshot(gateway, "widget", "feat/example")
    _seed_state(
        gateway,
        "widget",
        _state_payload(
            "widget",
            entries=[
                {
                    "id": "pr-123",
                    "resolution": "incorporated",
                    "pr": {"number": 123, "state": "MERGED"},
                }
            ],
        ),
    )
    obj = _make_obj(
        gateway=gateway,
        live_branches=("master", "feat/example"),
        pr_gateway=FakePRGateway(
            prs_by_branch={
                "feat/example": _pr(number=123, state="MERGED", head="feat/example"),
            },
        ),
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "compute-pending-entries", "widget", "--format", "json"],
        obj=obj,
    )
    data = _data(result.output)

    assert result.exit_code == 0, result.output
    assert data["pending_entries"] == []


def test_pending_entry_for_deleted_branch_with_surviving_snapshot(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    _seed_root(gateway, "widget")
    _seed_branch_snapshot(gateway, "widget", "feat/deleted")
    _seed_state(gateway, "widget", _state_payload("widget", entries=[]))
    obj = _make_obj(
        gateway=gateway,
        live_branches=("master",),  # feat/deleted no longer a live branch
        pr_gateway=FakePRGateway(
            prs_by_branch={
                "feat/deleted": _pr(
                    number=123,
                    state="MERGED",
                    head="feat/deleted",
                    merged_at="2026-04-01T12:00:00Z",
                    merge_commit_oid="xyz",
                ),
            },
        ),
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "compute-pending-entries", "widget", "--format", "json"],
        obj=obj,
        # CWD is feat/x but slug-resolution falls back to provided slug, so explicit.
    )
    data = _data(result.output)

    assert result.exit_code == 0, result.output
    [entry] = data["pending_entries"]
    [read] = entry["recommended_reads"]
    assert read["branch"] == "feat/deleted"
    assert read["path"] == "widget"
    assert read["tree_sha"] is not None


def test_merged_pr_without_brmem_snapshot_for_slug_yields_error(
    cli_group: ClinkrGroup,
) -> None:
    """Hard diagnostic when a merged PR's branch is in the tree but its `<slug>/`
    subtree is gone (snapshot deleted, race condition, etc.). The writer needs
    durable provenance to incorporate the entry — silent skip is not safe.

    Construct the inconsistency by overriding ``get_tree_sha`` to return ``None``
    even though the branch carries ``<slug>/`` entries that put it into
    ``tree_model.branches``.
    """

    class _NoTreeShaGateway(FakeBranchMemoryGateway):
        def get_tree_sha(self, namespace: str | None, branch: str, path: str) -> str | None:
            if branch != "master":
                return None
            return super().get_tree_sha(namespace, branch, path)

    gateway = _NoTreeShaGateway()
    _seed_root(gateway, "widget")
    _seed_branch_snapshot(gateway, "widget", "feat/no-snap")
    _seed_state(gateway, "widget", _state_payload("widget", entries=[]))
    obj = _make_obj(
        gateway=gateway,
        live_branches=("master", "feat/no-snap"),
        pr_gateway=FakePRGateway(
            prs_by_branch={
                "feat/no-snap": _pr(number=42, state="MERGED", head="feat/no-snap"),
            },
        ),
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "compute-pending-entries", "widget", "--format", "json"],
        obj=obj,
    )
    data = _data(result.output)

    assert result.exit_code == 0, result.output
    assert data["pending_entries"] == []
    [err] = data["errors"]
    assert err["kind"] == "missing_brmem_snapshot_for_merged_pr"
    assert err["branch"] == "feat/no-snap"
    assert err["pr_number"] == 42


# ---------------------------------------------------------------------------
# blocked / ignored
# ---------------------------------------------------------------------------


def test_closed_unmerged_pr_without_skipped_entry_is_blocked(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    _seed_root(gateway, "widget")
    _seed_branch_snapshot(gateway, "widget", "feat/closed")
    _seed_state(gateway, "widget", _state_payload("widget", entries=[]))
    obj = _make_obj(
        gateway=gateway,
        live_branches=("master", "feat/closed"),
        pr_gateway=FakePRGateway(
            prs_by_branch={"feat/closed": _pr(number=124, state="CLOSED", head="feat/closed")},
        ),
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "compute-pending-entries", "widget", "--format", "json"],
        obj=obj,
    )
    data = _data(result.output)

    assert result.exit_code == 0, result.output
    assert data["pending_entries"] == []
    [blocked] = data["blocked_entries"]
    assert blocked["id"] == "pr-124"
    assert blocked["action"] == "decide_skip"


def test_closed_unmerged_pr_with_skipped_entry_is_omitted(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    _seed_root(gateway, "widget")
    _seed_branch_snapshot(gateway, "widget", "feat/closed")
    _seed_state(
        gateway,
        "widget",
        _state_payload(
            "widget",
            entries=[
                {
                    "id": "pr-124",
                    "resolution": "skipped",
                    "pr": {"number": 124, "state": "CLOSED"},
                }
            ],
        ),
    )
    obj = _make_obj(
        gateway=gateway,
        live_branches=("master", "feat/closed"),
        pr_gateway=FakePRGateway(
            prs_by_branch={"feat/closed": _pr(number=124, state="CLOSED", head="feat/closed")},
        ),
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "compute-pending-entries", "widget", "--format", "json"],
        obj=obj,
    )
    data = _data(result.output)

    assert result.exit_code == 0, result.output
    assert data["pending_entries"] == []
    assert data["blocked_entries"] == []


def test_open_pr_is_ignored(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    _seed_root(gateway, "widget")
    _seed_branch_snapshot(gateway, "widget", "feat/open")
    _seed_state(gateway, "widget", _state_payload("widget", entries=[]))
    obj = _make_obj(
        gateway=gateway,
        live_branches=("master", "feat/open"),
        pr_gateway=FakePRGateway(
            prs_by_branch={"feat/open": _pr(number=125, state="OPEN", head="feat/open")},
        ),
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "compute-pending-entries", "widget", "--format", "json"],
        obj=obj,
    )
    data = _data(result.output)

    assert result.exit_code == 0, result.output
    assert data["pending_entries"] == []
    [ignored] = data["ignored_entries"]
    assert ignored["id"] == "pr-125"
    assert ignored["reason"] == "PR is still open"


def test_branch_with_no_pr_is_ignored(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    _seed_root(gateway, "widget")
    _seed_branch_snapshot(gateway, "widget", "feat/orphan")
    _seed_state(gateway, "widget", _state_payload("widget", entries=[]))
    obj = _make_obj(
        gateway=gateway,
        live_branches=("master", "feat/orphan"),
        pr_gateway=FakePRGateway(),
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "compute-pending-entries", "widget", "--format", "json"],
        obj=obj,
    )
    data = _data(result.output)

    assert result.exit_code == 0, result.output
    [ignored] = data["ignored_entries"]
    assert ignored["id"] == "branch-feat/orphan"
    assert ignored["reason"] == "branch has no associated PR"


# ---------------------------------------------------------------------------
# errors
# ---------------------------------------------------------------------------


def test_missing_root_memjective_yields_error(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    _seed_branch_snapshot(gateway, "widget", "feat/example")
    _seed_state(gateway, "widget", _state_payload("widget", entries=[]))
    obj = _make_obj(
        gateway=gateway,
        live_branches=("master", "feat/example"),
        pr_gateway=FakePRGateway(),
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "compute-pending-entries", "widget", "--format", "json"],
        obj=obj,
    )
    data = _data(result.output)

    assert result.exit_code == 0, result.output
    kinds = [err["kind"] for err in data["errors"]]
    assert "missing_root_memjective" in kinds


def test_invalid_state_yields_error_but_pending_still_computed(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    _seed_root(gateway, "widget")
    _seed_branch_snapshot(gateway, "widget", "feat/example")
    _seed_state(gateway, "widget", "{not json")
    obj = _make_obj(
        gateway=gateway,
        live_branches=("master", "feat/example"),
        pr_gateway=FakePRGateway(
            prs_by_branch={
                "feat/example": _pr(number=123, state="MERGED", head="feat/example"),
            },
        ),
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "compute-pending-entries", "widget", "--format", "json"],
        obj=obj,
    )
    data = _data(result.output)

    assert result.exit_code == 0, result.output
    invalid = next(err for err in data["errors"] if err["kind"] == "invalid_state")
    assert invalid["reason"]
    # Pending bucket still computed for the unaffected branch.
    assert len(data["pending_entries"]) == 1


def test_branch_pr_identity_conflict_yields_error(cli_group: ClinkrGroup) -> None:
    class _SharedNumberPRGateway(FakePRGateway):
        def __init__(self) -> None:
            super().__init__()
            self._number = 777

        def get_pr_for_branch(self, branch: str) -> PRSummary | PRLookupError:
            if branch in ("feat/a", "feat/b"):
                return _pr(
                    number=self._number,
                    state="OPEN",
                    head=branch,
                    title=f"shared {branch}",
                )
            return PRLookupError(stderr="no PR found", returncode=1)

    gateway = FakeBranchMemoryGateway()
    _seed_root(gateway, "widget")
    _seed_branch_snapshot(gateway, "widget", "feat/a")
    _seed_branch_snapshot(gateway, "widget", "feat/b")
    _seed_state(gateway, "widget", _state_payload("widget", entries=[]))
    obj = _make_obj(
        gateway=gateway,
        live_branches=("master", "feat/a", "feat/b"),
        pr_gateway=_SharedNumberPRGateway(),
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "compute-pending-entries", "widget", "--format", "json"],
        obj=obj,
    )
    data = _data(result.output)

    assert result.exit_code == 0, result.output
    conflict = next(err for err in data["errors"] if err["kind"] == "branch_pr_identity_conflict")
    assert conflict["pr_number"] == 777
    assert conflict["branches"] == ["feat/a", "feat/b"]


def test_pr_lookup_error_yields_error(cli_group: ClinkrGroup) -> None:
    class _BrokenPRGateway(FakePRGateway):
        def get_pr_for_branch(self, branch: str) -> PRSummary | PRLookupError:
            return PRLookupError(stderr="auth failed", returncode=4)

    gateway = FakeBranchMemoryGateway()
    _seed_root(gateway, "widget")
    _seed_branch_snapshot(gateway, "widget", "feat/example")
    _seed_state(gateway, "widget", _state_payload("widget", entries=[]))
    obj = _make_obj(
        gateway=gateway,
        live_branches=("master", "feat/example"),
        pr_gateway=_BrokenPRGateway(),
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "compute-pending-entries", "widget", "--format", "json"],
        obj=obj,
    )
    data = _data(result.output)

    assert result.exit_code == 0, result.output
    err = next(err for err in data["errors"] if err["kind"] == "pr_lookup_error")
    assert err["branch"] == "feat/example"
    assert err["stderr"] == "auth failed"


def test_root_provenance_is_emitted(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    _seed_root(gateway, "widget")
    _seed_state(gateway, "widget", _state_payload("widget", entries=[]))
    obj = _make_obj(
        gateway=gateway,
        live_branches=("master",),
        pr_gateway=FakePRGateway(),
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "compute-pending-entries", "widget", "--format", "json"],
        obj=obj,
    )
    data = _data(result.output)

    assert result.exit_code == 0, result.output
    assert data["root"]["namespace"] == "memjectives"
    assert data["root"]["branch"] == "master"
    assert data["root"]["path"] == "widget"
    assert data["root"]["tree_sha"] is not None
    assert data["root"]["tree_sha"].startswith("faketree-")
