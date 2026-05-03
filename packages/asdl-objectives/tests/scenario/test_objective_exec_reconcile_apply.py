"""Scenario tests for ``objective exec reconcile-apply``.

The skill ``objective-reconcile`` writes proposed Markdown files to disk,
extends the plan envelope with ``proposed_writes`` arrays per slug, and
runs this command to perform serial canonical writes. Tests cover plan-
file shape validation, drift detection, recovery hint format, serial write
order, and per-slug failure isolation.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from click.testing import CliRunner

from asdl_core.clinkr.context import ClinkrContextObject, build_clinkr_context_object
from asdl_core.clinkr.group import ClinkrGroup
from asdl_core.gh.pr_testing import FakePRGateway
from asdl_core.git.testing import FakeGitGateway
from asdl_objectives.context import ObjectiveCliContext
from asdl_objectives.exec.reconcile_plan import PLAN_SCHEMA
from asdl_objectives.main import build_cli
from brmem.fake import FakeBranchMemoryGateway


@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()


def _make_obj(gateway: FakeBranchMemoryGateway) -> ClinkrContextObject:
    git_gateway = FakeGitGateway(
        current_branch_by_path={Path.cwd(): "master"},
        branches=("master",),
        trunk_branch="master",
    )
    ctx = ObjectiveCliContext(
        brmem_gateway=gateway,
        git_gateway=git_gateway,
        pr_gateway=FakePRGateway(),
    )
    return build_clinkr_context_object(lambda: ctx)


def _seed_canonical(
    gateway: FakeBranchMemoryGateway,
    slug: str,
    body: str = "# canonical body\n",
    roadmap: str | None = None,
    notes: str | None = None,
) -> dict[str, dict[str, str]]:
    """Seed canonical files for ``slug``.

    Returns ``{filename: {"blob_sha": ..., "head_sha": ...}}`` so callers
    can build plan envelopes carrying both per-file expectations.
    """
    gateway.put("objectives", f"{slug}/body.md", "master", body)
    if roadmap is not None:
        gateway.put("objectives", f"{slug}/roadmap.md", "master", roadmap)
    if notes is not None:
        gateway.put("objectives", f"{slug}/notes.md", "master", notes)
    shas: dict[str, dict[str, str]] = {}
    for filename in ("body.md", "roadmap.md", "notes.md"):
        diag = gateway.check("objectives", f"{slug}/{filename}", "master")
        if diag is not None:
            shas[filename] = {"blob_sha": diag.blob_sha, "head_sha": diag.head_sha}
    return shas


def _file_block(
    *,
    file: str,
    key: str,
    present: bool = True,
    blob_sha: str | None,
    head_sha: str | None,
    content: str = "",
) -> dict:
    return {
        "file": file,
        "key": key,
        "present": present,
        "expected_old_blob_sha": blob_sha,
        "expected_old_head_sha": head_sha,
        "content": content,
    }


def _plan_payload(
    *,
    slugs: list[dict],
    schema: str = PLAN_SCHEMA,
    canonical_branch: str = "master",
) -> dict:
    return {
        "schema": schema,
        "canonical_branch": canonical_branch,
        "requested_slugs": [],
        "slugs": slugs,
    }


def _write_plan_file(
    tmp_path: Path,
    *,
    slugs: list[dict],
    schema: str = PLAN_SCHEMA,
    canonical_branch: str = "master",
) -> Path:
    plan_path = tmp_path / "plan.json"
    plan_path.write_text(
        json.dumps(_plan_payload(slugs=slugs, schema=schema, canonical_branch=canonical_branch)),
        encoding="utf-8",
    )
    return plan_path


def _write_proposed(tmp_path: Path, name: str, content: str) -> Path:
    path = tmp_path / name
    path.write_text(content, encoding="utf-8")
    return path


def _write_proposed_dir_file(
    tmp_path: Path,
    *,
    slug: str,
    filename: str,
    content: str,
) -> Path:
    path = tmp_path / slug / f"{filename}.proposed"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return path


# ---------------------------------------------------------------------------
# help / schema
# ---------------------------------------------------------------------------


def test_reconcile_apply_help(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "reconcile-apply", "-h"])

    assert result.exit_code == 0
    assert "Usage: objective exec reconcile-apply" in result.output


def test_reconcile_apply_schema_flag_is_eager(cli_group: ClinkrGroup) -> None:
    result = CliRunner().invoke(cli_group, ["exec", "reconcile-apply", "--schema"])

    assert result.exit_code == 0, result.output
    payload = json.loads(result.stdout)
    assert set(payload) == {"input_schema", "output_schema"}


# ---------------------------------------------------------------------------
# happy path — well-formed plan applies with new SHAs and recovery hints
# ---------------------------------------------------------------------------


def test_reconcile_apply_writes_proposed_file(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    gateway = FakeBranchMemoryGateway()
    shas = _seed_canonical(gateway, "widget-rewrite", body="# old body\n")
    body_proposed = _write_proposed(tmp_path, "body.md.proposed", "# rewritten body\n")
    plan = _write_plan_file(
        tmp_path,
        slugs=[
            {
                "slug": "widget-rewrite",
                "canonical_present": True,
                "canonical_files": [
                    _file_block(
                        file="body.md",
                        key="widget-rewrite/body.md",
                        blob_sha=shas["body.md"]["blob_sha"],
                        head_sha=shas["body.md"]["head_sha"],
                        content="# old body\n",
                    ),
                ],
                "included_snapshots": [],
                "skipped_snapshots": [],
                "conflicts": [],
                "gaps": [],
                "proposed_writes": [
                    {"file": "body.md", "proposed_path": str(body_proposed)},
                ],
            }
        ],
    )
    obj = _make_obj(gateway)

    result = CliRunner().invoke(
        cli_group,
        ["exec", "reconcile-apply", "--plan-file", str(plan), "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert data["schema"] == PLAN_SCHEMA
    assert data["canonical_branch"] == "master"
    slug_result = data["slugs"][0]
    assert slug_result["slug"] == "widget-rewrite"
    assert slug_result["skipped"] == []
    assert slug_result["gaps"] == []
    write = slug_result["writes"][0]
    assert write["file"] == "body.md"
    assert write["key"] == "widget-rewrite/body.md"
    assert write["old_blob_sha"] == shas["body.md"]["blob_sha"]
    assert write["old_head_sha"] == shas["body.md"]["head_sha"]
    assert write["new_head_sha"] != shas["body.md"]["head_sha"]
    assert write["recovery_command"] == (
        f"brmem get widget-rewrite/body.md --namespace objectives "
        f"--branch master --at {shas['body.md']['head_sha']}"
    )
    # The new content actually landed.
    assert gateway.get("objectives", "widget-rewrite/body.md", "master") == "# rewritten body\n"


def test_reconcile_apply_accepts_clinkr_plan_envelope(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    gateway = FakeBranchMemoryGateway()
    shas = _seed_canonical(gateway, "widget-rewrite", body="# old body\n")
    body_proposed = _write_proposed(tmp_path, "body.md.proposed", "# rewritten body\n")
    plan_data = _plan_payload(
        slugs=[
            {
                "slug": "widget-rewrite",
                "canonical_present": True,
                "canonical_files": [
                    _file_block(
                        file="body.md",
                        key="widget-rewrite/body.md",
                        blob_sha=shas["body.md"]["blob_sha"],
                        head_sha=shas["body.md"]["head_sha"],
                    ),
                ],
                "included_snapshots": [],
                "skipped_snapshots": [],
                "conflicts": [],
                "gaps": [],
                "proposed_writes": [
                    {"file": "body.md", "proposed_path": str(body_proposed)},
                ],
            }
        ],
    )
    plan = tmp_path / "plan-envelope.json"
    plan.write_text(json.dumps({"exit_code": 0, "data": plan_data}), encoding="utf-8")
    obj = _make_obj(gateway)

    result = CliRunner().invoke(
        cli_group,
        ["exec", "reconcile-apply", "--plan-file", str(plan), "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    slug_result = json.loads(result.output)["data"]["slugs"][0]
    assert [write["file"] for write in slug_result["writes"]] == ["body.md"]
    assert gateway.get("objectives", "widget-rewrite/body.md", "master") == "# rewritten body\n"


# ---------------------------------------------------------------------------
# drift detection
# ---------------------------------------------------------------------------


def test_reconcile_apply_rejects_when_canonical_drifted(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    gateway = FakeBranchMemoryGateway()
    _seed_canonical(gateway, "widget-rewrite", body="# old\n")
    body_proposed = _write_proposed(tmp_path, "body.md.proposed", "# new\n")
    plan = _write_plan_file(
        tmp_path,
        slugs=[
            {
                "slug": "widget-rewrite",
                "canonical_present": True,
                "canonical_files": [
                    _file_block(
                        file="body.md",
                        key="widget-rewrite/body.md",
                        blob_sha="stale-blob-sha-from-old-plan",
                        head_sha="stale-head-sha",
                        content="# old\n",
                    ),
                ],
                "included_snapshots": [],
                "skipped_snapshots": [],
                "conflicts": [],
                "gaps": [],
                "proposed_writes": [
                    {"file": "body.md", "proposed_path": str(body_proposed)},
                ],
            }
        ],
    )
    obj = _make_obj(gateway)

    result = CliRunner().invoke(
        cli_group,
        ["exec", "reconcile-apply", "--plan-file", str(plan), "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    slug_result = json.loads(result.output)["data"]["slugs"][0]
    assert slug_result["writes"] == []
    assert len(slug_result["skipped"]) == 1
    skip = slug_result["skipped"][0]
    assert skip["file"] == "body.md"
    assert "drift" in skip["reason"]
    # Canonical content unchanged.
    assert gateway.get("objectives", "widget-rewrite/body.md", "master") == "# old\n"


# ---------------------------------------------------------------------------
# malformed plan-file / schema mismatch
# ---------------------------------------------------------------------------


def test_reconcile_apply_rejects_malformed_json(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    plan_path = tmp_path / "bad.json"
    plan_path.write_text("not-json", encoding="utf-8")
    obj = _make_obj(FakeBranchMemoryGateway())

    result = CliRunner().invoke(
        cli_group,
        ["exec", "reconcile-apply", "--plan-file", str(plan_path), "--format", "json"],
        obj=obj,
    )

    payload = json.loads(result.output)
    assert result.exit_code == 2
    assert payload["error_type"] == "malformed_plan_file"


def test_reconcile_apply_rejects_schema_mismatch(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    plan = _write_plan_file(tmp_path, slugs=[], schema="reconcile-plan/v0")
    obj = _make_obj(FakeBranchMemoryGateway())

    result = CliRunner().invoke(
        cli_group,
        ["exec", "reconcile-apply", "--plan-file", str(plan), "--format", "json"],
        obj=obj,
    )

    payload = json.loads(result.output)
    assert result.exit_code == 2
    assert payload["error_type"] == "schema_mismatch"
    assert "reconcile-plan/v0" in payload["message"]


def test_reconcile_apply_rejects_plan_without_reconcile_schema(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    plan_path = tmp_path / "bad-shape.json"
    plan_path.write_text(
        json.dumps({"exit_code": 0, "data": {"schema": "other/v1"}}),
        encoding="utf-8",
    )
    obj = _make_obj(FakeBranchMemoryGateway())

    result = CliRunner().invoke(
        cli_group,
        ["exec", "reconcile-apply", "--plan-file", str(plan_path), "--format", "json"],
        obj=obj,
    )

    payload = json.loads(result.output)
    assert result.exit_code == 2
    assert payload["error_type"] == "schema_mismatch"
    assert "data.schema" in payload["message"]


def test_reconcile_apply_rejects_wrong_canonical_branch(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    plan = _write_plan_file(tmp_path, slugs=[], canonical_branch="main")
    obj = _make_obj(FakeBranchMemoryGateway())

    result = CliRunner().invoke(
        cli_group,
        ["exec", "reconcile-apply", "--plan-file", str(plan), "--format", "json"],
        obj=obj,
    )

    payload = json.loads(result.output)
    assert result.exit_code == 2
    assert payload["error_type"] == "schema_mismatch"


def test_reconcile_apply_missing_plan_file_fails(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    obj = _make_obj(FakeBranchMemoryGateway())

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "reconcile-apply",
            "--plan-file",
            str(tmp_path / "does-not-exist.json"),
            "--format",
            "json",
        ],
        obj=obj,
    )

    # click.Path(exists=True) rejects with a usage-style error before we run.
    assert result.exit_code != 0


# ---------------------------------------------------------------------------
# missing proposed file
# ---------------------------------------------------------------------------


def test_reconcile_apply_missing_proposed_file_is_skip(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    gateway = FakeBranchMemoryGateway()
    shas = _seed_canonical(gateway, "widget-rewrite", body="# old\n")
    plan = _write_plan_file(
        tmp_path,
        slugs=[
            {
                "slug": "widget-rewrite",
                "canonical_present": True,
                "canonical_files": [
                    _file_block(
                        file="body.md",
                        key="widget-rewrite/body.md",
                        blob_sha=shas["body.md"]["blob_sha"],
                        head_sha=shas["body.md"]["head_sha"],
                    ),
                ],
                "included_snapshots": [],
                "skipped_snapshots": [],
                "conflicts": [],
                "gaps": [],
                "proposed_writes": [
                    {
                        "file": "body.md",
                        "proposed_path": str(tmp_path / "missing.md"),
                    }
                ],
            }
        ],
    )
    obj = _make_obj(gateway)

    result = CliRunner().invoke(
        cli_group,
        ["exec", "reconcile-apply", "--plan-file", str(plan), "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    slug_result = json.loads(result.output)["data"]["slugs"][0]
    assert slug_result["writes"] == []
    assert len(slug_result["skipped"]) == 1
    assert "not found on disk" in slug_result["skipped"][0]["reason"]


# ---------------------------------------------------------------------------
# proposed-dir staging
# ---------------------------------------------------------------------------


def test_reconcile_apply_proposed_dir_writes_one_file(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    gateway = FakeBranchMemoryGateway()
    shas = _seed_canonical(gateway, "widget-rewrite", body="# old\n")
    proposed_dir = tmp_path / "proposed"
    _write_proposed_dir_file(
        proposed_dir,
        slug="widget-rewrite",
        filename="body.md",
        content="# new\n",
    )
    plan = _write_plan_file(
        tmp_path,
        slugs=[
            {
                "slug": "widget-rewrite",
                "canonical_present": True,
                "canonical_files": [
                    _file_block(
                        file="body.md",
                        key="widget-rewrite/body.md",
                        blob_sha=shas["body.md"]["blob_sha"],
                        head_sha=shas["body.md"]["head_sha"],
                    ),
                ],
                "included_snapshots": [],
                "skipped_snapshots": [],
                "conflicts": [],
                "gaps": [],
            }
        ],
    )
    obj = _make_obj(gateway)

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "reconcile-apply",
            "--plan-file",
            str(plan),
            "--proposed-dir",
            str(proposed_dir),
            "--format",
            "json",
        ],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    slug_result = json.loads(result.output)["data"]["slugs"][0]
    assert [write["file"] for write in slug_result["writes"]] == ["body.md"]
    assert gateway.get("objectives", "widget-rewrite/body.md", "master") == "# new\n"


def test_reconcile_apply_proposed_dir_writes_all_known_files(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    gateway = FakeBranchMemoryGateway()
    shas = _seed_canonical(
        gateway,
        "widget-rewrite",
        body="# old\n",
        roadmap="# old roadmap\n",
        notes="# old notes\n",
    )
    proposed_dir = tmp_path / "proposed"
    _write_proposed_dir_file(
        proposed_dir,
        slug="widget-rewrite",
        filename="body.md",
        content="# new\n",
    )
    _write_proposed_dir_file(
        proposed_dir,
        slug="widget-rewrite",
        filename="roadmap.md",
        content="# new roadmap\n",
    )
    _write_proposed_dir_file(
        proposed_dir,
        slug="widget-rewrite",
        filename="notes.md",
        content="# new notes\n",
    )
    plan = _write_plan_file(
        tmp_path,
        slugs=[
            {
                "slug": "widget-rewrite",
                "canonical_present": True,
                "canonical_files": [
                    _file_block(
                        file="body.md",
                        key="widget-rewrite/body.md",
                        blob_sha=shas["body.md"]["blob_sha"],
                        head_sha=shas["body.md"]["head_sha"],
                    ),
                    _file_block(
                        file="roadmap.md",
                        key="widget-rewrite/roadmap.md",
                        blob_sha=shas["roadmap.md"]["blob_sha"],
                        head_sha=shas["roadmap.md"]["head_sha"],
                    ),
                    _file_block(
                        file="notes.md",
                        key="widget-rewrite/notes.md",
                        blob_sha=shas["notes.md"]["blob_sha"],
                        head_sha=shas["notes.md"]["head_sha"],
                    ),
                ],
                "included_snapshots": [],
                "skipped_snapshots": [],
                "conflicts": [],
                "gaps": [],
            }
        ],
    )
    obj = _make_obj(gateway)

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "reconcile-apply",
            "--plan-file",
            str(plan),
            "--proposed-dir",
            str(proposed_dir),
            "--format",
            "json",
        ],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    slug_result = json.loads(result.output)["data"]["slugs"][0]
    assert [write["file"] for write in slug_result["writes"]] == [
        "body.md",
        "roadmap.md",
        "notes.md",
    ]


def test_reconcile_apply_rejects_missing_proposed_dir(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    plan = _write_plan_file(tmp_path, slugs=[])
    obj = _make_obj(FakeBranchMemoryGateway())

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "reconcile-apply",
            "--plan-file",
            str(plan),
            "--proposed-dir",
            str(tmp_path / "missing"),
            "--format",
            "json",
        ],
        obj=obj,
    )

    payload = json.loads(result.output)
    assert result.exit_code == 2
    assert payload["error_type"] == "proposed_dir_missing"


def test_reconcile_apply_rejects_unknown_proposed_file(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    gateway = FakeBranchMemoryGateway()
    shas = _seed_canonical(gateway, "widget-rewrite", body="# old\n")
    proposed_dir = tmp_path / "proposed"
    _write_proposed_dir_file(
        proposed_dir,
        slug="widget-rewrite",
        filename="extra.md",
        content="# extra\n",
    )
    plan = _write_plan_file(
        tmp_path,
        slugs=[
            {
                "slug": "widget-rewrite",
                "canonical_present": True,
                "canonical_files": [
                    _file_block(
                        file="body.md",
                        key="widget-rewrite/body.md",
                        blob_sha=shas["body.md"]["blob_sha"],
                        head_sha=shas["body.md"]["head_sha"],
                    ),
                ],
                "included_snapshots": [],
                "skipped_snapshots": [],
                "conflicts": [],
                "gaps": [],
            }
        ],
    )
    obj = _make_obj(gateway)

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "reconcile-apply",
            "--plan-file",
            str(plan),
            "--proposed-dir",
            str(proposed_dir),
            "--format",
            "json",
        ],
        obj=obj,
    )

    payload = json.loads(result.output)
    assert result.exit_code == 2
    assert payload["error_type"] == "unknown_proposed_file"
    assert "extra.md" in payload["message"]


def test_reconcile_apply_rejects_proposed_dir_with_explicit_proposed_writes(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    gateway = FakeBranchMemoryGateway()
    shas = _seed_canonical(gateway, "widget-rewrite", body="# old\n")
    proposed_dir = tmp_path / "proposed"
    _write_proposed_dir_file(
        proposed_dir,
        slug="widget-rewrite",
        filename="body.md",
        content="# new\n",
    )
    explicit = _write_proposed(tmp_path, "explicit.md", "# explicit\n")
    plan = _write_plan_file(
        tmp_path,
        slugs=[
            {
                "slug": "widget-rewrite",
                "canonical_present": True,
                "canonical_files": [
                    _file_block(
                        file="body.md",
                        key="widget-rewrite/body.md",
                        blob_sha=shas["body.md"]["blob_sha"],
                        head_sha=shas["body.md"]["head_sha"],
                    ),
                ],
                "included_snapshots": [],
                "skipped_snapshots": [],
                "conflicts": [],
                "gaps": [],
                "proposed_writes": [
                    {"file": "body.md", "proposed_path": str(explicit)},
                ],
            }
        ],
    )
    obj = _make_obj(gateway)

    result = CliRunner().invoke(
        cli_group,
        [
            "exec",
            "reconcile-apply",
            "--plan-file",
            str(plan),
            "--proposed-dir",
            str(proposed_dir),
            "--format",
            "json",
        ],
        obj=obj,
    )

    payload = json.loads(result.output)
    assert result.exit_code == 2
    assert payload["error_type"] == "ambiguous_proposed_writes"


# ---------------------------------------------------------------------------
# serial write order matches plan order
# ---------------------------------------------------------------------------


def test_reconcile_apply_writes_in_plan_order(cli_group: ClinkrGroup, tmp_path: Path) -> None:
    gateway = FakeBranchMemoryGateway()
    shas_alpha = _seed_canonical(
        gateway, "alpha", body="# alpha old\n", roadmap="# alpha roadmap\n"
    )
    shas_beta = _seed_canonical(gateway, "beta", body="# beta old\n")

    body_alpha = _write_proposed(tmp_path, "alpha.body.md", "# alpha new\n")
    roadmap_alpha = _write_proposed(tmp_path, "alpha.roadmap.md", "# alpha roadmap new\n")
    body_beta = _write_proposed(tmp_path, "beta.body.md", "# beta new\n")

    plan = _write_plan_file(
        tmp_path,
        slugs=[
            {
                "slug": "alpha",
                "canonical_present": True,
                "canonical_files": [
                    _file_block(
                        file="body.md",
                        key="alpha/body.md",
                        blob_sha=shas_alpha["body.md"]["blob_sha"],
                        head_sha=shas_alpha["body.md"]["head_sha"],
                    ),
                    _file_block(
                        file="roadmap.md",
                        key="alpha/roadmap.md",
                        blob_sha=shas_alpha["roadmap.md"]["blob_sha"],
                        head_sha=shas_alpha["roadmap.md"]["head_sha"],
                    ),
                ],
                "included_snapshots": [],
                "skipped_snapshots": [],
                "conflicts": [],
                "gaps": [],
                "proposed_writes": [
                    {"file": "body.md", "proposed_path": str(body_alpha)},
                    {"file": "roadmap.md", "proposed_path": str(roadmap_alpha)},
                ],
            },
            {
                "slug": "beta",
                "canonical_present": True,
                "canonical_files": [
                    _file_block(
                        file="body.md",
                        key="beta/body.md",
                        blob_sha=shas_beta["body.md"]["blob_sha"],
                        head_sha=shas_beta["body.md"]["head_sha"],
                    ),
                ],
                "included_snapshots": [],
                "skipped_snapshots": [],
                "conflicts": [],
                "gaps": [],
                "proposed_writes": [
                    {"file": "body.md", "proposed_path": str(body_beta)},
                ],
            },
        ],
    )
    obj = _make_obj(gateway)

    result = CliRunner().invoke(
        cli_group,
        ["exec", "reconcile-apply", "--plan-file", str(plan), "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    assert [s["slug"] for s in data["slugs"]] == ["alpha", "beta"]
    # Within-slug write order matches `proposed_writes` order.
    assert [w["file"] for w in data["slugs"][0]["writes"]] == ["body.md", "roadmap.md"]
    assert [w["file"] for w in data["slugs"][1]["writes"]] == ["body.md"]
    # Verify writes happened in plan order. The gateway records every put;
    # the seed phase uses 3 puts (alpha body, alpha roadmap, beta body), so
    # the apply window starts at index 3.
    write_keys = [(ns, k, b) for ns, k, b, _ in gateway._put_calls]
    apply_window = write_keys[3:]
    assert apply_window == [
        ("objectives", "alpha/body.md", "master"),
        ("objectives", "alpha/roadmap.md", "master"),
        ("objectives", "beta/body.md", "master"),
    ]


# ---------------------------------------------------------------------------
# per-slug isolation
# ---------------------------------------------------------------------------


def test_reconcile_apply_slug_a_failure_does_not_block_slug_b(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    gateway = FakeBranchMemoryGateway()
    _seed_canonical(gateway, "alpha", body="# alpha old\n")
    shas_beta = _seed_canonical(gateway, "beta", body="# beta old\n")

    # Alpha's expected_old_blob_sha is wrong → drift skip. Beta still applies.
    beta_proposed = _write_proposed(tmp_path, "beta.body.md", "# beta new\n")
    alpha_proposed = _write_proposed(tmp_path, "alpha.body.md", "# alpha new\n")

    plan = _write_plan_file(
        tmp_path,
        slugs=[
            {
                "slug": "alpha",
                "canonical_present": True,
                "canonical_files": [
                    _file_block(
                        file="body.md",
                        key="alpha/body.md",
                        blob_sha="stale-blob",
                        head_sha="stale-head",
                    ),
                ],
                "included_snapshots": [],
                "skipped_snapshots": [],
                "conflicts": [],
                "gaps": [],
                "proposed_writes": [
                    {"file": "body.md", "proposed_path": str(alpha_proposed)},
                ],
            },
            {
                "slug": "beta",
                "canonical_present": True,
                "canonical_files": [
                    _file_block(
                        file="body.md",
                        key="beta/body.md",
                        blob_sha=shas_beta["body.md"]["blob_sha"],
                        head_sha=shas_beta["body.md"]["head_sha"],
                    ),
                ],
                "included_snapshots": [],
                "skipped_snapshots": [],
                "conflicts": [],
                "gaps": [],
                "proposed_writes": [
                    {"file": "body.md", "proposed_path": str(beta_proposed)},
                ],
            },
        ],
    )
    obj = _make_obj(gateway)

    result = CliRunner().invoke(
        cli_group,
        ["exec", "reconcile-apply", "--plan-file", str(plan), "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    data = json.loads(result.output)["data"]
    by_slug = {s["slug"]: s for s in data["slugs"]}
    assert by_slug["alpha"]["writes"] == []
    assert len(by_slug["alpha"]["skipped"]) == 1
    assert by_slug["beta"]["writes"][0]["new_head_sha"] != shas_beta["body.md"]["head_sha"]
    assert by_slug["beta"]["skipped"] == []
    # Beta canonical content actually changed; alpha did not.
    assert gateway.get("objectives", "alpha/body.md", "master") == "# alpha old\n"
    assert gateway.get("objectives", "beta/body.md", "master") == "# beta new\n"


# ---------------------------------------------------------------------------
# per-file isolation within a slug
# ---------------------------------------------------------------------------


def test_reconcile_apply_per_file_failure_does_not_block_subsequent_file(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    gateway = FakeBranchMemoryGateway()
    shas = _seed_canonical(gateway, "alpha", body="# old body\n", roadmap="# old roadmap\n")
    body_proposed = _write_proposed(tmp_path, "body.md.proposed", "# new body\n")
    # roadmap proposed file path points at a missing file.
    plan = _write_plan_file(
        tmp_path,
        slugs=[
            {
                "slug": "alpha",
                "canonical_present": True,
                "canonical_files": [
                    _file_block(
                        file="body.md",
                        key="alpha/body.md",
                        blob_sha=shas["body.md"]["blob_sha"],
                        head_sha=shas["body.md"]["head_sha"],
                    ),
                    _file_block(
                        file="roadmap.md",
                        key="alpha/roadmap.md",
                        blob_sha=shas["roadmap.md"]["blob_sha"],
                        head_sha=shas["roadmap.md"]["head_sha"],
                    ),
                ],
                "included_snapshots": [],
                "skipped_snapshots": [],
                "conflicts": [],
                "gaps": [],
                "proposed_writes": [
                    {
                        "file": "roadmap.md",
                        "proposed_path": str(tmp_path / "missing.md"),
                    },
                    {
                        "file": "body.md",
                        "proposed_path": str(body_proposed),
                    },
                ],
            }
        ],
    )
    obj = _make_obj(gateway)

    result = CliRunner().invoke(
        cli_group,
        ["exec", "reconcile-apply", "--plan-file", str(plan), "--format", "json"],
        obj=obj,
    )

    slug_result = json.loads(result.output)["data"]["slugs"][0]
    assert [w["file"] for w in slug_result["writes"]] == ["body.md"]
    assert [k["file"] for k in slug_result["skipped"]] == ["roadmap.md"]
    assert gateway.get("objectives", "alpha/body.md", "master") == "# new body\n"
    # roadmap unchanged.
    assert gateway.get("objectives", "alpha/roadmap.md", "master") == "# old roadmap\n"


# ---------------------------------------------------------------------------
# malformed slug entries / proposed write entries
# ---------------------------------------------------------------------------


def test_reconcile_apply_malformed_slug_entry_becomes_gap(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    plan = _write_plan_file(
        tmp_path,
        slugs=[
            "not-a-dict",  # type: ignore[list-item]
            {
                "slug": "ok",
                "canonical_files": [],
                "proposed_writes": [],
            },
        ],
    )
    obj = _make_obj(FakeBranchMemoryGateway())

    result = CliRunner().invoke(
        cli_group,
        ["exec", "reconcile-apply", "--plan-file", str(plan), "--format", "json"],
        obj=obj,
    )

    assert result.exit_code == 0, result.output
    slugs = json.loads(result.output)["data"]["slugs"]
    assert len(slugs) == 2
    assert slugs[0]["slug"] == "<unknown>"
    assert slugs[0]["gaps"] == ["malformed slug entry: not an object"]
    assert slugs[1]["slug"] == "ok"
    assert slugs[1]["writes"] == []


def test_reconcile_apply_malformed_proposed_entry_becomes_gap(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    gateway = FakeBranchMemoryGateway()
    _seed_canonical(gateway, "alpha", body="# old\n")
    plan = _write_plan_file(
        tmp_path,
        slugs=[
            {
                "slug": "alpha",
                "canonical_files": [],
                "proposed_writes": [
                    {"file": "body.md"},  # missing proposed_path
                    "not-a-dict",
                ],
            }
        ],
    )
    obj = _make_obj(gateway)

    result = CliRunner().invoke(
        cli_group,
        ["exec", "reconcile-apply", "--plan-file", str(plan), "--format", "json"],
        obj=obj,
    )

    slug_result = json.loads(result.output)["data"]["slugs"][0]
    assert slug_result["writes"] == []
    assert slug_result["skipped"] == []
    assert any("missing 'proposed_path'" in g for g in slug_result["gaps"])
    assert any("not an object" in g for g in slug_result["gaps"])


# ---------------------------------------------------------------------------
# absent canonical file -> recovery hint mentions absence
# ---------------------------------------------------------------------------


def test_reconcile_apply_recovery_hint_for_absent_canonical(
    cli_group: ClinkrGroup, tmp_path: Path
) -> None:
    gateway = FakeBranchMemoryGateway()
    # Seed only body.md so we can write a brand-new roadmap.md alongside it.
    _seed_canonical(gateway, "alpha", body="# alpha\n")
    new_roadmap = _write_proposed(tmp_path, "roadmap.md.proposed", "# new roadmap\n")
    plan = _write_plan_file(
        tmp_path,
        slugs=[
            {
                "slug": "alpha",
                "canonical_present": True,
                "canonical_files": [
                    _file_block(
                        file="roadmap.md",
                        key="alpha/roadmap.md",
                        present=False,
                        blob_sha=None,
                        head_sha=None,
                    ),
                ],
                "included_snapshots": [],
                "skipped_snapshots": [],
                "conflicts": [],
                "gaps": [],
                "proposed_writes": [
                    {"file": "roadmap.md", "proposed_path": str(new_roadmap)},
                ],
            }
        ],
    )
    obj = _make_obj(gateway)

    result = CliRunner().invoke(
        cli_group,
        ["exec", "reconcile-apply", "--plan-file", str(plan), "--format", "json"],
        obj=obj,
    )

    write = json.loads(result.output)["data"]["slugs"][0]["writes"][0]
    assert write["old_blob_sha"] is None
    assert write["old_head_sha"] is None
    assert write["recovery_command"].startswith("# nothing to recover")
    assert gateway.get("objectives", "alpha/roadmap.md", "master") == "# new roadmap\n"
