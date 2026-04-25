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
from twerk_core.gh.types import PRSummary
from twerk_core.git.testing import FakeGitGateway
from twerk_core.git.types import DetachedHead
from twerk_core.memjective.context import MemjectiveCliContext
from twerk_core.memjective.main import build_cli


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


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


def _seed_root(gateway: FakeBranchMemoryGateway, slug: str) -> None:
    gateway.put("memjectives", f"{slug}/body.md", "master", "seed\n")


def _seed_state(gateway: FakeBranchMemoryGateway, slug: str, payload: dict[str, Any] | str) -> None:
    blob = payload if isinstance(payload, str) else json.dumps(payload)
    gateway.put("memjective-state", f"{slug}/state.json", "master", blob)


def _state_blob(gateway: FakeBranchMemoryGateway, slug: str) -> dict[str, Any]:
    raw = gateway.get("memjective-state", f"{slug}/state.json", "master")
    assert raw is not None, "state.json missing on master"
    return json.loads(raw)


def _envelope(output: str) -> dict[str, Any]:
    return json.loads(output)


def _data(output: str) -> dict[str, Any]:
    payload = json.loads(output)
    assert "data" in payload, payload
    return payload["data"]


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


# ---------------------------------------------------------------------------
# help / schema
# ---------------------------------------------------------------------------


def test_exec_init_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "init", "-h"])

    assert result.exit_code == 0, result.output
    assert "Usage: memjective exec init" in result.output
    assert "SLUG" in result.output


def test_exec_record_entry_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "record-entry", "-h"])

    assert result.exit_code == 0, result.output
    assert "Usage: memjective exec record-entry" in result.output
    assert "--file" in result.output
    assert "--json" in result.output


def test_exec_init_schema_flag(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "init", "--schema"])

    assert result.exit_code == 0, result.output
    payload = json.loads(result.stdout)
    assert set(payload) == {"input_schema", "output_schema"}


# ---------------------------------------------------------------------------
# init
# ---------------------------------------------------------------------------


def test_init_creates_state_when_seed_present(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    _seed_root(gateway, "widget")
    obj = _make_obj(gateway=gateway, live_branches=("master",))

    result = CliRunner().invoke(cli_group, ["exec", "init", "widget", "--format", "json"], obj=obj)

    assert result.exit_code == 0, result.output
    data = _data(result.output)
    assert data["slug"] == "widget"
    assert data["created"] is True
    assert isinstance(data["commit_sha"], str) and data["commit_sha"]

    blob = _state_blob(gateway, "widget")
    assert blob == {
        "version": 1,
        "slug": "widget",
        "root": {"namespace": "memjectives", "branch": "master", "path": "widget"},
        "entries": [],
    }


def test_init_idempotent_when_state_already_exists(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    _seed_root(gateway, "widget")
    initial_payload = {
        "version": 1,
        "slug": "widget",
        "root": {"namespace": "memjectives", "branch": "master", "path": "widget"},
        "entries": [{"id": "branch-foo", "resolution": "tracked"}],
    }
    _seed_state(gateway, "widget", initial_payload)
    obj = _make_obj(gateway=gateway, live_branches=("master",))

    result = CliRunner().invoke(cli_group, ["exec", "init", "widget", "--format", "json"], obj=obj)

    assert result.exit_code == 0, result.output
    data = _data(result.output)
    assert data["created"] is False
    assert data["commit_sha"] is None
    # Existing state preserved.
    assert _state_blob(gateway, "widget") == initial_payload


def test_init_fails_when_seed_absent(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    obj = _make_obj(gateway=gateway, live_branches=("master",))

    result = CliRunner().invoke(cli_group, ["exec", "init", "widget", "--format", "json"], obj=obj)

    assert result.exit_code == 2, result.output
    envelope = _envelope(result.output)
    assert envelope["error_type"] == "missing_root_memjective"


def test_init_fails_when_existing_state_invalid(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    _seed_root(gateway, "widget")
    _seed_state(gateway, "widget", "{not json")
    obj = _make_obj(gateway=gateway, live_branches=("master",))

    result = CliRunner().invoke(cli_group, ["exec", "init", "widget", "--format", "json"], obj=obj)

    assert result.exit_code == 2, result.output
    envelope = _envelope(result.output)
    assert envelope["error_type"] == "state_invalid"


# ---------------------------------------------------------------------------
# record-entry — payload sources
# ---------------------------------------------------------------------------


def _seed_initialized_state(slug: str = "widget") -> FakeBranchMemoryGateway:
    gateway = FakeBranchMemoryGateway()
    _seed_root(gateway, slug)
    _seed_state(
        gateway,
        slug,
        {
            "version": 1,
            "slug": slug,
            "root": {"namespace": "memjectives", "branch": "master", "path": slug},
            "entries": [],
        },
    )
    return gateway


def test_record_entry_via_json_literal(cli_group: ClinkrGroup) -> None:
    gateway = _seed_initialized_state()
    obj = _make_obj(gateway=gateway, live_branches=("master",))
    payload = json.dumps({"id": "branch-foo", "resolution": "tracked"})

    result = CliRunner().invoke(
        cli_group,
        ["exec", "record-entry", "widget", "--json", payload, "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    data = _data(result.output)
    assert data == {
        "slug": "widget",
        "entry_id": "branch-foo",
        "action": "created",
        "commit_sha": data["commit_sha"],
    }
    assert _state_blob(gateway, "widget")["entries"] == [
        {"id": "branch-foo", "resolution": "tracked"},
    ]


def test_record_entry_via_file(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    gateway = _seed_initialized_state()
    obj = _make_obj(gateway=gateway, live_branches=("master",))
    entry_path = tmp_path / "entry.json"
    entry_path.write_text(json.dumps({"id": "branch-foo", "resolution": "tracked"}))

    result = CliRunner().invoke(
        cli_group,
        ["exec", "record-entry", "widget", "--file", str(entry_path), "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    assert _data(result.output)["action"] == "created"


def test_record_entry_via_stdin_marker(cli_group: ClinkrGroup) -> None:
    gateway = _seed_initialized_state()
    obj = _make_obj(gateway=gateway, live_branches=("master",))

    result = CliRunner().invoke(
        cli_group,
        ["exec", "record-entry", "widget", "-"],
        obj=obj,
        input=json.dumps({"id": "branch-foo", "resolution": "tracked"}),
    )

    assert result.exit_code == 0, result.output
    assert "created entry branch-foo" in result.output


# ---------------------------------------------------------------------------
# record-entry — upsert semantics
# ---------------------------------------------------------------------------


def test_record_entry_creates_new_entry(cli_group: ClinkrGroup) -> None:
    gateway = _seed_initialized_state()
    obj = _make_obj(gateway=gateway, live_branches=("master",))

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "record-entry",
            "widget",
            "--json",
            json.dumps({"id": "pr-1", "resolution": "tracked", "pr": {"number": 1}}),
            "--format",
            "json",
        ],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    assert _data(result.output)["action"] == "created"
    entries = _state_blob(gateway, "widget")["entries"]
    assert [e["id"] for e in entries] == ["pr-1"]


def test_record_entry_updates_existing_entry_in_place(cli_group: ClinkrGroup) -> None:
    gateway = _seed_initialized_state()
    _seed_state(
        gateway,
        "widget",
        {
            "version": 1,
            "slug": "widget",
            "root": {"namespace": "memjectives", "branch": "master", "path": "widget"},
            "entries": [
                {"id": "pr-1", "resolution": "tracked", "pr": {"number": 1}},
                {"id": "branch-foo", "resolution": "tracked"},
            ],
        },
    )
    obj = _make_obj(gateway=gateway, live_branches=("master",))

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "record-entry",
            "widget",
            "--json",
            json.dumps(
                {
                    "id": "pr-1",
                    "resolution": "tracked",
                    "summary": "still tracking",
                    "pr": {"number": 1},
                }
            ),
            "--format",
            "json",
        ],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    assert _data(result.output)["action"] == "updated"
    entries = _state_blob(gateway, "widget")["entries"]
    assert [e["id"] for e in entries] == ["pr-1", "branch-foo"]
    assert entries[0]["resolution"] == "tracked"
    assert entries[0]["summary"] == "still tracking"


def test_record_entry_promotes_branch_to_pr(cli_group: ClinkrGroup) -> None:
    gateway = _seed_initialized_state()
    _seed_state(
        gateway,
        "widget",
        {
            "version": 1,
            "slug": "widget",
            "root": {"namespace": "memjectives", "branch": "master", "path": "widget"},
            "entries": [
                {
                    "id": "branch-feat-x",
                    "resolution": "tracked",
                    "pr": {"number": 221, "head_ref_name": "feat-x"},
                },
            ],
        },
    )
    obj = _make_obj(gateway=gateway, live_branches=("master",))
    payload = json.dumps(
        {
            "id": "pr-221",
            "resolution": "tracked",
            "pr": {"number": 221, "head_ref_name": "feat-x"},
        }
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "record-entry", "widget", "--json", payload, "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    assert _data(result.output)["action"] == "promoted"
    ids = [e["id"] for e in _state_blob(gateway, "widget")["entries"]]
    assert ids == ["pr-221"]


def test_record_entry_rejects_duplicate_pr_number(cli_group: ClinkrGroup) -> None:
    gateway = _seed_initialized_state()
    _seed_state(
        gateway,
        "widget",
        {
            "version": 1,
            "slug": "widget",
            "root": {"namespace": "memjectives", "branch": "master", "path": "widget"},
            "entries": [
                {"id": "pr-7", "resolution": "tracked", "pr": {"number": 221}},
            ],
        },
    )
    obj = _make_obj(gateway=gateway, live_branches=("master",))
    payload = json.dumps(
        {
            "id": "pr-221",
            "resolution": "tracked",
            "pr": {"number": 221},
        }
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "record-entry", "widget", "--json", payload, "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 2, result.output
    envelope = _envelope(result.output)
    assert envelope["error_type"] == "duplicate_pr_number"


def test_record_entry_rejects_regression_without_force(cli_group: ClinkrGroup) -> None:
    gateway = _seed_initialized_state()
    _seed_state(
        gateway,
        "widget",
        {
            "version": 1,
            "slug": "widget",
            "root": {"namespace": "memjectives", "branch": "master", "path": "widget"},
            "entries": [
                {"id": "pr-1", "resolution": "incorporated", "pr": {"number": 1}},
            ],
        },
    )
    obj = _make_obj(gateway=gateway, live_branches=("master",))
    payload = json.dumps({"id": "pr-1", "resolution": "tracked", "pr": {"number": 1}})

    result = CliRunner().invoke(
        cli_group,
        ["exec", "record-entry", "widget", "--json", payload, "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 2, result.output
    envelope = _envelope(result.output)
    assert envelope["error_type"] == "resolution_regression"


def test_record_entry_force_overrides_regression(cli_group: ClinkrGroup) -> None:
    gateway = _seed_initialized_state()
    _seed_state(
        gateway,
        "widget",
        {
            "version": 1,
            "slug": "widget",
            "root": {"namespace": "memjectives", "branch": "master", "path": "widget"},
            "entries": [
                {"id": "pr-1", "resolution": "incorporated", "pr": {"number": 1}},
            ],
        },
    )
    obj = _make_obj(gateway=gateway, live_branches=("master",))
    payload = json.dumps({"id": "pr-1", "resolution": "tracked", "pr": {"number": 1}})

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "record-entry",
            "widget",
            "--json",
            payload,
            "--force",
            "--format",
            "json",
        ],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    assert _data(result.output)["action"] == "updated"


# ---------------------------------------------------------------------------
# record-entry — error paths
# ---------------------------------------------------------------------------


def test_record_entry_rejects_unsupported_state_version(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    _seed_root(gateway, "widget")
    _seed_state(
        gateway,
        "widget",
        {
            "version": 999,
            "slug": "widget",
            "root": {"namespace": "memjectives", "branch": "master", "path": "widget"},
            "entries": [],
        },
    )
    obj = _make_obj(gateway=gateway, live_branches=("master",))

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "record-entry",
            "widget",
            "--json",
            json.dumps({"id": "branch-foo", "resolution": "tracked"}),
            "--format",
            "json",
        ],
        obj=obj,
    )

    assert result.exit_code == 2, result.output
    envelope = _envelope(result.output)
    assert envelope["error_type"] == "state_invalid"


def test_record_entry_rejects_invalid_json(cli_group: ClinkrGroup) -> None:
    gateway = _seed_initialized_state()
    obj = _make_obj(gateway=gateway, live_branches=("master",))

    result = CliRunner().invoke(
        cli_group,
        ["exec", "record-entry", "widget", "--json", "{not json", "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 2, result.output
    envelope = _envelope(result.output)
    assert envelope["error_type"] == "payload_invalid_json"


def test_record_entry_rejects_missing_id(cli_group: ClinkrGroup) -> None:
    gateway = _seed_initialized_state()
    obj = _make_obj(gateway=gateway, live_branches=("master",))

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "record-entry",
            "widget",
            "--json",
            json.dumps({"resolution": "tracked"}),
            "--format",
            "json",
        ],
        obj=obj,
    )

    assert result.exit_code == 2, result.output
    envelope = _envelope(result.output)
    assert envelope["error_type"] == "entry_invalid"
    assert "id" in envelope["message"]


def test_record_entry_rejects_unknown_resolution(cli_group: ClinkrGroup) -> None:
    gateway = _seed_initialized_state()
    obj = _make_obj(gateway=gateway, live_branches=("master",))

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "record-entry",
            "widget",
            "--json",
            json.dumps({"id": "branch-foo", "resolution": "rejected"}),
            "--format",
            "json",
        ],
        obj=obj,
    )

    assert result.exit_code == 2, result.output
    envelope = _envelope(result.output)
    assert envelope["error_type"] == "entry_invalid"
    assert "resolution" in envelope["message"]


def test_record_entry_fails_when_state_uninitialized(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    _seed_root(gateway, "widget")
    obj = _make_obj(gateway=gateway, live_branches=("master",))

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "record-entry",
            "widget",
            "--json",
            json.dumps({"id": "branch-foo", "resolution": "tracked"}),
            "--format",
            "json",
        ],
        obj=obj,
    )

    assert result.exit_code == 2, result.output
    envelope = _envelope(result.output)
    assert envelope["error_type"] == "state_uninitialized"
    assert "memjective exec init widget" in envelope["message"]


def test_record_entry_fails_with_no_payload_source(cli_group: ClinkrGroup) -> None:
    gateway = _seed_initialized_state()
    obj = _make_obj(gateway=gateway, live_branches=("master",))

    result = CliRunner().invoke(
        cli_group,
        ["exec", "record-entry", "widget", "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 2, result.output
    envelope = _envelope(result.output)
    assert envelope["error_type"] == "no_payload_source"


def test_record_entry_fails_with_conflicting_payload_sources(cli_group: ClinkrGroup) -> None:
    gateway = _seed_initialized_state()
    obj = _make_obj(gateway=gateway, live_branches=("master",))

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "record-entry",
            "widget",
            "--json",
            json.dumps({"id": "branch-foo", "resolution": "tracked"}),
            "--file",
            "ignored.json",
            "--format",
            "json",
        ],
        obj=obj,
    )

    assert result.exit_code == 2, result.output
    envelope = _envelope(result.output)
    assert envelope["error_type"] == "conflicting_payload_sources"


# ---------------------------------------------------------------------------
# end-to-end against memjective check
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# record-entry — incorporation evidence cross-check (PR 6)
# ---------------------------------------------------------------------------


def _seed_pending_incorporation(
    *,
    slug: str = "widget",
    branch: str = "feat/x",
    pr_number: int = 42,
    merge_commit_oid: str = "deadbeef",
) -> tuple[FakeBranchMemoryGateway, ClinkrContextObject, dict[str, Any]]:
    """Seed a master root + branch snapshot + merged PR, return the gateway,
    a CLI context, and a fully-populated incorporation payload that should
    pass every cross-check rule.
    """
    gateway = _seed_initialized_state(slug)
    gateway.put("memjectives", f"{slug}/body.md", branch, "snap\n")

    obj = _make_obj(
        gateway=gateway,
        live_branches=("master", branch),
        pr_gateway=FakePRGateway(
            prs_by_branch={
                branch: _pr_with_merge(
                    number=pr_number,
                    head=branch,
                    merge_commit_oid=merge_commit_oid,
                ),
            },
        ),
    )

    root_tree_sha = gateway.get_tree_sha("memjectives", "master", slug)
    source_tree_sha = gateway.get_tree_sha("memjectives", branch, slug)
    assert root_tree_sha is not None
    assert source_tree_sha is not None

    payload: dict[str, Any] = {
        "id": f"pr-{pr_number}",
        "resolution": "incorporated_no_doc_change",
        "summary": "no-op rewrite",
        "pr": {
            "number": pr_number,
            "state": "MERGED",
            "head_ref_name": branch,
            "merge_commit_oid": merge_commit_oid,
        },
        "source": {
            "namespace": "memjectives",
            "branch": branch,
            "path": slug,
            "tree_sha": source_tree_sha,
        },
        "root_before": {
            "namespace": "memjectives",
            "branch": "master",
            "path": slug,
            "tree_sha": root_tree_sha,
        },
        "root_after": {
            "namespace": "memjectives",
            "branch": "master",
            "path": slug,
            "tree_sha": root_tree_sha,
        },
    }
    return gateway, obj, payload


def _pr_with_merge(*, number: int, head: str, merge_commit_oid: str) -> PRSummary:
    return PRSummary(
        number=number,
        title=f"slice-{number}",
        url=f"https://example.com/pull/{number}",
        head_ref_name=head,
        base_ref_name="master",
        state="MERGED",  # type: ignore[arg-type]
        merged_at="2026-04-01T12:00:00Z",
        merge_commit_oid=merge_commit_oid,
    )


def test_record_entry_incorporation_happy_path(cli_group: ClinkrGroup) -> None:
    _, obj, payload = _seed_pending_incorporation()

    result = CliRunner().invoke(
        cli_group,
        ["exec", "record-entry", "widget", "--json", json.dumps(payload), "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    data = _data(result.output)
    assert data["entry_id"] == "pr-42"
    assert data["action"] == "created"


def test_record_entry_rejects_open_pr_for_incorporation(cli_group: ClinkrGroup) -> None:
    gateway = _seed_initialized_state()
    gateway.put("memjectives", "widget/body.md", "feat/x", "snap\n")
    obj = _make_obj(
        gateway=gateway,
        live_branches=("master", "feat/x"),
        pr_gateway=FakePRGateway(
            prs_by_branch={
                "feat/x": _pr(
                    number=42,
                    state="OPEN",
                    head="feat/x",
                    title="open-slice",
                    url="https://example.com/pull/42",
                ),
            },
        ),
    )
    root_tree_sha = gateway.get_tree_sha("memjectives", "master", "widget")
    source_tree_sha = gateway.get_tree_sha("memjectives", "feat/x", "widget")
    assert root_tree_sha is not None and source_tree_sha is not None

    payload = {
        "id": "pr-42",
        "resolution": "incorporated_no_doc_change",
        "pr": {
            "number": 42,
            "state": "MERGED",  # payload claims merged; live PR is OPEN
            "head_ref_name": "feat/x",
            "merge_commit_oid": "deadbeef",
        },
        "source": {
            "namespace": "memjectives",
            "branch": "feat/x",
            "path": "widget",
            "tree_sha": source_tree_sha,
        },
        "root_before": {
            "namespace": "memjectives",
            "branch": "master",
            "path": "widget",
            "tree_sha": root_tree_sha,
        },
        "root_after": {
            "namespace": "memjectives",
            "branch": "master",
            "path": "widget",
            "tree_sha": root_tree_sha,
        },
    }

    result = CliRunner().invoke(
        cli_group,
        ["exec", "record-entry", "widget", "--json", json.dumps(payload), "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 2, result.output
    envelope = _envelope(result.output)
    assert envelope["error_type"] == "pr_not_merged"


def test_record_entry_rejects_root_after_mismatch(cli_group: ClinkrGroup) -> None:
    _, obj, payload = _seed_pending_incorporation()
    payload["resolution"] = "incorporated"
    payload["root_before"]["tree_sha"] = "faketree-stale-before"
    payload["root_after"]["tree_sha"] = "faketree-stale-after"

    result = CliRunner().invoke(
        cli_group,
        ["exec", "record-entry", "widget", "--json", json.dumps(payload), "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 2, result.output
    envelope = _envelope(result.output)
    assert envelope["error_type"] == "root_after_mismatch"


def test_record_entry_rejects_root_unchanged_for_incorporated(cli_group: ClinkrGroup) -> None:
    _, obj, payload = _seed_pending_incorporation()
    payload["resolution"] = "incorporated"  # but root_before == root_after

    result = CliRunner().invoke(
        cli_group,
        ["exec", "record-entry", "widget", "--json", json.dumps(payload), "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 2, result.output
    envelope = _envelope(result.output)
    assert envelope["error_type"] == "root_unchanged_for_incorporated"


def test_record_entry_rejects_root_changed_for_no_doc_change(cli_group: ClinkrGroup) -> None:
    _, obj, payload = _seed_pending_incorporation()
    payload["root_before"]["tree_sha"] = "faketree-different"

    result = CliRunner().invoke(
        cli_group,
        ["exec", "record-entry", "widget", "--json", json.dumps(payload), "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 2, result.output
    envelope = _envelope(result.output)
    assert envelope["error_type"] == "root_changed_for_no_doc_change"


def test_record_entry_rejects_source_tree_sha_mismatch(cli_group: ClinkrGroup) -> None:
    _, obj, payload = _seed_pending_incorporation()
    payload["source"]["tree_sha"] = "faketree-stale-source"

    result = CliRunner().invoke(
        cli_group,
        ["exec", "record-entry", "widget", "--json", json.dumps(payload), "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 2, result.output
    envelope = _envelope(result.output)
    assert envelope["error_type"] == "source_tree_sha_mismatch"


def test_record_entry_rejects_merge_commit_oid_mismatch(cli_group: ClinkrGroup) -> None:
    _, obj, payload = _seed_pending_incorporation()
    payload["pr"]["merge_commit_oid"] = "wrong-oid"

    result = CliRunner().invoke(
        cli_group,
        ["exec", "record-entry", "widget", "--json", json.dumps(payload), "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 2, result.output
    envelope = _envelope(result.output)
    assert envelope["error_type"] == "merge_commit_oid_mismatch"


def test_record_entry_no_pending_match_overridden_by_force(cli_group: ClinkrGroup) -> None:
    """A PR with no live branch evidence is rejected without --force, accepted with it."""
    slug = "widget"
    gateway = _seed_initialized_state(slug)
    # Master root is seeded; no branch snapshot, no PRs known to the gateway.
    obj = _make_obj(
        gateway=gateway,
        live_branches=("master",),
        pr_gateway=FakePRGateway(),
    )
    root_tree_sha = gateway.get_tree_sha("memjectives", "master", slug)
    assert root_tree_sha is not None

    payload = {
        "id": "pr-99",
        "resolution": "incorporated_no_doc_change",
        "summary": "manual catchup with --force",
        "pr": {
            "number": 99,
            "state": "MERGED",
            "head_ref_name": "feat/long-gone",
            "merge_commit_oid": "abc-99",
        },
        "source": {
            "namespace": "memjectives",
            "branch": "feat/long-gone",
            "path": slug,
            "tree_sha": "faketree-historical",
        },
        "root_before": {
            "namespace": "memjectives",
            "branch": "master",
            "path": slug,
            "tree_sha": root_tree_sha,
        },
        "root_after": {
            "namespace": "memjectives",
            "branch": "master",
            "path": slug,
            "tree_sha": root_tree_sha,
        },
    }

    no_force = CliRunner().invoke(
        cli_group,
        ["exec", "record-entry", slug, "--json", json.dumps(payload), "--format", "json"],
        obj=obj,
    )
    assert no_force.exit_code == 2, no_force.output
    assert _envelope(no_force.output)["error_type"] == "no_pending_match"

    forced = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "record-entry",
            slug,
            "--json",
            json.dumps(payload),
            "--force",
            "--format",
            "json",
        ],
        obj=obj,
    )
    assert forced.exit_code == 0, forced.output
    assert _data(forced.output)["action"] == "created"


def test_record_entry_rejects_duplicate_incorporation_even_with_force(
    cli_group: ClinkrGroup,
) -> None:
    gateway, obj, payload = _seed_pending_incorporation()

    first = CliRunner().invoke(
        cli_group,
        ["exec", "record-entry", "widget", "--json", json.dumps(payload), "--format", "json"],
        obj=obj,
    )
    assert first.exit_code == 0, first.output

    # Re-recording the same (pr.number, merge_commit_oid) with the same
    # resolution must fire already_incorporated, not pass through.
    second = CliRunner().invoke(
        cli_group,
        ["exec", "record-entry", "widget", "--json", json.dumps(payload), "--format", "json"],
        obj=obj,
    )
    assert second.exit_code == 2, second.output
    assert _envelope(second.output)["error_type"] == "already_incorporated"

    # --force does NOT bypass the duplicate-merge check.
    forced = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "record-entry",
            "widget",
            "--json",
            json.dumps(payload),
            "--force",
            "--format",
            "json",
        ],
        obj=obj,
    )
    assert forced.exit_code == 2, forced.output
    assert _envelope(forced.output)["error_type"] == "already_incorporated"


def test_record_entry_end_to_end_with_compute_pending_entries(cli_group: ClinkrGroup) -> None:
    """A merged PR shows up as pending; record-entry consumes it; rerun has no pending."""
    gateway, obj, payload = _seed_pending_incorporation()

    pending_before = CliRunner().invoke(
        cli_group,
        ["exec", "compute-pending-entries", "widget", "--format", "json"],
        obj=obj,
    )
    assert pending_before.exit_code == 0, pending_before.output
    before_data = _data(pending_before.output)
    assert [p["id"] for p in before_data["pending_entries"]] == ["pr-42"]

    record = CliRunner().invoke(
        cli_group,
        ["exec", "record-entry", "widget", "--json", json.dumps(payload), "--format", "json"],
        obj=obj,
    )
    assert record.exit_code == 0, record.output

    pending_after = CliRunner().invoke(
        cli_group,
        ["exec", "compute-pending-entries", "widget", "--format", "json"],
        obj=obj,
    )
    assert pending_after.exit_code == 0, pending_after.output
    after_data = _data(pending_after.output)
    assert after_data["pending_entries"] == []


def test_record_entry_then_check_shows_match(cli_group: ClinkrGroup) -> None:
    gateway = _seed_initialized_state()
    gateway.put("memjectives", "widget/body.md", "feat/x", "snap\n")
    obj = _make_obj(
        gateway=gateway,
        live_branches=("master", "feat/x"),
        pr_gateway=FakePRGateway(
            prs_by_branch={
                "feat/x": _pr(
                    number=42,
                    title="Slice",
                    url="https://example.com/pull/42",
                    state="MERGED",
                    head="feat/x",
                ),
            },
        ),
    )

    record_payload = json.dumps(
        {
            "id": "pr-42",
            "resolution": "tracked",
            "pr": {"number": 42, "head_ref_name": "feat/x", "state": "MERGED"},
        }
    )
    record = CliRunner().invoke(
        cli_group,
        ["exec", "record-entry", "widget", "--json", record_payload, "--format", "json"],
        obj=obj,
    )
    assert record.exit_code == 0, record.output

    check = CliRunner().invoke(cli_group, ["check", "widget", "--format", "json"], obj=obj)
    assert check.exit_code == 0, check.output
    data = _data(check.output)
    [branch] = data["branches"]
    assert branch["matching_stored_entry_ids"] == ["pr-42"]
    assert data["state"]["status"] == "loaded"
