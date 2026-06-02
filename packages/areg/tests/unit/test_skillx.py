from __future__ import annotations

from pathlib import Path

import pytest

from areg.gateways.gh.fake import FakeGhCli
from areg.gateways.gh.gateway import GhAuthError, GhError
from areg.gateways.npx_skills.fake import FakeNpxSkills
from areg.gateways.npx_skills.gateway import NpxSkillsError, SkillFiles
from areg.skillx import (
    cleanup_skill_dir,
    fetch_skill,
    list_skills,
    parse_skill_input,
)


def _two_skill_files(*names: str) -> dict[str, SkillFiles]:
    return {
        name: SkillFiles(
            files={
                "SKILL.md": f"---\nname: {name}\n---\n",
                "references/patterns.md": "# Patterns\n",
            }
        )
        for name in names
    }


def _use_temp_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    tmp_root = tmp_path / "tmp-root"
    tmp_root.mkdir()
    monkeypatch.setattr("areg.skillx.tempfile.gettempdir", lambda: str(tmp_root))
    return tmp_root


# ---------------------------------------------------------------------------
# parse_skill_input
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "raw, expected_repo, expected_skill, expected_format",
    [
        (
            "https://github.com/dagster-io/asdl-tools/blob/master/skills/setup-dprint",
            "dagster-io/asdl-tools",
            "setup-dprint",
            "url",
        ),
        (
            "https://github.com/dagster-io/asdl-tools/tree/main/skills/pytest",
            "dagster-io/asdl-tools",
            "pytest",
            "url",
        ),
        (
            "https://github.com/owner/repo",
            "owner/repo",
            None,
            "url",
        ),
        (
            "dagster-io/asdl-tools --skill setup-dprint",
            "dagster-io/asdl-tools",
            "setup-dprint",
            "skill_flag",
        ),
        (
            "dagster-io/asdl-tools -s setup-dprint",
            "dagster-io/asdl-tools",
            "setup-dprint",
            "skill_flag",
        ),
        (
            "dagster-io/asdl-tools setup-dprint",
            "dagster-io/asdl-tools",
            "setup-dprint",
            "plain",
        ),
        (
            "dagster-io/asdl-tools",
            "dagster-io/asdl-tools",
            None,
            "repo_only",
        ),
    ],
)
def test_parse_skill_input_parses_format(
    raw: str,
    expected_repo: str,
    expected_skill: str | None,
    expected_format: str,
) -> None:
    result = parse_skill_input(raw)
    assert result.success is True
    assert result.repo == expected_repo
    assert result.skill == expected_skill
    assert result.format == expected_format


def test_parse_skill_input_rejects_empty_input() -> None:
    result = parse_skill_input("")
    assert result.success is False
    assert result.error == "Empty input"


def test_parse_skill_input_rejects_invalid_input() -> None:
    result = parse_skill_input("just some random text without a repo")
    assert result.success is False
    assert "Could not extract" in result.error


def test_parse_skill_input_rejects_legacy_at_syntax() -> None:
    result = parse_skill_input("dagster-io/asdl-tools@setup-dprint")
    assert result.success is False


def test_parse_skill_input_repo_with_dots_and_hyphens() -> None:
    result = parse_skill_input("my-org.io/my-repo.v2 --skill my-skill")
    assert result.success is True
    assert result.repo == "my-org.io/my-repo.v2"
    assert result.skill == "my-skill"


def test_parse_skill_input_url_with_nested_skills_path() -> None:
    result = parse_skill_input(
        "https://github.com/owner/repo/blob/main/skills/my-skill/references/foo.md"
    )
    assert result.success is True
    assert result.repo == "owner/repo"
    assert result.skill == "my-skill"


def test_parse_skill_input_to_dict_success() -> None:
    result = parse_skill_input("dagster-io/asdl-tools --skill setup-dprint")
    d = result.to_dict()
    assert d == {
        "success": True,
        "repo": "dagster-io/asdl-tools",
        "skill": "setup-dprint",
        "format": "skill_flag",
    }


def test_parse_skill_input_to_dict_failure() -> None:
    result = parse_skill_input("garbage")
    d = result.to_dict()
    assert d["success"] is False
    assert "error" in d


# ---------------------------------------------------------------------------
# list_skills
# ---------------------------------------------------------------------------


def test_list_skills_returns_sorted() -> None:
    gh = FakeGhCli(catalog={"dagster-io/asdl-tools": {"skills": ["skill-c", "skill-a", "skill-b"]}})
    result = list_skills("dagster-io/asdl-tools", gh=gh)

    assert result.success is True
    assert result.repo == "dagster-io/asdl-tools"
    assert result.skills == ["skill-a", "skill-b", "skill-c"]  # sorted


def test_list_skills_handles_404() -> None:
    # FakeGhCli raises GhNotFound when the repo isn't in its catalog.
    gh = FakeGhCli()
    result = list_skills("nseng-ai/nonexistent", gh=gh)

    assert result.success is False
    assert "No skills directory" in result.error


def test_list_skills_handles_auth_error() -> None:
    gh = FakeGhCli(
        raise_for={("private/repo", "skills"): GhAuthError("forbidden")},
    )
    result = list_skills("private/repo", gh=gh)

    assert result.success is False
    assert "Authentication" in result.error
    assert result.hint is not None


def test_list_skills_handles_generic_error() -> None:
    gh = FakeGhCli(
        raise_for={("dagster-io/asdl-tools", "skills"): GhError("some other error")},
    )
    result = list_skills("dagster-io/asdl-tools", gh=gh)

    assert result.success is False
    assert "some other error" in result.error


def test_list_skills_to_dict_with_hint() -> None:
    gh = FakeGhCli(
        raise_for={("private/repo", "skills"): GhAuthError("forbidden")},
    )
    result = list_skills("private/repo", gh=gh)

    d = result.to_dict()
    assert d["success"] is False
    assert "hint" in d


# ---------------------------------------------------------------------------
# fetch_skill
# ---------------------------------------------------------------------------


def test_fetch_skill_single() -> None:
    npx = FakeNpxSkills(catalog={"dagster-io/asdl-tools": _two_skill_files("setup-dprint")})
    result = fetch_skill("dagster-io/asdl-tools", "setup-dprint", npx_skills=npx)

    assert result.success is True
    assert result.skill == "setup-dprint"
    assert result.tmp_dir is not None
    assert result.skill_md.endswith("SKILL.md")
    assert "SKILL.md" in result.files
    assert result.needs_selection is False

    # Clean up
    Path(result.tmp_dir).exists() and __import__("shutil").rmtree(result.tmp_dir)


def test_fetch_skill_all_single_result() -> None:
    npx = FakeNpxSkills(catalog={"dagster-io/asdl-tools": _two_skill_files("setup-dprint")})
    result = fetch_skill("dagster-io/asdl-tools", None, npx_skills=npx)

    assert result.success is True
    assert result.skill == "setup-dprint"
    assert result.needs_selection is False

    Path(result.tmp_dir).exists() and __import__("shutil").rmtree(result.tmp_dir)


def test_fetch_skill_all_multiple_results() -> None:
    npx = FakeNpxSkills(catalog={"dagster-io/asdl-tools": _two_skill_files("skill-a", "skill-b")})
    result = fetch_skill("dagster-io/asdl-tools", None, npx_skills=npx)

    assert result.success is True
    assert result.needs_selection is True
    assert result.available_skills == ["skill-a", "skill-b"]

    Path(result.tmp_dir).exists() and __import__("shutil").rmtree(result.tmp_dir)


def test_fetch_skill_handles_npx_failure() -> None:
    npx = FakeNpxSkills(raise_on_add=NpxSkillsError("install failed"))
    result = fetch_skill("dagster-io/asdl-tools", "bad-skill", npx_skills=npx)

    assert result.success is False
    assert "npx skills add failed" in result.error
    # Temp dir should have been cleaned up
    assert result.to_dict()["tmp_dir"] is None


def test_fetch_skill_handles_no_skills_installed() -> None:
    # Catalog has the repo but with no skills, so the .agents/skills dir
    # never gets created — fetch_skill should report "No skills were installed".
    npx = FakeNpxSkills(catalog={"dagster-io/asdl-tools": {}}, write_lock=False)
    result = fetch_skill("dagster-io/asdl-tools", None, npx_skills=npx)

    assert result.success is False
    assert "No skills were installed" in result.error


def test_fetch_skill_skill_not_in_installed() -> None:
    """Skill was specified but the catalog only has a different one."""
    npx = FakeNpxSkills(catalog={"dagster-io/asdl-tools": _two_skill_files("different-skill")})
    result = fetch_skill("dagster-io/asdl-tools", "wanted-skill", npx_skills=npx)

    # FakeNpxSkills raises NpxSkillsError("unknown skill"), which the caller
    # surfaces through the same "npx skills add failed" path the real CLI uses.
    assert result.success is False
    assert "npx skills add failed" in result.error


# ---------------------------------------------------------------------------
# cleanup_skill_dir
# ---------------------------------------------------------------------------


def test_cleanup_skill_dir_removes_valid(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    tmp_dir = _use_temp_root(tmp_path, monkeypatch) / "skillx.valid"
    tmp_dir.mkdir()
    (tmp_dir / "test.txt").write_text("hello", encoding="utf-8")

    result = cleanup_skill_dir(str(tmp_dir))

    assert result.success is True
    assert result.removed == str(tmp_dir)
    assert not tmp_dir.exists()


def test_cleanup_skill_dir_refuses_non_tmp_path(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    tmp_root = _use_temp_root(tmp_path, monkeypatch)
    outside = tmp_path / "skillx.outside"
    outside.mkdir()

    result = cleanup_skill_dir(str(outside))

    assert result.success is False
    assert "outside" in result.error
    assert outside.exists()
    assert tmp_root.exists()


def test_cleanup_skill_dir_refuses_traversal_escape(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    tmp_root = _use_temp_root(tmp_path, monkeypatch)
    outside = tmp_path / "skillx.traversal"
    outside.mkdir()
    traversal_path = tmp_root / ".." / outside.name

    result = cleanup_skill_dir(str(traversal_path))

    assert result.success is False
    assert "outside" in result.error
    assert outside.exists()


def test_cleanup_skill_dir_refuses_wrong_prefix(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    tmp_dir = _use_temp_root(tmp_path, monkeypatch) / "notskillx.valid"
    tmp_dir.mkdir()

    result = cleanup_skill_dir(str(tmp_dir))

    assert result.success is False
    assert "skillx." in result.error
    assert tmp_dir.exists()


def test_cleanup_skill_dir_handles_nonexistent(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    tmp_root = _use_temp_root(tmp_path, monkeypatch)

    result = cleanup_skill_dir(str(tmp_root / "skillx.nonexistent"))

    assert result.success is False
    assert "does not exist" in result.error


def test_cleanup_skill_dir_refuses_non_directory(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    path = _use_temp_root(tmp_path, monkeypatch) / "skillx.file"
    path.write_text("not a directory\n", encoding="utf-8")

    result = cleanup_skill_dir(str(path))

    assert result.success is False
    assert "not a directory" in result.error
    assert path.is_file()


def test_cleanup_skill_dir_refuses_symlink_target(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    tmp_root = _use_temp_root(tmp_path, monkeypatch)
    outside = tmp_path / "outside"
    outside.mkdir()
    link = tmp_root / "skillx.link"
    link.symlink_to(outside, target_is_directory=True)

    result = cleanup_skill_dir(str(link))

    assert result.success is False
    assert "symlink" in result.error
    assert link.is_symlink()
    assert outside.exists()


def test_cleanup_skill_dir_refuses_parent_symlink_escape(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    tmp_root = _use_temp_root(tmp_path, monkeypatch)
    outside = tmp_path / "outside"
    outside.mkdir()
    target = outside / "skillx.escape"
    target.mkdir()
    link = tmp_root / "link-out"
    link.symlink_to(outside, target_is_directory=True)

    result = cleanup_skill_dir(str(link / "skillx.escape"))

    assert result.success is False
    assert "outside" in result.error
    assert target.exists()


def test_cleanup_skill_dir_refuses_broken_symlink(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    tmp_root = _use_temp_root(tmp_path, monkeypatch)
    link = tmp_root / "skillx.broken"
    link.symlink_to(tmp_path / "missing-target", target_is_directory=True)

    result = cleanup_skill_dir(str(link))

    assert result.success is False
    assert "symlink" in result.error
    assert link.is_symlink()
