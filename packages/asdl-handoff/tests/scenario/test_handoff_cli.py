from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from click.testing import CliRunner

from asdl_core.clinkr.context import ClinkrContextObject, build_clinkr_context_object
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.git.testing import FakeGitGateway
from asdl_core.git.types import DetachedHead, GitCommandFailure
from asdl_handoff.cli.handoff.context import HandoffCliContext
from asdl_handoff.cli.main import build_cli
from brmem.fake import FakeBranchMemoryGateway
from brmem.gateway import BranchMemoryGateway


class _TimestamplessBranchMemoryGateway(FakeBranchMemoryGateway):
    def get_entry_updated_at(self, namespace: str, key: str, branch: str) -> str | None:
        return None


class _TimestamplessDeletedBranchMemoryGateway(FakeBranchMemoryGateway):
    def get_entry_updated_at(self, namespace: str, key: str, branch: str) -> str | None:
        if branch == "feat/deleted":
            return None
        return super().get_entry_updated_at(namespace, key, branch)


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def _json_output(text: str) -> dict[str, Any]:
    return json.loads(text)


def _make_obj(
    *,
    gateway: BranchMemoryGateway | None = None,
    branch: str | DetachedHead | GitCommandFailure | None = "feat/x",
    branches: tuple[str, ...] | None = None,
) -> ClinkrContextObject:
    brmem_gateway = gateway if gateway is not None else FakeBranchMemoryGateway()
    seeded_branches = (
        branches if branches is not None else ((branch,) if isinstance(branch, str) else ())
    )
    if branch is None:
        git_gateway = FakeGitGateway(branches=seeded_branches)
    else:
        git_gateway = FakeGitGateway(
            branches=seeded_branches,
            current_branch_by_path={Path.cwd(): branch},
        )
    ctx = HandoffCliContext(brmem_gateway=brmem_gateway, git_gateway=git_gateway)
    return build_clinkr_context_object(lambda: ctx)


def test_handoff_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["-h"])

    assert result.exit_code == 0
    assert "Usage: handoff" in result.output
    assert "Work with directed handoff artifacts." in result.output
    assert "--version" in result.output
    assert "list" in result.output
    assert "gc" in result.output


def test_handoff_version(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["--version"])

    assert result.exit_code == 0
    assert "0.1.0" in result.output


def test_handoff_list_help_uses_all_and_include_deleted_flags(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["list", "-h"])

    assert result.exit_code == 0
    assert "--all" in result.output
    assert "--include-deleted" in result.output
    assert "--all-branches" not in result.output


def test_handoff_gc_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["gc", "-h"])

    assert result.exit_code == 0
    assert "Usage: handoff gc" in result.output
    assert "--dry-run" in result.output
    assert "--force" in result.output


def test_handoff_list_defaults_to_current_branch(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("handoffs", "alpha.md", "feat/x", "alpha")
    gateway.put("handoffs", "bravo.md", "feat/y", "bravo")
    gateway.put("notes", "ignore.md", "feat/x", "ignored")
    gateway.put("handoffs", "nested/ignore.md", "feat/x", "ignored")
    gateway.put("handoffs", "not-md.txt", "feat/x", "ignored")

    result = CliRunner().invoke(
        cli_group,
        ["list"],
        obj=_make_obj(gateway=gateway),
        terminal_width=120,
    )

    assert result.exit_code == 0, result.output
    assert "Handoffs on feat/x" in result.output
    assert "Handoff" in result.output
    assert "Updated" in result.output
    assert "alpha" in result.output
    assert "bravo" not in result.output
    assert "ago" in result.output or "just now" in result.output


def test_handoff_list_explicit_branch_bypasses_current_branch(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("handoffs", "bravo.md", "feat/other", "bravo")

    result = CliRunner().invoke(
        cli_group,
        ["list", "--branch", "feat/other"],
        obj=_make_obj(gateway=gateway, branch=DetachedHead(), branches=("feat/other",)),
        terminal_width=120,
    )

    assert result.exit_code == 0, result.output
    assert "Handoffs on feat/other" in result.output
    assert "Handoff" in result.output
    assert "Updated" in result.output
    assert "bravo" in result.output
    assert "ago" in result.output or "just now" in result.output


def test_handoff_list_explicit_deleted_branch_requires_include_deleted(
    cli_group: ClinkrGroup,
) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("handoffs", "stale.md", "feat/deleted", "stale")

    hidden = CliRunner().invoke(
        cli_group,
        ["list", "--branch", "feat/deleted"],
        obj=_make_obj(gateway=gateway, branch=DetachedHead()),
        terminal_width=120,
    )
    shown = CliRunner().invoke(
        cli_group,
        ["list", "--branch", "feat/deleted", "--include-deleted"],
        obj=_make_obj(gateway=gateway, branch=DetachedHead()),
        terminal_width=120,
    )

    assert hidden.exit_code == 0, hidden.output
    assert hidden.output == "No saved handoffs found on branch feat/deleted.\n"
    assert shown.exit_code == 0, shown.output
    assert "Handoffs on feat/deleted" in shown.output
    assert "stale" in shown.output


def test_handoff_list_all_branches_defaults_to_active_branches(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("handoffs", "bravo.md", "feat/b", "bravo")
    gateway.put("handoffs", "charlie.md", "feat/a", "charlie")
    gateway.put("handoffs", "alpha.md", "feat/a", "alpha")

    result = CliRunner().invoke(
        cli_group,
        ["list", "--all"],
        obj=_make_obj(gateway=gateway, branch=DetachedHead(), branches=("feat/a",)),
        terminal_width=120,
    )

    assert result.exit_code == 0, result.output
    assert "Handoffs across active branches" in result.output
    assert "Branch" in result.output
    assert "State" in result.output
    assert "Handoff" in result.output
    assert "Updated" in result.output
    assert "feat/a" in result.output
    assert "feat/b" not in result.output
    assert "active" in result.output
    assert "deleted" not in result.output
    assert "alpha" in result.output
    assert "charlie" in result.output
    assert "bravo" not in result.output
    assert "ago" in result.output or "just now" in result.output


def test_handoff_list_all_branches_can_include_deleted_branches(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("handoffs", "bravo.md", "feat/b", "bravo")
    gateway.put("handoffs", "charlie.md", "feat/a", "charlie")
    gateway.put("handoffs", "alpha.md", "feat/a", "alpha")

    result = CliRunner().invoke(
        cli_group,
        ["list", "--all", "--include-deleted"],
        obj=_make_obj(gateway=gateway, branch=DetachedHead(), branches=("feat/a",)),
        terminal_width=120,
    )

    assert result.exit_code == 0, result.output
    assert "Handoffs across branches" in result.output
    assert "Handoffs across active branches" not in result.output
    assert "Branch" in result.output
    assert "State" in result.output
    assert "Handoff" in result.output
    assert "Updated" in result.output
    assert "feat/a" in result.output
    assert "feat/b" in result.output
    assert "active" in result.output
    assert "deleted" in result.output
    assert "alpha" in result.output
    assert "charlie" in result.output
    assert "bravo" in result.output
    assert "ago" in result.output or "just now" in result.output


def test_handoff_markdown_list_current_branch_sorts_newest_first(
    cli_group: ClinkrGroup,
) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("handoffs", "alpha.md", "feat/x", "alpha v1")
    gateway.put("handoffs", "bravo.md", "feat/x", "bravo")
    gateway.put("handoffs", "alpha.md", "feat/x", "alpha v2")

    result = CliRunner().invoke(
        cli_group,
        ["list", "--format", "markdown"],
        obj=_make_obj(gateway=gateway),
    )

    assert result.exit_code == 0, result.output
    assert result.output.splitlines() == [
        "Handoffs on feat/x",
        "",
        "| handoff | updated |",
        "| --- | --- |",
        "| alpha | 2026-01-01T00:00:03+00:00 |",
        "| bravo | 2026-01-01T00:00:02+00:00 |",
    ]


def test_handoff_markdown_list_all_branches_sorts_by_branch_then_newest(
    cli_group: ClinkrGroup,
) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("handoffs", "bravo.md", "feat/b", "bravo")
    gateway.put("handoffs", "charlie.md", "feat/a", "charlie")
    gateway.put("handoffs", "alpha.md", "feat/a", "alpha")

    result = CliRunner().invoke(
        cli_group,
        ["list", "--all", "--include-deleted", "--format", "markdown"],
        obj=_make_obj(gateway=gateway, branch=DetachedHead(), branches=("feat/a",)),
    )

    assert result.exit_code == 0, result.output
    assert result.output.splitlines() == [
        "Handoffs across branches",
        "",
        "| branch | state | handoff | updated |",
        "| --- | --- | --- | --- |",
        "| feat/a | active | alpha | 2026-01-01T00:00:03+00:00 |",
        "| feat/a | active | charlie | 2026-01-01T00:00:02+00:00 |",
        "| feat/b | deleted | bravo | 2026-01-01T00:00:01+00:00 |",
    ]


def test_handoff_json_list_all_branches_defaults_to_active_branches(
    cli_group: ClinkrGroup,
) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("handoffs", "alpha.md", "feat/a", "alpha")
    gateway.put("handoffs", "bravo.md", "feat/b", "bravo")

    result = CliRunner().invoke(
        cli_group,
        ["list", "--all", "--format", "json"],
        obj=_make_obj(gateway=gateway, branch=DetachedHead(), branches=("feat/a",)),
    )
    payload = _json_output(result.output)

    assert result.exit_code == 0, result.output
    assert payload["exit_code"] == 0
    assert payload["data"] == {
        "scope": "all-branches",
        "branch": None,
        "include_deleted": False,
        "handoffs": [
            {
                "branch": "feat/a",
                "branch_state": "active",
                "slug": "alpha",
                "key": "alpha.md",
                "entry_locator": "refs/brmem/ns/handoffs/feat---a:alpha.md",
                "updated_at": "2026-01-01T00:00:01+00:00",
            },
        ],
    }


def test_handoff_json_list_all_branches_can_include_deleted_branches(
    cli_group: ClinkrGroup,
) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("handoffs", "alpha.md", "feat/a", "alpha")
    gateway.put("handoffs", "bravo.md", "feat/b", "bravo")

    result = CliRunner().invoke(
        cli_group,
        ["list", "--all", "--include-deleted", "--format", "json"],
        obj=_make_obj(gateway=gateway, branch=DetachedHead(), branches=("feat/a",)),
    )
    payload = _json_output(result.output)

    assert result.exit_code == 0, result.output
    assert payload["exit_code"] == 0
    assert payload["data"] == {
        "scope": "all-branches",
        "branch": None,
        "include_deleted": True,
        "handoffs": [
            {
                "branch": "feat/a",
                "branch_state": "active",
                "slug": "alpha",
                "key": "alpha.md",
                "entry_locator": "refs/brmem/ns/handoffs/feat---a:alpha.md",
                "updated_at": "2026-01-01T00:00:01+00:00",
            },
            {
                "branch": "feat/b",
                "branch_state": "deleted",
                "slug": "bravo",
                "key": "bravo.md",
                "entry_locator": "refs/brmem/ns/handoffs/feat---b:bravo.md",
                "updated_at": "2026-01-01T00:00:02+00:00",
            },
        ],
    }


def test_handoff_list_rejects_all_branches_alias(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["list", "--all-branches"],
        obj=_make_obj(),
    )

    assert result.exit_code == 2
    assert "No such option" in result.output
    assert "--all-branches" in result.output


def test_handoff_list_fails_when_updated_timestamp_is_unavailable(
    cli_group: ClinkrGroup,
) -> None:
    gateway = _TimestamplessBranchMemoryGateway()
    gateway.put("handoffs", "alpha.md", "feat/x", "alpha")

    result = CliRunner().invoke(
        cli_group,
        ["list", "--format", "json"],
        obj=_make_obj(gateway=gateway),
    )
    payload = _json_output(result.output)

    assert result.exit_code == 2
    assert payload["error_type"] == "handoff_updated_at_unavailable"
    assert "Cannot determine updated timestamp" in payload["message"]
    assert "alpha" in payload["message"]


def test_handoff_list_all_skips_deleted_entries_before_loading_timestamps(
    cli_group: ClinkrGroup,
) -> None:
    gateway = _TimestamplessDeletedBranchMemoryGateway()
    gateway.put("handoffs", "live.md", "feat/live", "live")
    gateway.put("handoffs", "stale.md", "feat/deleted", "stale")

    result = CliRunner().invoke(
        cli_group,
        ["list", "--all", "--format", "json"],
        obj=_make_obj(gateway=gateway, branch=DetachedHead(), branches=("feat/live",)),
    )
    payload = _json_output(result.output)

    assert result.exit_code == 0, result.output
    assert [handoff["slug"] for handoff in payload["data"]["handoffs"]] == ["live"]


def test_handoff_list_empty_returns_message(cli_group: ClinkrGroup) -> None:
    current = CliRunner().invoke(cli_group, ["list"], obj=_make_obj())
    all_active_branches = CliRunner().invoke(
        cli_group,
        ["list", "--all"],
        obj=_make_obj(branch=DetachedHead()),
    )
    all_branches = CliRunner().invoke(
        cli_group,
        ["list", "--all", "--include-deleted"],
        obj=_make_obj(branch=DetachedHead()),
    )

    assert current.exit_code == 0, current.output
    assert current.output == "No saved handoffs found on branch feat/x.\n"
    assert all_active_branches.exit_code == 0, all_active_branches.output
    assert all_active_branches.output == "No saved handoffs found across active branches.\n"
    assert all_branches.exit_code == 0, all_branches.output
    assert all_branches.output == "No saved handoffs found across branches.\n"


def test_handoff_list_rejects_detached_head_when_branch_omitted(
    cli_group: ClinkrGroup,
) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["list", "--include-deleted"],
        obj=_make_obj(branch=DetachedHead()),
    )

    assert result.exit_code == 2
    assert "Cannot list handoffs in detached HEAD" in result.output
    assert "--all" in result.output
    assert "--all-branches" not in result.output


def test_handoff_list_surfaces_git_failure_when_branch_omitted(
    cli_group: ClinkrGroup,
) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["list"],
        obj=_make_obj(
            branch=GitCommandFailure(
                message="fatal: not a git repository",
                returncode=128,
            )
        ),
    )

    assert result.exit_code == 2
    assert "not a git repository" in result.output


def test_handoff_list_branch_and_all_conflict(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["list", "--branch", "feat/x", "--all", "--include-deleted", "--format", "json"],
        obj=_make_obj(),
    )
    payload = _json_output(result.output)

    assert result.exit_code == 2
    assert payload["error_type"] == "branch_and_all_conflict"
    assert "--branch and --all are mutually exclusive." in payload["message"]


def test_handoff_list_rejects_invalid_branch(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["list", "--branch", "feat---x", "--format", "json"],
        obj=_make_obj(),
    )
    payload = _json_output(result.output)

    assert result.exit_code == 2
    assert payload["error_type"] == "invalid_branch_name"
    assert "feat---x" in payload["message"]


def test_handoff_gc_dry_run_preserves_deleted_branch_handoffs(
    cli_group: ClinkrGroup,
) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("handoffs", "live.md", "feat/live", "live")
    gateway.put("handoffs", "stale.md", "feat/deleted", "stale")

    result = CliRunner().invoke(
        cli_group,
        ["gc", "--dry-run", "--format", "json"],
        obj=_make_obj(gateway=gateway, branch=DetachedHead(), branches=("feat/live",)),
    )
    payload = _json_output(result.stdout)

    assert result.exit_code == 0, result.output
    data = payload["data"]
    assert data["would_delete_count"] == 1
    assert data["deleted_count"] == 0
    assert data["kept_count"] == 1
    assert data["error_count"] == 0
    assert data["dry_run"] is True
    assert data["cancelled"] is False
    actions_by_slug = {entry["slug"]: entry["action"] for entry in data["entries"]}
    assert actions_by_slug == {"live": "kept_active", "stale": "would_delete"}
    assert gateway.get("handoffs", "stale.md", "feat/deleted") == "stale"


def test_handoff_gc_force_deletes_handoffs_for_deleted_branches(
    cli_group: ClinkrGroup,
) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("handoffs", "live.md", "feat/live", "live")
    gateway.put("handoffs", "stale.md", "feat/deleted", "stale")

    result = CliRunner().invoke(
        cli_group,
        ["gc", "--force", "--format", "json"],
        obj=_make_obj(gateway=gateway, branch=DetachedHead(), branches=("feat/live",)),
    )
    payload = _json_output(result.stdout)

    assert result.exit_code == 0, result.output
    data = payload["data"]
    assert data["would_delete_count"] == 0
    assert data["deleted_count"] == 1
    assert data["kept_count"] == 1
    assert data["error_count"] == 0
    actions_by_slug = {entry["slug"]: entry["action"] for entry in data["entries"]}
    assert actions_by_slug == {"live": "kept_active", "stale": "deleted"}
    assert gateway.get("handoffs", "stale.md", "feat/deleted") is None
    assert gateway.get("handoffs", "live.md", "feat/live") == "live"


def test_handoff_gc_prompts_and_accepts(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("handoffs", "live.md", "feat/live", "live")
    gateway.put("handoffs", "stale.md", "feat/deleted", "stale")

    result = CliRunner().invoke(
        cli_group,
        ["gc"],
        obj=_make_obj(gateway=gateway, branch=DetachedHead(), branches=("feat/live",)),
        input="y\n",
    )

    assert result.exit_code == 0, result.output
    assert "Would delete 1" in result.output
    assert "Delete 1 handoff(s)? [y/N]" in result.output
    assert "Deleted 1" in result.output
    assert gateway.get("handoffs", "stale.md", "feat/deleted") is None
    assert gateway.get("handoffs", "live.md", "feat/live") == "live"


def test_handoff_gc_prompts_and_declines(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("handoffs", "live.md", "feat/live", "live")
    gateway.put("handoffs", "stale.md", "feat/deleted", "stale")

    result = CliRunner().invoke(
        cli_group,
        ["gc"],
        obj=_make_obj(gateway=gateway, branch=DetachedHead(), branches=("feat/live",)),
        input="n\n",
    )

    assert result.exit_code == 0, result.output
    assert "Would delete 1" in result.output
    assert "Cancelled" in result.output
    assert gateway.get("handoffs", "stale.md", "feat/deleted") == "stale"
    assert gateway.get("handoffs", "live.md", "feat/live") == "live"


def test_handoff_gc_no_candidates_skips_prompt(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("handoffs", "live.md", "feat/live", "live")

    result = CliRunner().invoke(
        cli_group,
        ["gc"],
        obj=_make_obj(gateway=gateway, branch=DetachedHead(), branches=("feat/live",)),
    )

    assert result.exit_code == 0, result.output
    assert "No handoffs for deleted branches." in result.output
    assert "Delete 1 handoff" not in result.output
    assert gateway.get("handoffs", "live.md", "feat/live") == "live"


def test_handoff_gc_dry_run_and_force_conflict(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(
        cli_group,
        ["gc", "--dry-run", "--force", "--format", "json"],
        obj=_make_obj(),
    )
    payload = _json_output(result.output)

    assert result.exit_code == 2
    assert payload["error_type"] == "conflicting_flags"
    assert "--dry-run and --force are mutually exclusive." in payload["message"]


def test_handoff_gc_json_interactive_decline_keeps_stdout_machine_readable(
    cli_group: ClinkrGroup,
) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("handoffs", "stale.md", "feat/deleted", "stale")

    result = CliRunner().invoke(
        cli_group,
        ["gc", "--format", "json"],
        obj=_make_obj(gateway=gateway, branch=DetachedHead()),
        input="no\n",
    )
    payload = _json_output(result.stdout)

    assert result.exit_code == 0, result.output
    assert "Would delete 1" in result.stderr
    assert "Delete 1 handoff(s)? [y/N]" in result.stderr
    assert payload["data"]["cancelled"] is True
    assert payload["data"]["would_delete_count"] == 1
    assert gateway.get("handoffs", "stale.md", "feat/deleted") == "stale"
