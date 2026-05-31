from __future__ import annotations

import tempfile
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


# ---------------------------------------------------------------------------
# parse_skill_input
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "raw, expected_repo, expected_skill, expected_format",
    [
        (
            "https://github.com/dagster-io/asdl-tools/blob/master/skills/ns-setup-dprint",
            "dagster-io/asdl-tools",
            "ns-setup-dprint",
            "url",
        ),
        (
            "https://github.com/dagster-io/asdl-tools/tree/main/skills/ns-pytest",
            "dagster-io/asdl-tools",
            "ns-pytest",
            "url",
        ),
        (
            "https://github.com/owner/repo",
            "owner/repo",
            None,
            "url",
        ),
        (
            "dagster-io/asdl-tools --skill ns-setup-dprint",
            "dagster-io/asdl-tools",
            "ns-setup-dprint",
            "skill_flag",
        ),
        (
            "dagster-io/asdl-tools -s ns-setup-dprint",
            "dagster-io/asdl-tools",
            "ns-setup-dprint",
            "skill_flag",
        ),
        (
            "dagster-io/asdl-tools ns-setup-dprint",
            "dagster-io/asdl-tools",
            "ns-setup-dprint",
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
    result = parse_skill_input("dagster-io/asdl-tools@ns-setup-dprint")
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
    result = parse_skill_input("dagster-io/asdl-tools --skill ns-setup-dprint")
    d = result.to_dict()
    assert d == {
        "success": True,
        "repo": "dagster-io/asdl-tools",
        "skill": "ns-setup-dprint",
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
    npx = FakeNpxSkills(catalog={"dagster-io/asdl-tools": _two_skill_files("ns-setup-dprint")})
    result = fetch_skill("dagster-io/asdl-tools", "ns-setup-dprint", npx_skills=npx)

    assert result.success is True
    assert result.skill == "ns-setup-dprint"
    assert result.tmp_dir is not None
    assert result.skill_md.endswith("SKILL.md")
    assert "SKILL.md" in result.files
    assert result.needs_selection is False

    # Clean up
    Path(result.tmp_dir).exists() and __import__("shutil").rmtree(result.tmp_dir)


def test_fetch_skill_all_single_result() -> None:
    npx = FakeNpxSkills(catalog={"dagster-io/asdl-tools": _two_skill_files("ns-setup-dprint")})
    result = fetch_skill("dagster-io/asdl-tools", None, npx_skills=npx)

    assert result.success is True
    assert result.skill == "ns-setup-dprint"
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


def test_cleanup_skill_dir_removes_valid() -> None:
    tmp_dir = tempfile.mkdtemp(prefix="skillx.")
    (Path(tmp_dir) / "test.txt").write_text("hello")

    result = cleanup_skill_dir(tmp_dir)

    assert result.success is True
    assert result.removed == tmp_dir
    assert not Path(tmp_dir).exists()


def test_cleanup_skill_dir_refuses_non_tmp_path() -> None:
    result = cleanup_skill_dir("/usr/local/bin")
    assert result.success is False
    assert "Refusing to remove" in result.error


def test_cleanup_skill_dir_refuses_wrong_prefix() -> None:
    tmp_dir = tempfile.mkdtemp(prefix="notskillx.")
    try:
        result = cleanup_skill_dir(tmp_dir)
        assert result.success is False
        assert "skillx." in result.error
    finally:
        Path(tmp_dir).exists() and __import__("shutil").rmtree(tmp_dir)


def test_cleanup_skill_dir_handles_nonexistent() -> None:
    tmp_root = tempfile.gettempdir()
    result = cleanup_skill_dir(f"{tmp_root}/skillx.nonexistent")
    assert result.success is False
    assert "does not exist" in result.error
