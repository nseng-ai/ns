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
    ctx = MemjectiveCliContext(
        brmem_gateway=brmem_gateway,
        git_gateway=git_gateway,
        pr_gateway=pr_gateway if pr_gateway is not None else FakePRGateway(),
    )
    return build_clinkr_context_object(lambda: ctx)


class _BrokenPRGateway(FakePRGateway):
    """PR gateway whose every lookup fails with a non-1 return code."""

    def __init__(self, *, stderr: str = "auth failed", returncode: int = 4) -> None:
        super().__init__()
        self._stderr = stderr
        self._returncode = returncode

    def get_pr_for_branch(self, branch: str) -> PRSummary | PRLookupError:
        return PRLookupError(stderr=self._stderr, returncode=self._returncode)


class _SharedNumberPRGateway(FakePRGateway):
    """Reports the same PR number for every branch it knows about."""

    def __init__(self, *, branches: tuple[str, ...], number: int) -> None:
        super().__init__()
        self._branches = set(branches)
        self._number = number

    def get_pr_for_branch(self, branch: str) -> PRSummary | PRLookupError:
        if branch not in self._branches:
            return PRLookupError(stderr="no PR found", returncode=1)
        return _pr(
            number=self._number,
            title=f"shared on {branch}",
            url=f"https://example.com/pull/{self._number}",
            state="OPEN",
            head=branch,
        )


def _seed_state_blob(
    gateway: FakeBranchMemoryGateway,
    slug: str,
    payload: dict[str, Any] | str,
) -> None:
    if isinstance(payload, str):
        gateway.put("memjective-state", f"{slug}/state.json", "master", payload)
        return
    gateway.put("memjective-state", f"{slug}/state.json", "master", json.dumps(payload))


def _state_payload(slug: str, entries: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "version": 1,
        "slug": slug,
        "root": {"namespace": "memjectives", "branch": "master", "path": slug},
        "entries": entries,
    }


def _data(result_output: str) -> dict[str, Any]:
    payload = json.loads(result_output)
    assert "data" in payload, payload
    return payload["data"]


# ---------------------------------------------------------------------------
# help / schema
# ---------------------------------------------------------------------------


def test_check_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["check", "-h"])

    assert result.exit_code == 0
    assert "Usage: memjective check" in result.output
    assert "SLUG" in result.output


def test_check_schema_flag_is_eager(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["check", "--schema"])
    payload = json.loads(result.stdout)

    assert result.exit_code == 0, result.output
    assert set(payload) == {"input_schema", "output_schema"}


# ---------------------------------------------------------------------------
# baseline scenarios
# ---------------------------------------------------------------------------


def test_seed_only_with_absent_state(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("memjectives", "widget/body.md", "master", "seed\n")
    obj = _make_obj(gateway=gateway, live_branches=("master",))

    result = CliRunner().invoke(cli_group, ["check", "widget", "--format", "json"], obj=obj)
    data = _data(result.output)

    assert result.exit_code == 0, result.output
    assert data["slug"] == "widget"
    assert data["root"] == {
        "namespace": "memjectives",
        "branch": "master",
        "path": "widget",
        "exists": True,
    }
    assert data["state"]["status"] == "absent"
    assert data["state"]["error"] is None
    assert data["state"]["entries"] == []
    assert data["branches"] == []
    assert data["diagnostics"] == []


def test_missing_root_with_state_present(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    _seed_state_blob(gateway, "widget", _state_payload("widget", entries=[]))
    obj = _make_obj(gateway=gateway, live_branches=("master",))

    result = CliRunner().invoke(cli_group, ["check", "widget", "--format", "json"], obj=obj)
    data = _data(result.output)

    assert result.exit_code == 0, result.output
    assert data["root"]["exists"] is False
    assert data["state"]["status"] == "loaded"
    kinds = [d["kind"] for d in data["diagnostics"]]
    assert "missing_root_memjective" in kinds
    missing = next(d for d in data["diagnostics"] if d["kind"] == "missing_root_memjective")
    assert missing["namespace"] == "memjectives"
    assert missing["branch"] == "master"
    assert missing["path"] == "widget"


def test_invalid_state_diagnostic(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("memjectives", "widget/body.md", "master", "seed\n")
    _seed_state_blob(gateway, "widget", "{not json")
    obj = _make_obj(gateway=gateway, live_branches=("master",))

    result = CliRunner().invoke(cli_group, ["check", "widget", "--format", "json"], obj=obj)
    data = _data(result.output)

    assert result.exit_code == 0, result.output
    assert data["state"]["status"] == "invalid"
    assert data["state"]["error"]
    invalid = next(d for d in data["diagnostics"] if d["kind"] == "invalid_state")
    assert invalid["namespace"] == "memjective-state"
    assert invalid["branch"] == "master"
    assert invalid["key"] == "widget/state.json"
    assert invalid["reason"]


# ---------------------------------------------------------------------------
# PR lifecycle observations
# ---------------------------------------------------------------------------


def _seed_branch(slug: str, branch: str) -> FakeBranchMemoryGateway:
    gateway = FakeBranchMemoryGateway()
    gateway.put("memjectives", f"{slug}/body.md", "master", "seed\n")
    gateway.put("memjectives", f"{slug}/body.md", branch, "snap\n")
    return gateway


def test_merged_pr_observation_in_facts(cli_group: ClinkrGroup) -> None:
    gateway = _seed_branch("widget", "feat/example")
    obj = _make_obj(
        gateway=gateway,
        live_branches=("master", "feat/example"),
        pr_gateway=FakePRGateway(
            prs_by_branch={
                "feat/example": _pr(
                    number=123,
                    title="Widget slice",
                    url="https://example.com/pull/123",
                    state="MERGED",
                    head="feat/example",
                ),
            },
        ),
    )

    result = CliRunner().invoke(cli_group, ["check", "widget", "--format", "json"], obj=obj)
    data = _data(result.output)

    assert result.exit_code == 0, result.output
    [branch] = data["branches"]
    assert branch["pr"]["lookup_status"] == "found"
    assert branch["pr"]["state"] == "MERGED"
    assert branch["pr"]["head_ref_name"] == "feat/example"
    assert branch["pr"]["base_ref_name"] == "master"
    assert branch["pr"]["number"] == 123
    assert branch["pr"]["error_stderr"] is None


def test_closed_pr_observation_in_facts(cli_group: ClinkrGroup) -> None:
    gateway = _seed_branch("widget", "feat/example")
    obj = _make_obj(
        gateway=gateway,
        live_branches=("master", "feat/example"),
        pr_gateway=FakePRGateway(
            prs_by_branch={
                "feat/example": _pr(
                    number=124,
                    title="Closed",
                    url="https://example.com/pull/124",
                    state="CLOSED",
                    head="feat/example",
                ),
            },
        ),
    )

    result = CliRunner().invoke(cli_group, ["check", "widget", "--format", "json"], obj=obj)
    data = _data(result.output)

    assert result.exit_code == 0, result.output
    [branch] = data["branches"]
    assert branch["pr"]["lookup_status"] == "found"
    assert branch["pr"]["state"] == "CLOSED"
    assert branch["pr"]["head_ref_name"] == "feat/example"
    assert branch["pr"]["base_ref_name"] == "master"


def test_open_pr_observation_in_facts(cli_group: ClinkrGroup) -> None:
    gateway = _seed_branch("widget", "feat/example")
    obj = _make_obj(
        gateway=gateway,
        live_branches=("master", "feat/example"),
        pr_gateway=FakePRGateway(
            prs_by_branch={
                "feat/example": _pr(
                    number=125,
                    title="Open",
                    url="https://example.com/pull/125",
                    state="OPEN",
                    head="feat/example",
                ),
            },
        ),
    )

    result = CliRunner().invoke(cli_group, ["check", "widget", "--format", "json"], obj=obj)
    data = _data(result.output)

    assert result.exit_code == 0, result.output
    [branch] = data["branches"]
    assert branch["pr"]["lookup_status"] == "found"
    assert branch["pr"]["state"] == "OPEN"
    assert branch["pr"]["head_ref_name"] == "feat/example"
    assert branch["pr"]["base_ref_name"] == "master"


def test_local_branch_with_no_pr(cli_group: ClinkrGroup) -> None:
    gateway = _seed_branch("widget", "feat/example")
    obj = _make_obj(
        gateway=gateway,
        live_branches=("master", "feat/example"),
        pr_gateway=FakePRGateway(),
    )

    result = CliRunner().invoke(cli_group, ["check", "widget", "--format", "json"], obj=obj)
    data = _data(result.output)

    assert result.exit_code == 0, result.output
    [branch] = data["branches"]
    assert branch["pr"]["lookup_status"] == "missing"
    assert branch["pr"]["number"] is None
    assert branch["pr"]["state"] is None
    assert branch["pr"]["title"] is None
    assert branch["pr"]["url"] is None
    assert branch["pr"]["head_ref_name"] is None
    assert branch["pr"]["base_ref_name"] is None
    assert branch["pr"]["error_stderr"] is None


# ---------------------------------------------------------------------------
# diagnostics — pr lookup error / stored entries / identity conflicts
# ---------------------------------------------------------------------------


def test_pr_lookup_error_with_stderr(cli_group: ClinkrGroup) -> None:
    gateway = _seed_branch("widget", "feat/example")
    obj = _make_obj(
        gateway=gateway,
        live_branches=("master", "feat/example"),
        pr_gateway=_BrokenPRGateway(stderr="auth failed", returncode=4),
    )

    result = CliRunner().invoke(cli_group, ["check", "widget", "--format", "json"], obj=obj)
    data = _data(result.output)

    assert result.exit_code == 0, result.output
    [branch] = data["branches"]
    assert branch["pr"]["lookup_status"] == "error"
    assert branch["pr"]["error_stderr"] == "auth failed"
    pr_error = next(d for d in data["diagnostics"] if d["kind"] == "pr_lookup_error")
    assert pr_error["branch"] == "feat/example"
    assert pr_error["stderr"] == "auth failed"


def test_pr_lookup_error_without_stderr(cli_group: ClinkrGroup) -> None:
    gateway = _seed_branch("widget", "feat/example")
    obj = _make_obj(
        gateway=gateway,
        live_branches=("master", "feat/example"),
        pr_gateway=_BrokenPRGateway(stderr="", returncode=4),
    )

    result = CliRunner().invoke(cli_group, ["check", "widget", "--format", "json"], obj=obj)
    data = _data(result.output)

    assert result.exit_code == 0, result.output
    pr_error = next(d for d in data["diagnostics"] if d["kind"] == "pr_lookup_error")
    assert pr_error["branch"] == "feat/example"
    assert pr_error["stderr"] == ""


def test_stored_entry_without_visible_source(cli_group: ClinkrGroup) -> None:
    gateway = _seed_branch("widget", "feat/example")
    _seed_state_blob(
        gateway,
        "widget",
        _state_payload(
            "widget",
            entries=[
                {"id": "pr-999", "title": "Old slice", "state": "MERGED"},
            ],
        ),
    )
    obj = _make_obj(
        gateway=gateway,
        live_branches=("master", "feat/example"),
        pr_gateway=FakePRGateway(
            prs_by_branch={
                "feat/example": _pr(
                    number=123,
                    title="Widget slice",
                    url="https://example.com/pull/123",
                    state="OPEN",
                    head="feat/example",
                ),
            },
        ),
    )

    result = CliRunner().invoke(cli_group, ["check", "widget", "--format", "json"], obj=obj)
    data = _data(result.output)

    assert result.exit_code == 0, result.output
    [branch] = data["branches"]
    assert branch["matching_stored_entry_ids"] == []
    orphan = next(
        d for d in data["diagnostics"] if d["kind"] == "stored_entry_without_visible_source"
    )
    assert orphan["entry_id"] == "pr-999"


def test_branch_pr_identity_conflict(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("memjectives", "widget/body.md", "master", "seed\n")
    gateway.put("memjectives", "widget/body.md", "feat/a", "snap\n")
    gateway.put("memjectives", "widget/body.md", "feat/b", "snap\n")
    obj = _make_obj(
        gateway=gateway,
        live_branches=("master", "feat/a", "feat/b"),
        pr_gateway=_SharedNumberPRGateway(branches=("feat/a", "feat/b"), number=777),
    )

    result = CliRunner().invoke(cli_group, ["check", "widget", "--format", "json"], obj=obj)
    data = _data(result.output)

    assert result.exit_code == 0, result.output
    branch_names = [branch["source"]["branch"] for branch in data["branches"]]
    assert branch_names == ["feat/a", "feat/b"]
    conflict = next(d for d in data["diagnostics"] if d["kind"] == "branch_pr_identity_conflict")
    assert conflict["pr_number"] == 777
    assert conflict["branches"] == ["feat/a", "feat/b"]
