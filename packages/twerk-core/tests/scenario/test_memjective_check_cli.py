from __future__ import annotations

import json
from pathlib import Path

import pytest
from click.testing import CliRunner

from twerk_core.brmem.fake import FakeBranchMemoryGateway
from twerk_core.clinkr.context import ClinkrContextObject, build_clinkr_context_object
from twerk_core.clinkr.group import ClinkrGroup
from twerk_core.gh.pr_gateway import PRGateway
from twerk_core.gh.pr_testing import FakePRGateway
from twerk_core.gh.types import PRLookupError, PRState, PRSummary
from twerk_core.git.testing import FakeGitGateway
from twerk_core.memjective.context import MemjectiveCliContext
from twerk_core.memjective.main import build_cli
from twerk_core.memjective.state import MEMJECTIVE_STATE_NAMESPACE


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def _pr(
    *,
    branch: str,
    state: PRState,
    number: int = 123,
    title: str = "Widget slice",
    url: str = "https://example.com/pull/123",
    base: str = "master",
) -> PRSummary:
    return PRSummary(
        number=number,
        title=title,
        url=url,
        head_ref_name=branch,
        base_ref_name=base,
        state=state,
    )


def _make_obj(
    *,
    gateway: FakeBranchMemoryGateway | None = None,
    branch: str = "feat/x",
    live_branches: tuple[str, ...] = (),
    pr_gateway: PRGateway | None = None,
) -> ClinkrContextObject:
    brmem_gateway = gateway if gateway is not None else FakeBranchMemoryGateway()
    ctx = MemjectiveCliContext(
        brmem_gateway=brmem_gateway,
        git_gateway=FakeGitGateway(
            current_branch_by_path={Path.cwd(): branch},
            branches=live_branches,
        ),
        pr_gateway=pr_gateway if pr_gateway is not None else FakePRGateway(),
    )
    return build_clinkr_context_object(lambda: ctx)


def _state_payload(*, entries: list[dict], slug: str = "widget") -> str:
    return json.dumps(
        {
            "version": 1,
            "slug": slug,
            "root": {
                "namespace": "memjectives",
                "branch": "master",
                "path": slug,
            },
            "entries": entries,
        }
    )


def _stored_pr_entry(
    *,
    pr: PRSummary,
    status: str,
    entry_id: str | None = None,
) -> dict:
    return {
        "id": entry_id if entry_id is not None else f"pr-{pr.number}",
        "kind": "pull_request",
        "pr": {
            "number": pr.number,
            "state": pr.state,
            "title": pr.title,
            "url": pr.url,
            "head_ref_name": pr.head_ref_name,
            "base_ref_name": pr.base_ref_name,
        },
        "resolution": {"status": status},
    }


def _seed_widget_root(gateway: FakeBranchMemoryGateway) -> None:
    gateway.put("memjectives", "widget/body.md", "master", "seed\n")


class _BrokenPRGateway(FakePRGateway):
    def get_pr_for_branch(self, branch: str) -> PRSummary | PRLookupError:
        return PRLookupError(stderr="auth failed", returncode=4)


def test_check_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["check", "-h"])

    assert result.exit_code == 0
    assert "Usage: memjective check" in result.output
    assert "Check reconciliation state for a memjective" in result.output
    assert "SLUG" in result.output


def test_check_schema_flag_is_eager(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["check", "--schema"])
    payload = json.loads(result.stdout)

    assert result.exit_code == 0, result.output
    assert set(payload) == {"input_schema", "output_schema"}


def test_check_seed_only_absent_state_is_caught_up(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    _seed_widget_root(gateway)
    obj = _make_obj(gateway=gateway, live_branches=("master",))

    result = CliRunner().invoke(cli_group, ["check", "widget", "--format", "json"], obj=obj)
    payload = json.loads(result.output)

    assert result.exit_code == 0, result.output
    data = payload["data"]
    assert data["root"] == {
        "namespace": "memjectives",
        "branch": "master",
        "path": "widget",
        "exists": True,
    }
    assert data["state"]["status"] == "absent"
    assert data["state"]["entry_count"] == 0
    assert data["stored_entries"] == []
    assert all(not bucket for bucket in data["buckets"].values())

    human = CliRunner().invoke(cli_group, ["check", "widget"], obj=obj)
    assert human.exit_code == 0, human.output
    assert "status: caught up" in human.output


def test_check_merged_pr_without_state_needs_incorporation(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    _seed_widget_root(gateway)
    gateway.put("memjectives", "widget/body.md", "feat/merged", "branch\n")
    pr = _pr(branch="feat/merged", state="MERGED")
    obj = _make_obj(
        gateway=gateway,
        live_branches=("master", "feat/merged"),
        pr_gateway=FakePRGateway(prs_by_branch={"feat/merged": pr}),
    )

    result = CliRunner().invoke(cli_group, ["check", "widget", "--format", "json"], obj=obj)
    data = json.loads(result.output)["data"]

    assert result.exit_code == 0, result.output
    [item] = data["buckets"]["merged_pending_incorporation"]
    assert item["id"] == "pr-123"
    assert item["recommended_action"] == "incorporate"
    assert item["source"] == {
        "namespace": "memjectives",
        "branch": "feat/merged",
        "path": "widget",
        "stale": False,
    }
    assert item["pr"] == {
        "number": 123,
        "state": "MERGED",
        "title": "Widget slice",
        "url": "https://example.com/pull/123",
        "head_ref_name": "feat/merged",
        "base_ref_name": "master",
        "error_stderr": None,
    }


def test_check_merged_pr_with_incorporated_state_is_recorded(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    _seed_widget_root(gateway)
    gateway.put("memjectives", "widget/body.md", "feat/merged", "branch\n")
    pr = _pr(branch="feat/merged", state="MERGED")
    gateway.put(
        MEMJECTIVE_STATE_NAMESPACE,
        "widget/state.json",
        "master",
        _state_payload(entries=[_stored_pr_entry(pr=pr, status="incorporated")]),
    )
    obj = _make_obj(
        gateway=gateway,
        live_branches=("master", "feat/merged"),
        pr_gateway=FakePRGateway(prs_by_branch={"feat/merged": pr}),
    )

    result = CliRunner().invoke(cli_group, ["check", "widget", "--format", "json"], obj=obj)
    data = json.loads(result.output)["data"]

    assert result.exit_code == 0, result.output
    assert data["state"]["status"] == "loaded"
    assert data["state"]["entry_count"] == 1
    assert data["buckets"]["merged_pending_incorporation"] == []
    [item] = data["buckets"]["merged_incorporated"]
    assert item["id"] == "pr-123"
    assert item["recommended_action"] == "none"
    assert item["stored_entry"]["resolution"]["status"] == "incorporated"


def test_check_stale_incorporated_state_is_reported(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    _seed_widget_root(gateway)
    gateway.put("memjectives", "widget/body.md", "feat/merged", "branch\n")
    recorded_pr = _pr(branch="feat/merged", state="MERGED", title="Old title")
    current_pr = _pr(branch="feat/merged", state="MERGED", title="New title")
    gateway.put(
        MEMJECTIVE_STATE_NAMESPACE,
        "widget/state.json",
        "master",
        _state_payload(entries=[_stored_pr_entry(pr=recorded_pr, status="incorporated")]),
    )
    obj = _make_obj(
        gateway=gateway,
        live_branches=("master", "feat/merged"),
        pr_gateway=FakePRGateway(prs_by_branch={"feat/merged": current_pr}),
    )

    result = CliRunner().invoke(cli_group, ["check", "widget", "--format", "json"], obj=obj)
    data = json.loads(result.output)["data"]

    assert result.exit_code == 0, result.output
    [item] = data["buckets"]["stale_incorporation_entries"]
    assert item["id"] == "pr-123"
    assert item["stored_entry"]["pr"]["title"] == "Old title"
    assert item["pr"]["title"] == "New title"


def test_check_closed_pr_needs_skip_decision(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    _seed_widget_root(gateway)
    gateway.put("memjectives", "widget/body.md", "feat/closed", "branch\n")
    pr = _pr(branch="feat/closed", state="CLOSED")
    obj = _make_obj(
        gateway=gateway,
        live_branches=("master", "feat/closed"),
        pr_gateway=FakePRGateway(prs_by_branch={"feat/closed": pr}),
    )

    result = CliRunner().invoke(cli_group, ["check", "widget", "--format", "json"], obj=obj)
    data = json.loads(result.output)["data"]

    assert result.exit_code == 0, result.output
    [item] = data["buckets"]["closed_needs_skip_decision"]
    assert item["id"] == "pr-123"
    assert item["recommended_action"] == "decide_skip"


def test_check_closed_pr_with_skipped_state_is_recorded(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    _seed_widget_root(gateway)
    gateway.put("memjectives", "widget/body.md", "feat/closed", "branch\n")
    pr = _pr(branch="feat/closed", state="CLOSED")
    gateway.put(
        MEMJECTIVE_STATE_NAMESPACE,
        "widget/state.json",
        "master",
        _state_payload(entries=[_stored_pr_entry(pr=pr, status="skipped")]),
    )
    obj = _make_obj(
        gateway=gateway,
        live_branches=("master", "feat/closed"),
        pr_gateway=FakePRGateway(prs_by_branch={"feat/closed": pr}),
    )

    result = CliRunner().invoke(cli_group, ["check", "widget", "--format", "json"], obj=obj)
    data = json.loads(result.output)["data"]

    assert result.exit_code == 0, result.output
    assert data["buckets"]["closed_needs_skip_decision"] == []
    [item] = data["buckets"]["closed_skipped"]
    assert item["id"] == "pr-123"
    assert item["recommended_action"] == "none"


def test_check_open_and_local_branches_are_not_eligible(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    _seed_widget_root(gateway)
    gateway.put("memjectives", "widget/body.md", "feat/local", "branch\n")
    gateway.put("memjectives", "widget/body.md", "feat/open", "branch\n")
    open_pr = _pr(branch="feat/open", state="OPEN", number=456)
    obj = _make_obj(
        gateway=gateway,
        live_branches=("master", "feat/local", "feat/open"),
        pr_gateway=FakePRGateway(prs_by_branch={"feat/open": open_pr}),
    )

    result = CliRunner().invoke(cli_group, ["check", "widget", "--format", "json"], obj=obj)
    data = json.loads(result.output)["data"]

    assert result.exit_code == 0, result.output
    items = data["buckets"]["tracked_not_eligible"]
    assert {item["id"] for item in items} == {"branch-feat/local", "pr-456"}
    assert {item["recommended_action"] for item in items} == {"wait"}


def test_check_state_parse_error_is_reported(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    _seed_widget_root(gateway)
    gateway.put(MEMJECTIVE_STATE_NAMESPACE, "widget/state.json", "master", "{not json")
    obj = _make_obj(gateway=gateway, live_branches=("master",))

    result = CliRunner().invoke(cli_group, ["check", "widget", "--format", "json"], obj=obj)
    data = json.loads(result.output)["data"]

    assert result.exit_code == 0, result.output
    assert data["state"]["status"] == "invalid"
    [error] = data["buckets"]["lookup_or_state_errors"]
    assert error["kind"] == "state_parse_error"
    assert "invalid JSON" in error["message"]


def test_check_pr_lookup_error_is_reported(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    _seed_widget_root(gateway)
    gateway.put("memjectives", "widget/body.md", "feat/broken", "branch\n")
    obj = _make_obj(
        gateway=gateway,
        live_branches=("master", "feat/broken"),
        pr_gateway=_BrokenPRGateway(),
    )

    result = CliRunner().invoke(cli_group, ["check", "widget", "--format", "json"], obj=obj)
    data = json.loads(result.output)["data"]

    assert result.exit_code == 0, result.output
    [error] = data["buckets"]["lookup_or_state_errors"]
    assert error["kind"] == "pr_lookup_error"
    assert error["message"] == "auth failed"
    assert error["item"]["id"] == "branch-feat/broken"


def test_check_unknown_slug_is_negative(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(live_branches=("master",))

    result = CliRunner().invoke(
        cli_group,
        ["check", "does-not-exist", "--format", "json"],
        obj=obj,
    )
    payload = json.loads(result.output)

    assert result.exit_code == 1
    assert payload["message"] == "No memjective found for slug 'does-not-exist'."
    assert payload["data"]["root"]["exists"] is False
    assert payload["data"]["state"]["status"] == "absent"
