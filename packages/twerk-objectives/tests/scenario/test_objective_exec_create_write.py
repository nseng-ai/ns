"""Scenario tests for ``objective exec create-write``.

The skill ``objective-create`` writes the agent's drafted ``body.md`` (and
optionally ``roadmap.md``) to temp files and runs this command to perform
the canonical writes. These tests exercise the contract end to end via
``build_cli()``: the atomic re-validate-then-write semantics, the partial-
write surface when a second write fails after the first has landed, the
file-readability checks (caught before any write), and the same hard
preconditions as ``create-precheck``.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from click.testing import CliRunner

from brmem.fake import FakeBranchMemoryGateway
from twerk_core.clinkr.context import ClinkrContextObject, build_clinkr_context_object
from twerk_core.clinkr.group import ClinkrGroup
from twerk_core.gh.pr_testing import FakePRGateway
from twerk_core.git.testing import FakeGitGateway
from twerk_core.git.types import DetachedHead
from twerk_objectives.context import ObjectiveCliContext
from twerk_objectives.exec.create_write import WRITE_SCHEMA
from twerk_objectives.main import build_cli


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
# help / schema
# ---------------------------------------------------------------------------


def test_create_write_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "create-write", "-h"])

    assert result.exit_code == 0
    assert "Usage: objective exec create-write" in result.output


def test_create_write_schema_flag_is_eager(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "create-write", "--schema"])

    assert result.exit_code == 0, result.output
    payload = json.loads(result.stdout)
    assert set(payload) == {"input_schema", "output_schema"}


# ---------------------------------------------------------------------------
# happy path: body only
# ---------------------------------------------------------------------------


def test_create_write_body_only(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    gateway = FakeBranchMemoryGateway()
    body = _write(tmp_path, "body.md", "# Widget Rewrite\n\nStatus: planning\n")
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "create-write",
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
    assert data["schema"] == WRITE_SCHEMA
    assert data["status"] == "ok"
    assert data["slug"] == "widget-rewrite"
    assert data["target_branch"] == "master"
    files = data["files_written"]
    assert [f["file"] for f in files] == ["body.md"]
    assert files[0]["key"] == "widget-rewrite/body.md"
    assert files[0]["commit_sha"]
    assert data["error"] is None
    # Actually landed.
    assert (
        gateway.get("objectives", "widget-rewrite/body.md", "master")
        == "# Widget Rewrite\n\nStatus: planning\n"
    )
    # No roadmap synthesized.
    assert gateway.get("objectives", "widget-rewrite/roadmap.md", "master") is None


# ---------------------------------------------------------------------------
# happy path: body + roadmap, fixed write order
# ---------------------------------------------------------------------------


def test_create_write_body_and_roadmap(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    gateway = FakeBranchMemoryGateway()
    body = _write(tmp_path, "body.md", "# body\n")
    roadmap = _write(tmp_path, "roadmap.md", "# roadmap\n")
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "create-write",
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
# slug collision re-check at write time
# ---------------------------------------------------------------------------


def test_create_write_refuses_when_slug_now_collides(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    """A slug that became occupied between precheck and write must not write."""
    gateway = FakeBranchMemoryGateway()
    gateway.put("objectives", "widget-rewrite/body.md", "master", "# already there\n")
    body = _write(tmp_path, "body.md", "# body\n")
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "create-write",
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
    assert err["reason"] == "slug_collision"
    assert err["files_written"] == []
    # The pre-existing content was not touched.
    assert gateway.get("objectives", "widget-rewrite/body.md", "master") == "# already there\n"


# ---------------------------------------------------------------------------
# slug-format invalid -> structured error
# ---------------------------------------------------------------------------


def test_create_write_invalid_slug_format(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    body = _write(tmp_path, "body.md", "# body\n")
    obj = _make_obj(gateway=FakeBranchMemoryGateway())

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "create-write",
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
# missing / unreadable files
# ---------------------------------------------------------------------------


def test_create_write_body_file_missing_at_parse_time(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    """``click.Path(exists=True)`` rejects the missing path before our code runs."""
    obj = _make_obj(gateway=FakeBranchMemoryGateway())

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "create-write",
            "widget-rewrite",
            "--body-file",
            str(tmp_path / "missing.md"),
            "--format",
            "json",
        ],
        obj=obj,
    )

    # click parsing rejection -> non-zero exit, no JSON envelope.
    assert result.exit_code != 0


def test_create_write_roadmap_file_missing_caught_before_body_write(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    """Roadmap missing must be caught before body.md is committed."""
    gateway = FakeBranchMemoryGateway()
    body = _write(tmp_path, "body.md", "# body\n")
    obj = _make_obj(gateway=gateway)

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "create-write",
            "widget-rewrite",
            "--body-file",
            str(body),
            "--roadmap-file",
            str(tmp_path / "missing-roadmap.md"),
            "--format",
            "json",
        ],
        obj=obj,
    )

    # click parsing rejects the missing roadmap path before our code runs;
    # critically, body.md must not have been written.
    assert result.exit_code != 0
    assert gateway.get("objectives", "widget-rewrite/body.md", "master") is None


def test_create_write_body_file_unreadable_after_parse(
    cli_group: ClinkrGroup, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A file that exists at parse time but fails to read produces a structured error."""
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
            "create-write",
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
    # No write happened.
    assert gateway.get("objectives", "widget-rewrite/body.md", "master") is None
    assert err["files_written"] == []


def test_create_write_roadmap_file_unreadable_caught_before_body_write(
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
            "create-write",
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
    # Critically, body.md was NOT written.
    assert gateway.get("objectives", "widget-rewrite/body.md", "master") is None
    assert gateway.get("objectives", "widget-rewrite/roadmap.md", "master") is None


def test_create_write_partial_write_when_roadmap_put_fails(
    cli_group: ClinkrGroup, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """If body.md write succeeds but roadmap.md ``brmem put`` raises, surface partial_write."""
    gateway = FakeBranchMemoryGateway()
    body = _write(tmp_path, "body.md", "# body\n")
    roadmap = _write(tmp_path, "roadmap.md", "# roadmap\n")
    obj = _make_obj(gateway=gateway)

    original_put = gateway.put
    call_count = {"n": 0}

    def flaky_put(
        namespace: str | None,
        key: str,
        branch: str,
        content: str,
    ) -> str:
        call_count["n"] += 1
        if call_count["n"] == 1:
            return original_put(namespace, key, branch, content)
        raise RuntimeError("simulated brmem failure")

    monkeypatch.setattr(gateway, "put", flaky_put)

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "create-write",
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
    err = data["error"]
    assert err["reason"] == "partial_write"
    # body.md SHA carried in the failure payload for the recovery hint.
    assert len(err["files_written"]) == 1
    assert err["files_written"][0]["file"] == "body.md"
    assert err["files_written"][0]["commit_sha"]
    # body.md is permanent; roadmap.md never landed.
    assert gateway.get("objectives", "widget-rewrite/body.md", "master") == "# body\n"
    assert gateway.get("objectives", "widget-rewrite/roadmap.md", "master") is None
    # The top-level files_written reflects what actually persisted (body only).
    assert [f["file"] for f in data["files_written"]] == ["body.md"]
    assert data["files_written"][0]["commit_sha"] == err["files_written"][0]["commit_sha"]


# ---------------------------------------------------------------------------
# hard preconditions
# ---------------------------------------------------------------------------


def test_create_write_detached_head_fails_hard(cli_group: ClinkrGroup, tmp_path: Path) -> None:
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
            "create-write",
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


def test_create_write_not_in_repo_fails_hard(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    body = _write(tmp_path, "body.md", "# body\n")
    obj = _make_obj(
        gateway=FakeBranchMemoryGateway(),
        git_common_dir=None,
    )

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "create-write",
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


def test_create_write_envelope_shape_is_deterministic(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    body = _write(tmp_path, "body.md", "# body\n")
    obj = _make_obj(gateway=FakeBranchMemoryGateway())

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "create-write",
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
        "schema",
        "canonical_branch",
        "requested_slug",
        "status",
        "slug",
        "target_branch",
        "files_written",
        "error",
    }
    assert data["schema"] == WRITE_SCHEMA
    assert data["canonical_branch"] == "master"
    assert data["target_branch"] == "master"
