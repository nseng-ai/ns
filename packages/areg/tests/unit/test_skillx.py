from __future__ import annotations

import tempfile
from pathlib import Path

import pytest

from areg.gateways.gh.fake import FakeGhCli
from areg.gateways.gh.gateway import GhAuthError, GhError
from areg.gateways.npx_skills.gateway import SkillFiles
from areg.gateways.skillx_workspace.fake import FakeSkillxWorkspaceInstaller
from areg.gateways.skillx_workspace.gateway import (
    SkillxInstalledSkill,
    SkillxWorkspace,
    SkillxWorkspaceError,
    SkillxWorkspaceInstaller,
)
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


class _DifferentSkillWorkspaceInstaller(SkillxWorkspaceInstaller):
    def install(self, repo: str, *, skill: str | None) -> SkillxWorkspace:
        return SkillxWorkspace(
            tmp_dir=Path("/tmp/skillx.fake-mismatch"),
            skills=(
                SkillxInstalledSkill(
                    name="different-skill",
                    skill_dir=Path("/tmp/skillx.fake-mismatch/.agents/skills/different-skill"),
                    skill_md=Path(
                        "/tmp/skillx.fake-mismatch/.agents/skills/different-skill/SKILL.md"
                    ),
                    files=("SKILL.md",),
                ),
            ),
        )


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
    installer = FakeSkillxWorkspaceInstaller(
        catalog={"dagster-io/asdl-tools": _two_skill_files("setup-dprint")}
    )
    result = fetch_skill(
        "dagster-io/asdl-tools",
        "setup-dprint",
        workspace_installer=installer,
    )

    assert result.success is True
    assert result.skill == "setup-dprint"
    assert result.tmp_dir == "/tmp/skillx.fake-1"
    assert result.skill_md == "/tmp/skillx.fake-1/.agents/skills/setup-dprint/SKILL.md"
    assert "SKILL.md" in result.files
    assert result.needs_selection is False
    assert installer.invocations[0].repo == "dagster-io/asdl-tools"
    assert installer.invocations[0].skill == "setup-dprint"


def test_fetch_skill_all_single_result() -> None:
    installer = FakeSkillxWorkspaceInstaller(
        catalog={"dagster-io/asdl-tools": _two_skill_files("setup-dprint")}
    )
    result = fetch_skill("dagster-io/asdl-tools", None, workspace_installer=installer)

    assert result.success is True
    assert result.skill == "setup-dprint"
    assert result.needs_selection is False


def test_fetch_skill_all_multiple_results() -> None:
    installer = FakeSkillxWorkspaceInstaller(
        catalog={"dagster-io/asdl-tools": _two_skill_files("skill-a", "skill-b")}
    )
    result = fetch_skill("dagster-io/asdl-tools", None, workspace_installer=installer)

    assert result.success is True
    assert result.needs_selection is True
    assert result.available_skills == ["skill-a", "skill-b"]


def test_fetch_skill_handles_npx_failure() -> None:
    installer = FakeSkillxWorkspaceInstaller(
        raise_on_install=SkillxWorkspaceError("npx skills add failed: install failed")
    )
    result = fetch_skill(
        "dagster-io/asdl-tools",
        "bad-skill",
        workspace_installer=installer,
    )

    assert result.success is False
    assert "npx skills add failed" in result.error
    assert result.to_dict()["tmp_dir"] is None


def test_fetch_skill_handles_no_skills_installed() -> None:
    installer = FakeSkillxWorkspaceInstaller(catalog={"dagster-io/asdl-tools": {}})
    result = fetch_skill("dagster-io/asdl-tools", None, workspace_installer=installer)

    assert result.success is False
    assert "No skills were installed" in result.error


def test_fetch_skill_skill_not_in_installed() -> None:
    result = fetch_skill(
        "dagster-io/asdl-tools",
        "wanted-skill",
        workspace_installer=_DifferentSkillWorkspaceInstaller(),
    )

    assert result.success is False
    assert "Skill 'wanted-skill' was not found in installed skills" in result.error


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


def test_cleanup_skill_dir_refuses_canonical_tmp_escape(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    temp_root = tmp_path / "tmp"
    child = temp_root / "child"
    child.mkdir(parents=True)
    outside = tmp_path / "skillx.outside"
    outside.mkdir()
    sentinel = outside / "sentinel.txt"
    sentinel.write_text("keep\n", encoding="utf-8")
    monkeypatch.setattr("areg.skillx.tempfile.gettempdir", lambda: str(temp_root))

    result = cleanup_skill_dir(str(child / ".." / ".." / outside.name))

    assert result.success is False
    assert result.error is not None
    assert "Refusing to remove" in result.error
    assert sentinel.read_text(encoding="utf-8") == "keep\n"


def test_cleanup_skill_dir_refuses_symlink(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    temp_root = tmp_path / "tmp"
    temp_root.mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    sentinel = outside / "sentinel.txt"
    sentinel.write_text("keep\n", encoding="utf-8")
    link = temp_root / "skillx.link"
    link.symlink_to(outside, target_is_directory=True)
    monkeypatch.setattr("areg.skillx.tempfile.gettempdir", lambda: str(temp_root))

    result = cleanup_skill_dir(str(link))

    assert result.success is False
    assert result.error is not None
    assert "symlink" in result.error
    assert sentinel.read_text(encoding="utf-8") == "keep\n"


def test_cleanup_skill_dir_refuses_non_directory(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    temp_root = tmp_path / "tmp"
    temp_root.mkdir()
    target = temp_root / "skillx.file"
    target.write_text("keep\n", encoding="utf-8")
    monkeypatch.setattr("areg.skillx.tempfile.gettempdir", lambda: str(temp_root))

    result = cleanup_skill_dir(str(target))

    assert result.success is False
    assert result.error is not None
    assert "not a directory" in result.error
    assert target.read_text(encoding="utf-8") == "keep\n"


def test_cleanup_skill_dir_reports_rmtree_failure(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    temp_root = tmp_path / "tmp"
    target = temp_root / "skillx.fail"
    target.mkdir(parents=True)
    monkeypatch.setattr("areg.skillx.tempfile.gettempdir", lambda: str(temp_root))

    def _raise_rmtree(_path: Path) -> None:
        raise OSError("boom")

    monkeypatch.setattr("areg.skillx.shutil.rmtree", _raise_rmtree)

    result = cleanup_skill_dir(str(target))

    assert result.success is False
    assert result.error is not None
    assert "Failed to remove" in result.error
    assert "boom" in result.error
    assert target.exists()
