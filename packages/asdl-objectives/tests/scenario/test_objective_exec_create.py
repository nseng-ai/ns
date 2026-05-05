"""Scenario tests for ``objective exec create``.

The skill ``objective-create`` calls this single command to validate a slug
(via ``--dry-run``) before drafting prose, and again — without
``--dry-run`` — to land the canonical ``body.md`` (and optional
``roadmap.md``) once the prose is ready. These tests exercise the contract
end to end via ``build_cli()`` with the standard fake gateways used across
objective scenario tests.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from click.testing import CliRunner

from asdl_core.clinkr.context import ClinkrContextObject, build_clinkr_context_object
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.gh.pr_testing import FakePRGateway
from asdl_core.git.testing import FakeGitGateway
from asdl_core.git.types import DetachedHead
from asdl_objectives.context import ObjectiveCliContext
from asdl_objectives.exec.create import CREATE_SCHEMA
from asdl_objectives.main import build_cli
from brmem.fake import FakeBranchMemoryGateway


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def _make_obj(
    *,
    gateway: FakeBranchMemoryGateway,
    current_branch: str | DetachedHead = "feat/x",
    branches: tuple[str, ...] = ("master", "feat/x"),
    git_common_dir: Path | None = Path("/repo/.git"),
) -> ClinkrContextObject:
    git_gateway = FakeGitGateway(
        current_branch_by_path={Path.cwd(): current_branch},
        branches=branches,
        trunk_branch="master",
        git_common_dir=git_common_dir,
    )
    ctx = ObjectiveCliContext(
        brmem_gateway=gateway,
        git_gateway=git_gateway,
        pr_gateway=FakePRGateway(),
    )
    return build_clinkr_context_object(lambda: ctx)


def _write(tmp: Path, name: str, content: str) -> Path:
    p = tmp / name
    p.write_text(content, encoding="utf-8")
    return p


# ---------------------------------------------------------------------------
# help / json schema
# ---------------------------------------------------------------------------


def test_create_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "create", "-h"])

    assert result.exit_code == 0
    assert "Usage: objective exec create" in result.output


def test_create_json_schema_flag_is_eager(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "create", "--json-schema"])

    assert result.exit_code == 0, result.output
    payload = json.loads(result.stdout)
    assert set(payload) == {"input_json_schema", "output_json_schema"}


# ---------------------------------------------------------------------------
# happy paths: write
# ---------------------------------------------------------------------------


def test_create_body_only(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    gateway = FakeBranchMemoryGateway()
    body = _write(tmp_path, "body.md", "# Widget Rewrite\n\nStatus: planning\n")
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "create",
            "widget-rewrite",
            "--body-file",
            str(body),
            "--format",
            "json",
        ],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["json_schema"] == CREATE_SCHEMA
    assert data["canonical_branch"] == "master"
    assert data["dry_run"] is False
    assert data["status"] == "ok"
    assert data["slug"] == "widget-rewrite"
    files = data["files_written"]
    assert [f["file"] for f in files] == ["body.md"]
    assert files[0]["key"] == "widget-rewrite/body.md"
    assert files[0]["commit_sha"]
    assert data["error"] is None
    assert (
        gateway.get("objectives", "widget-rewrite/body.md", "master")
        == "# Widget Rewrite\n\nStatus: planning\n"
    )
    assert gateway.get("objectives", "widget-rewrite/roadmap.md", "master") is None


def test_create_body_and_roadmap(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    gateway = FakeBranchMemoryGateway()
    body = _write(tmp_path, "body.md", "# body\n")
    roadmap = _write(tmp_path, "roadmap.md", "# roadmap\n")
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "create",
            "widget-rewrite",
            "--body-file",
            str(body),
            "--roadmap-file",
            str(roadmap),
            "--format",
            "json",
        ],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["status"] == "ok"
    files = data["files_written"]
    # Stable order: body first, roadmap second.
    assert [f["file"] for f in files] == ["body.md", "roadmap.md"]
    assert files[0]["key"] == "widget-rewrite/body.md"
    assert files[1]["key"] == "widget-rewrite/roadmap.md"
    assert files[0]["commit_sha"] != files[1]["commit_sha"]
    assert gateway.get("objectives", "widget-rewrite/body.md", "master") == "# body\n"
    assert gateway.get("objectives", "widget-rewrite/roadmap.md", "master") == "# roadmap\n"


# ---------------------------------------------------------------------------
# happy paths: dry-run
# ---------------------------------------------------------------------------


def test_create_dry_run_ok_for_fresh_slug(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(
        cli_group,
        ["exec", "create", "widget-rewrite", "--dry-run", "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["json_schema"] == CREATE_SCHEMA
    assert data["dry_run"] is True
    assert data["status"] == "ok"
    assert data["slug"] == "widget-rewrite"
    assert data["files_written"] == []
    # Critically, no write happened.
    assert gateway.get("objectives", "widget-rewrite/body.md", "master") is None


# ---------------------------------------------------------------------------
# slug collision
# ---------------------------------------------------------------------------


def test_create_dry_run_slug_collision(cli_group: ClinkrGroup) -> None:
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget-rewrite/body.md", "master", "# canonical\n")
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(
        cli_group,
        ["exec", "create", "widget-rewrite", "--dry-run", "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["status"] == "error"
    err = data["error"]
    assert err["reason"] == "slug_collision"
    assert "widget-rewrite" in err["message"]
    assert "objective-update" in err["message"]
    assert data["slug"] is None


def test_create_refuses_when_slug_now_collides(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    """A slug that became occupied between dry-run and write must not write."""
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget-rewrite/body.md", "master", "# already there\n")
    body = _write(tmp_path, "body.md", "# body\n")
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "create",
            "widget-rewrite",
            "--body-file",
            str(body),
            "--format",
            "json",
        ],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["status"] == "error"
    assert data["error"]["reason"] == "slug_collision"
    assert data["files_written"] == []
    assert gateway.get("objectives", "widget-rewrite/body.md", "master") == "# already there\n"


# ---------------------------------------------------------------------------
# slug-format validation
# ---------------------------------------------------------------------------


def test_create_invalid_slug_format(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    """One representative case — full rule coverage lives in unit tests."""
    body = _write(tmp_path, "body.md", "# body\n")
    obj = _make_obj(gateway=FakeBranchMemoryGateway())

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "create",
            "Widget-Rewrite",
            "--body-file",
            str(body),
            "--format",
            "json",
        ],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["status"] == "error"
    assert data["error"]["reason"] == "invalid_slug_format"


# ---------------------------------------------------------------------------
# unreadable input files (after click parse)
# ---------------------------------------------------------------------------


def test_create_body_file_unreadable_after_parse(
    cli_group: ClinkrGroup, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    gateway = FakeBranchMemoryGateway()
    body = _write(tmp_path, "body.md", "# body\n")
    obj = _make_obj(gateway=gateway)

    original_read_text = Path.read_text

    def fail_read_text(self: Path, *args: Any, **kwargs: Any) -> str:
        if self == body:
            raise OSError("permission denied")
        return original_read_text(self, *args, **kwargs)

    monkeypatch.setattr(Path, "read_text", fail_read_text)

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "create",
            "widget-rewrite",
            "--body-file",
            str(body),
            "--format",
            "json",
        ],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["status"] == "error"
    err = data["error"]
    assert err["reason"] == "body_file_unreadable"
    assert "permission denied" in err["message"]
    assert gateway.get("objectives", "widget-rewrite/body.md", "master") is None
    assert data["files_written"] == []


def test_create_roadmap_file_unreadable_caught_before_body_write(
    cli_group: ClinkrGroup, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Roadmap unreadable must be caught BEFORE body.md is written."""
    gateway = FakeBranchMemoryGateway()
    body = _write(tmp_path, "body.md", "# body\n")
    roadmap = _write(tmp_path, "roadmap.md", "# roadmap\n")
    obj = _make_obj(gateway=gateway)

    original_read_text = Path.read_text

    def fail_read_text(self: Path, *args: Any, **kwargs: Any) -> str:
        if self == roadmap:
            raise OSError("permission denied")
        return original_read_text(self, *args, **kwargs)

    monkeypatch.setattr(Path, "read_text", fail_read_text)

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "create",
            "widget-rewrite",
            "--body-file",
            str(body),
            "--roadmap-file",
            str(roadmap),
            "--format",
            "json",
        ],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["status"] == "error"
    assert data["error"]["reason"] == "roadmap_file_unreadable"
    # body.md was NOT written.
    assert gateway.get("objectives", "widget-rewrite/body.md", "master") is None
    assert gateway.get("objectives", "widget-rewrite/roadmap.md", "master") is None


# ---------------------------------------------------------------------------
# roadmap put fails after body succeeds → hard failure carrying body SHA
# ---------------------------------------------------------------------------


def test_create_roadmap_put_failure_surfaces_body_sha(
    cli_group: ClinkrGroup, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    gateway = FakeBranchMemoryGateway()
    body = _write(tmp_path, "body.md", "# body\n")
    roadmap = _write(tmp_path, "roadmap.md", "# roadmap\n")
    obj = _make_obj(gateway=gateway)

    original_put = gateway.put
    state: dict[str, Any] = {"calls": 0, "body_sha": None}

    def flaky_put(
        namespace: str | None,
        key: str,
        branch: str,
        content: str,
    ) -> str:
        state["calls"] += 1
        if state["calls"] == 1:
            sha = original_put(namespace, key, branch, content)
            state["body_sha"] = sha
            return sha
        raise RuntimeError("simulated brmem failure")

    monkeypatch.setattr(gateway, "put", flaky_put)

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "create",
            "widget-rewrite",
            "--body-file",
            str(body),
            "--roadmap-file",
            str(roadmap),
            "--format",
            "json",
        ],
        obj=obj,
    )

    assert result.exit_code == 2, result.output
    payload = json.loads(result.output)
    assert payload["error_type"] == "roadmap_write_failed"
    # The failure message carries the body.md commit SHA so the skill can
    # render a recovery hint without a separate envelope branch.
    assert gateway.get("objectives", "widget-rewrite/body.md", "master") == "# body\n"
    body_sha = state["body_sha"]
    assert body_sha is not None
    assert body_sha in payload["message"]
    assert "objective-update widget-rewrite" in payload["message"]
    # Roadmap never landed.
    assert gateway.get("objectives", "widget-rewrite/roadmap.md", "master") is None


# ---------------------------------------------------------------------------
# guard: --body-file required unless --dry-run
# ---------------------------------------------------------------------------


def test_create_requires_body_file_when_not_dry_run(cli_group: ClinkrGroup) -> None:
    obj = _make_obj(gateway=FakeBranchMemoryGateway())

    result = CliRunner().invoke(
        cli_group,
        ["exec", "create", "widget-rewrite", "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 2, result.output
    payload = json.loads(result.output)
    assert payload["error_type"] == "body_file_required"


# ---------------------------------------------------------------------------
# hard preconditions
# ---------------------------------------------------------------------------


def test_create_detached_head_fails_hard(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    body = _write(tmp_path, "body.md", "# body\n")
    obj = _make_obj(
        gateway=FakeBranchMemoryGateway(),
        current_branch=DetachedHead(),
        branches=("master",),
    )

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "create",
            "widget-rewrite",
            "--body-file",
            str(body),
            "--format",
            "json",
        ],
        obj=obj,
    )

    assert result.exit_code == 2
    payload = json.loads(result.output)
    assert payload["error_type"] == "detached_head"


def test_create_not_in_repo_fails_hard(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    body = _write(tmp_path, "body.md", "# body\n")
    obj = _make_obj(
        gateway=FakeBranchMemoryGateway(),
        git_common_dir=None,
    )

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "create",
            "widget-rewrite",
            "--body-file",
            str(body),
            "--format",
            "json",
        ],
        obj=obj,
    )

    assert result.exit_code == 2
    payload = json.loads(result.output)
    assert payload["error_type"] == "not_in_repo"


# ---------------------------------------------------------------------------
# deterministic JSON shape
# ---------------------------------------------------------------------------


def test_create_envelope_shape_is_deterministic(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    body = _write(tmp_path, "body.md", "# body\n")
    obj = _make_obj(gateway=FakeBranchMemoryGateway())

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "create",
            "widget-rewrite",
            "--body-file",
            str(body),
            "--format",
            "json",
        ],
        obj=obj,
    )

    data = json.loads(result.output)["data"]
    assert set(data.keys()) == {
        "json_schema",
        "canonical_branch",
        "requested_slug",
        "dry_run",
        "status",
        "slug",
        "files_written",
        "error",
    }
    assert data["json_schema"] == CREATE_SCHEMA
    assert data["canonical_branch"] == "master"
