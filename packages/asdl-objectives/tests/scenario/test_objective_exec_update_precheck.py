"""Scenario tests for ``objective exec update-precheck``.

The skill `objective-update` consumes this command's JSON envelope to
decide whether to skip (in_sync) or proceed to evidence triage. These tests
exercise the contract end to end through `build_cli()` with the standard
fake gateways used across objective scenario tests.
"""

from __future__ import annotations

import json
import textwrap
from pathlib import Path

import pytest
from click.testing import CliRunner

from asdl_core.clinkr.context import ClinkrContextObject, build_clinkr_context_object
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.gh.pr_testing import FakePRGateway
from asdl_core.gh.testing import FakeIssueGateway
from asdl_core.git.testing import FakeGitGateway
from asdl_core.git.types import CommitSummary, DetachedHead, GitCommandFailure
from asdl_objectives.context import ObjectiveCliContext
from asdl_objectives.main import build_cli
from brmem.fake import FakeBranchMemoryGateway


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


_BODY = textwrap.dedent(
    """\
    # Widget Rewrite

    Status: in progress

    ## Description

    Re-platform the widget pipeline.
    """
)

_ROADMAP = textwrap.dedent(
    """\
    # Roadmap

    1. First entry

    - [ ] Define plugin entry point ABC
    """
)

_NOTES = "- The plugin loader must be importable without optional deps.\n"


def _make_obj(
    *,
    gateway: FakeBranchMemoryGateway,
    current_branch: str | DetachedHead | GitCommandFailure = "feat/x",
    branches: tuple[str, ...] = (),
    commits_by_range: dict[str, tuple[CommitSummary, ...]] | None = None,
    log_range_failure: GitCommandFailure | None = None,
    patch_ids_by_range: dict[str, tuple[tuple[str, str | None], ...]] | None = None,
) -> ClinkrContextObject:
    git_gateway = FakeGitGateway(
        current_branch_by_path={Path.cwd(): current_branch},
        branches=branches,
        commits_by_range=commits_by_range,
        log_range_failure=log_range_failure,
        patch_ids_by_range=patch_ids_by_range,
        trunk_branch="master",
    )
    ctx = ObjectiveCliContext(
        brmem_gateway=gateway,
        git_gateway=git_gateway,
        pr_gateway=FakePRGateway(),
        issue_gateway=FakeIssueGateway(),
    )
    return build_clinkr_context_object(lambda: ctx)


def _seed_objective(
    branch: str,
    *,
    body: str = _BODY,
    roadmap: str | None = _ROADMAP,
    notes: str | None = _NOTES,
    slug: str = "widget-rewrite",
) -> FakeBranchMemoryGateway:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", f"{slug}/body.md", branch, body)
    if roadmap is not None:
        gateway.put("objectives", f"{slug}/roadmap.md", branch, roadmap)
    if notes is not None:
        gateway.put("objectives", f"{slug}/notes.md", branch, notes)
    return gateway


# ---------------------------------------------------------------------------
# help / json schema
# ---------------------------------------------------------------------------


def test_precheck_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "update-precheck", "-h"])

    assert result.exit_code == 0
    assert "Usage: objective exec update-precheck" in result.output


def test_precheck_json_schema_flag_is_eager(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "update-precheck", "--json-schema"])

    assert result.exit_code == 0, result.output
    payload = json.loads(result.stdout)
    assert set(payload) == {"input_json_schema", "output_json_schema"}


# ---------------------------------------------------------------------------
# happy path
# ---------------------------------------------------------------------------


def test_precheck_happy_path_emits_files_and_commits(cli_group: ClinkrGroup) -> None:
    gateway = _seed_objective("widget-rewrite-layer-1")
    commits = (
        CommitSummary(sha="sha-2", author_iso="2026-04-26T19:00:00+00:00", subject="Second"),
        CommitSummary(sha="sha-1", author_iso="2026-04-26T18:00:00+00:00", subject="First"),
    )
    obj = _make_obj(
        gateway=gateway,
        current_branch="widget-rewrite-layer-1",
        branches=("master", "widget-rewrite-layer-1"),
        commits_by_range={"master..HEAD": commits},
        patch_ids_by_range={"master..HEAD": (("sha-2", "pid-2"), ("sha-1", "pid-1"))},
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "update-precheck", "widget-rewrite", "--format", "json"],
        obj=obj,
    )
    payload = json.loads(result.output)

    assert result.exit_code == 0, result.output
    data = payload["data"]
    assert data["slug"] == "widget-rewrite"
    assert data["branch"] == "widget-rewrite-layer-1"
    assert data["branch_head_sha"] == "HEAD"
    assert data["in_sync"] is False
    assert data["snapshot_state"] == "stale"

    assert data["body"]["key"] == "widget-rewrite/body.md"
    assert data["body"]["present"] is True
    assert data["body"]["head_sha"] is not None
    assert data["body"]["head_date"] is not None
    assert data["body"]["blob_sha"] is not None
    assert data["body"]["size_bytes"] == len(_BODY.encode("utf-8"))

    assert data["roadmap"]["present"] is True
    assert data["notes"]["present"] is True

    assert data["branch_commits"] == [
        {
            "sha": "sha-2",
            "author_iso": "2026-04-26T19:00:00+00:00",
            "subject": "Second",
            "patch_id": "pid-2",
        },
        {
            "sha": "sha-1",
            "author_iso": "2026-04-26T18:00:00+00:00",
            "subject": "First",
            "patch_id": "pid-1",
        },
    ]
    assert data["snapshot_absorbed_patch_ids"] == []
    assert data["absorbed_marker_diagnostics"] == []
    assert data["absorbed_patch_ids"] == []
    # Timestamp aggregates and downstack absorption are not part of the
    # patch-id snapshot state contract.
    assert "snapshot_max_head_date" not in data
    assert "branch_max_author_iso" not in data
    assert "downstack_absorbed_patch_ids" not in data


def test_precheck_only_body_present(cli_group: ClinkrGroup) -> None:
    gateway = _seed_objective("widget-rewrite-layer-1", roadmap=None, notes=None)
    obj = _make_obj(
        gateway=gateway,
        current_branch="widget-rewrite-layer-1",
        branches=("master", "widget-rewrite-layer-1"),
        commits_by_range={
            "master..HEAD": (
                CommitSummary(
                    sha="sha-1",
                    author_iso="2026-04-26T18:00:00+00:00",
                    subject="First",
                ),
            )
        },
        patch_ids_by_range={"master..HEAD": (("sha-1", "pid-1"),)},
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "update-precheck", "widget-rewrite", "--format", "json"],
        obj=obj,
    )
    payload = json.loads(result.output)

    assert result.exit_code == 0, result.output
    data = payload["data"]
    assert data["body"]["present"] is True
    assert data["roadmap"] == {
        "key": "widget-rewrite/roadmap.md",
        "present": False,
        "head_sha": None,
        "head_date": None,
        "blob_sha": None,
        "size_bytes": None,
    }
    assert data["notes"]["present"] is False


def test_precheck_in_sync_when_no_branch_commits(cli_group: ClinkrGroup) -> None:
    gateway = _seed_objective("widget-rewrite-layer-1")
    obj = _make_obj(
        gateway=gateway,
        current_branch="widget-rewrite-layer-1",
        branches=("master", "widget-rewrite-layer-1"),
        commits_by_range={"master..HEAD": ()},
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "update-precheck", "widget-rewrite", "--format", "json"],
        obj=obj,
    )
    payload = json.loads(result.output)

    assert result.exit_code == 0, result.output
    data = payload["data"]
    assert data["in_sync"] is True
    assert data["branch_commits"] == []


# ---------------------------------------------------------------------------
# patch-id absorbed-set
# ---------------------------------------------------------------------------


def test_precheck_in_sync_when_all_pids_absorbed(cli_group: ClinkrGroup) -> None:
    gateway = _seed_objective("widget-rewrite-layer-1")
    gateway.put(
        "objectives",
        "widget-rewrite/.absorbed.jsonl",
        "widget-rewrite-layer-1",
        (
            '{"schema":1,"sha":"sha-1","patch_id":"pid-1",'
            '"author_iso":"2026-04-26T18:00:00+00:00","subject":"First"}\n'
            '{"schema":1,"sha":"sha-2","patch_id":"pid-2",'
            '"author_iso":"2026-04-26T19:00:00+00:00","subject":"Second"}\n'
        ),
    )
    commits = (
        CommitSummary(sha="sha-2", author_iso="2026-04-26T19:00:00+00:00", subject="Second"),
        CommitSummary(sha="sha-1", author_iso="2026-04-26T18:00:00+00:00", subject="First"),
    )
    obj = _make_obj(
        gateway=gateway,
        current_branch="widget-rewrite-layer-1",
        branches=("master", "widget-rewrite-groundwork", "widget-rewrite-layer-1"),
        commits_by_range={"master..HEAD": commits},
        patch_ids_by_range={
            "master..HEAD": (("sha-2", "pid-2"), ("sha-1", "pid-1")),
        },
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "update-precheck", "widget-rewrite", "--format", "json"],
        obj=obj,
    )
    payload = json.loads(result.output)

    assert result.exit_code == 0, result.output
    data = payload["data"]
    assert data["in_sync"] is True
    assert data["snapshot_state"] == "up-to-date"
    assert len(data["branch_commits"]) == 2
    assert {c["patch_id"] for c in data["branch_commits"]} == {"pid-1", "pid-2"}
    assert set(data["absorbed_patch_ids"]) == {"pid-1", "pid-2"}


def test_precheck_not_in_sync_when_some_pid_novel(cli_group: ClinkrGroup) -> None:
    gateway = _seed_objective("widget-rewrite-layer-1")
    gateway.put(
        "objectives",
        "widget-rewrite/.absorbed.jsonl",
        "widget-rewrite-layer-1",
        (
            '{"schema":1,"sha":"sha-1","patch_id":"pid-1",'
            '"author_iso":"2026-04-26T18:00:00+00:00","subject":"First"}\n'
        ),
    )
    commits = (
        CommitSummary(sha="sha-2", author_iso="2026-04-26T19:00:00+00:00", subject="Second"),
        CommitSummary(sha="sha-1", author_iso="2026-04-26T18:00:00+00:00", subject="First"),
    )
    obj = _make_obj(
        gateway=gateway,
        current_branch="widget-rewrite-layer-1",
        branches=("master", "widget-rewrite-groundwork", "widget-rewrite-layer-1"),
        commits_by_range={"master..HEAD": commits},
        patch_ids_by_range={
            "master..HEAD": (("sha-2", "pid-novel"), ("sha-1", "pid-1")),
        },
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "update-precheck", "widget-rewrite", "--format", "json"],
        obj=obj,
    )
    payload = json.loads(result.output)

    assert result.exit_code == 0, result.output
    data = payload["data"]
    assert data["in_sync"] is False
    assert set(data["absorbed_patch_ids"]) == {"pid-1"}


def test_precheck_ignores_null_pid_for_snapshot_state(cli_group: ClinkrGroup) -> None:
    gateway = _seed_objective("widget-rewrite-layer-1")
    gateway.put(
        "objectives",
        "widget-rewrite/.absorbed.jsonl",
        "widget-rewrite-layer-1",
        (
            '{"schema":1,"sha":"sha-1","patch_id":"pid-1",'
            '"author_iso":"2026-04-26T18:00:00+00:00","subject":"First"}\n'
        ),
    )
    commits = (
        CommitSummary(sha="sha-merge", author_iso="2026-04-26T19:00:00+00:00", subject="Merge"),
        CommitSummary(sha="sha-1", author_iso="2026-04-26T18:00:00+00:00", subject="First"),
    )
    obj = _make_obj(
        gateway=gateway,
        current_branch="widget-rewrite-layer-1",
        branches=("master", "widget-rewrite-groundwork", "widget-rewrite-layer-1"),
        commits_by_range={"master..HEAD": commits},
        patch_ids_by_range={
            "master..HEAD": (("sha-merge", None), ("sha-1", "pid-1")),
        },
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "update-precheck", "widget-rewrite", "--format", "json"],
        obj=obj,
    )
    payload = json.loads(result.output)

    assert result.exit_code == 0, result.output
    data = payload["data"]
    assert data["in_sync"] is True
    assert data["snapshot_state"] == "up-to-date"


def test_precheck_in_sync_when_snapshot_marker_absorbs_pid(cli_group: ClinkrGroup) -> None:
    gateway = _seed_objective("widget-rewrite-layer-1")
    gateway.put(
        "objectives",
        "widget-rewrite/.absorbed.jsonl",
        "widget-rewrite-layer-1",
        (
            '{"schema":1,"sha":"sha-2","patch_id":"pid-novel",'
            '"author_iso":"2026-04-26T19:00:00+00:00","subject":"Second"}\n'
        ),
    )
    commits = (
        CommitSummary(sha="sha-2", author_iso="2026-04-26T19:00:00+00:00", subject="Second"),
    )
    obj = _make_obj(
        gateway=gateway,
        current_branch="widget-rewrite-layer-1",
        branches=("master", "widget-rewrite-layer-1"),
        commits_by_range={"master..HEAD": commits},
        patch_ids_by_range={"master..HEAD": (("sha-2", "pid-novel"),)},
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "update-precheck", "widget-rewrite", "--format", "json"],
        obj=obj,
    )
    payload = json.loads(result.output)

    assert result.exit_code == 0, result.output
    data = payload["data"]
    assert data["in_sync"] is True
    assert data["snapshot_state"] == "up-to-date"
    assert data["snapshot_absorbed_patch_ids"] == ["pid-novel"]
    assert data["absorbed_patch_ids"] == ["pid-novel"]


def test_precheck_snapshot_state_ignores_branch_author_time(cli_group: ClinkrGroup) -> None:
    """Patch-id absorption alone determines snapshot state — a much-newer commit author
    time on the branch must not flip the verdict to stale.
    """
    gateway = _seed_objective("widget-rewrite-layer-1")
    gateway.put(
        "objectives",
        "widget-rewrite/.absorbed.jsonl",
        "widget-rewrite-layer-1",
        (
            '{"schema":1,"sha":"sha-1","patch_id":"pid-1",'
            '"author_iso":"2026-04-26T18:00:00+00:00","subject":"First"}\n'
        ),
    )
    commits = (
        CommitSummary(
            sha="sha-1",
            # Far in the future — under a timestamp contract this would look stale.
            author_iso="2099-01-01T00:00:00+00:00",
            subject="First",
        ),
    )
    obj = _make_obj(
        gateway=gateway,
        current_branch="widget-rewrite-layer-1",
        branches=("master", "widget-rewrite-layer-1"),
        commits_by_range={"master..HEAD": commits},
        patch_ids_by_range={"master..HEAD": (("sha-1", "pid-1"),)},
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "update-precheck", "widget-rewrite", "--format", "json"],
        obj=obj,
    )
    payload = json.loads(result.output)

    assert result.exit_code == 0, result.output
    data = payload["data"]
    assert data["snapshot_state"] == "up-to-date"
    assert data["in_sync"] is True


def test_precheck_malformed_marker_is_stale(cli_group: ClinkrGroup) -> None:
    gateway = _seed_objective("widget-rewrite-layer-1")
    gateway.put(
        "objectives",
        "widget-rewrite/.absorbed.jsonl",
        "widget-rewrite-layer-1",
        "not-json\n",
    )
    commits = (CommitSummary(sha="sha-1", author_iso="2026-04-26T18:00:00+00:00", subject="First"),)
    obj = _make_obj(
        gateway=gateway,
        current_branch="widget-rewrite-layer-1",
        branches=("master", "widget-rewrite-layer-1"),
        commits_by_range={"master..HEAD": commits},
        patch_ids_by_range={"master..HEAD": (("sha-1", "pid-1"),)},
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "update-precheck", "widget-rewrite", "--format", "json"],
        obj=obj,
    )
    payload = json.loads(result.output)

    assert result.exit_code == 0, result.output
    data = payload["data"]
    assert data["snapshot_state"] == "stale"
    assert data["in_sync"] is False
    assert data["absorbed_marker_diagnostics"] == ["line 1: invalid JSON: Expecting value"]


# ---------------------------------------------------------------------------
# slug auto-resolution
# ---------------------------------------------------------------------------


def test_precheck_auto_resolves_sole_slug(cli_group: ClinkrGroup) -> None:
    gateway = _seed_objective("widget-rewrite-layer-1")
    obj = _make_obj(
        gateway=gateway,
        current_branch="widget-rewrite-layer-1",
        branches=("master", "widget-rewrite-layer-1"),
        commits_by_range={
            "master..HEAD": (
                CommitSummary(
                    sha="sha-1",
                    author_iso="2026-04-26T18:00:00+00:00",
                    subject="Only",
                ),
            )
        },
        patch_ids_by_range={"master..HEAD": (("sha-1", "pid-1"),)},
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "update-precheck", "--format", "json"],
        obj=obj,
    )
    payload = json.loads(result.output)

    assert result.exit_code == 0, result.output
    assert payload["data"]["slug"] == "widget-rewrite"


# ---------------------------------------------------------------------------
# error envelopes
# ---------------------------------------------------------------------------


def test_precheck_no_objective_on_branch_fails(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(
        gateway=FakeBranchMemoryGateway(),
        current_branch="feat/blank",
        branches=("master", "feat/blank"),
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "update-precheck", "--format", "json"],
        obj=obj,
    )
    payload = json.loads(result.output)

    assert result.exit_code == 2
    assert payload["error_type"] == "no_objective_on_branch"
    assert "objective-attach <slug>" in payload["message"]


def test_precheck_ambiguous_objective_fails(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "alpha/body.md", "feat/x", _BODY)
    gateway.put("objectives", "beta/body.md", "feat/x", _BODY)
    obj = _make_obj(
        gateway=gateway,
        current_branch="feat/x",
        branches=("master", "feat/x"),
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "update-precheck", "--format", "json"],
        obj=obj,
    )
    payload = json.loads(result.output)

    assert result.exit_code == 2
    assert payload["error_type"] == "ambiguous_objective"
    assert "alpha" in payload["message"]
    assert "beta" in payload["message"]


def test_precheck_slug_not_attached_fails(cli_group: ClinkrGroup) -> None:
    gateway = _seed_objective("widget-rewrite-layer-1")
    obj = _make_obj(
        gateway=gateway,
        current_branch="widget-rewrite-layer-1",
        branches=("master", "widget-rewrite-layer-1"),
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "update-precheck", "some-other-slug", "--format", "json"],
        obj=obj,
    )
    payload = json.loads(result.output)

    assert result.exit_code == 2
    assert payload["error_type"] == "slug_not_attached"
    assert "some-other-slug" in payload["message"]
    assert "widget-rewrite-layer-1" in payload["message"]


def test_precheck_on_trunk_branch_fails(cli_group: ClinkrGroup) -> None:
    gateway = _seed_objective("master")
    obj = _make_obj(
        gateway=gateway,
        current_branch="master",
        branches=("master",),
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "update-precheck", "widget-rewrite", "--format", "json"],
        obj=obj,
    )
    payload = json.loads(result.output)

    assert result.exit_code == 2
    assert payload["error_type"] == "on_trunk_branch"
    assert "objective-reconcile" in payload["message"]


def test_precheck_detached_head_fails(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(
        gateway=FakeBranchMemoryGateway(),
        current_branch=DetachedHead(),
        branches=("master",),
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "update-precheck", "--format", "json"],
        obj=obj,
    )
    payload = json.loads(result.output)

    assert result.exit_code == 2
    assert payload["error_type"] == "detached_head"
    assert "objective-update" in payload["message"]


def test_precheck_git_log_failure_fails(cli_group: ClinkrGroup) -> None:
    gateway = _seed_objective("widget-rewrite-layer-1")
    obj = _make_obj(
        gateway=gateway,
        current_branch="widget-rewrite-layer-1",
        branches=("master", "widget-rewrite-layer-1"),
        log_range_failure=GitCommandFailure(message="fatal: bad revision", returncode=128),
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "update-precheck", "widget-rewrite", "--format", "json"],
        obj=obj,
    )
    payload = json.loads(result.output)

    assert result.exit_code == 2
    assert payload["error_type"] == "git_failed"
    assert "fatal: bad revision" in payload["message"]


def test_precheck_get_current_branch_failure_fails(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(
        gateway=FakeBranchMemoryGateway(),
        current_branch=GitCommandFailure(message="fatal: not a git repository", returncode=128),
        branches=(),
    )

    result = CliRunner().invoke(
        cli_group,
        ["exec", "update-precheck", "--format", "json"],
        obj=obj,
    )
    payload = json.loads(result.output)

    assert result.exit_code == 2
    assert payload["error_type"] == "git_failed"
    assert "not a git repository" in payload["message"]
