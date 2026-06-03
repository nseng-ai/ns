from __future__ import annotations

from pathlib import Path

import pytest

from asdl_core.project_config import (
    AsdlProjectConfigError,
    load_asdl_project_config,
    parse_asdl_project_config,
)


def test_missing_config_returns_default_empty_config(tmp_path: Path) -> None:
    config = load_asdl_project_config(tmp_path)

    assert config.path is None
    assert config.areg.agents == ()
    assert config.roaster.diff.exclude == ()


def test_empty_toml_returns_default_empty_config() -> None:
    config = parse_asdl_project_config("")

    assert config.path is None
    assert config.areg.agents == ()
    assert config.roaster.diff.exclude == ()


def test_parses_areg_agents() -> None:
    config = parse_asdl_project_config('[areg]\nagents = ["codex", "claude-code"]\n')

    assert config.areg.agents == ("codex", "claude-code")
    assert config.roaster.diff.exclude == ()


def test_parses_roaster_diff_excludes() -> None:
    config = parse_asdl_project_config(
        '[roaster.diff]\nexclude = [".agents/skills/**/*.py", ".claude/skills/**/*.py"]\n'
    )

    assert config.areg.agents == ()
    assert config.roaster.diff.exclude == (
        ".agents/skills/**/*.py",
        ".claude/skills/**/*.py",
    )


def test_parses_both_known_sections() -> None:
    config = parse_asdl_project_config(
        "[areg]\n"
        'agents = ["codex", "claude-code"]\n'
        "\n"
        "[roaster.diff]\n"
        'exclude = [".agents/skills/**/*.py"]\n'
    )

    assert config.areg.agents == ("codex", "claude-code")
    assert config.roaster.diff.exclude == (".agents/skills/**/*.py",)


def test_load_config_sets_path_when_file_exists(tmp_path: Path) -> None:
    path = tmp_path / "asdl.toml"
    path.write_text('[areg]\nagents = ["codex"]\n', encoding="utf-8")

    config = load_asdl_project_config(tmp_path)

    assert config.path == path
    assert config.areg.agents == ("codex",)


def test_rejects_invalid_toml_with_path(tmp_path: Path) -> None:
    path = tmp_path / "asdl.toml"
    path.write_text("[areg\n", encoding="utf-8")

    with pytest.raises(AsdlProjectConfigError, match=r"asdl\.toml: Invalid TOML"):
        load_asdl_project_config(tmp_path)


@pytest.mark.parametrize(
    "source, expected",
    [
        ('[areg]\nagents = "codex"\n', "array"),
        ("[areg]\nagents = []\n", "at least one"),
        ('[areg]\nagents = ["codex", 1]\n', "non-empty strings"),
        ('[areg]\nagents = ["codex", ""]\n', "non-empty strings"),
        ('[areg]\nagents = ["codex", "   "]\n', "non-empty strings"),
    ],
)
def test_rejects_invalid_areg_agents(source: str, expected: str) -> None:
    with pytest.raises(AsdlProjectConfigError, match=expected):
        parse_asdl_project_config(source)


@pytest.mark.parametrize(
    "source, expected",
    [
        ('[roaster.diff]\nexclude = "*.py"\n', "array"),
        ('[roaster.diff]\nexclude = ["*.py", 1]\n', "non-empty strings"),
        ('[roaster.diff]\nexclude = [""]\n', "non-empty strings"),
        ('[roaster.diff]\nexclude = ["/tmp/*.py"]\n', "repo-relative"),
        ('[roaster.diff]\nexclude = ["skills/../*.py"]\n', "path segments"),
        ('[roaster.diff]\nexclude = [":(exclude,glob)vendor/**/*.py"]\n', "pathspecs"),
    ],
)
def test_rejects_invalid_roaster_diff_excludes(source: str, expected: str) -> None:
    with pytest.raises(AsdlProjectConfigError, match=expected):
        parse_asdl_project_config(source)


def test_ignores_unrelated_sections_and_fields() -> None:
    config = parse_asdl_project_config(
        "[some_future_tool]\n"
        'enabled = "maybe"\n'
        "\n"
        "[areg]\n"
        'agents = ["codex"]\n'
        'unknown = "ignored"\n'
        "\n"
        "[roaster.diff]\n"
        "unknown = true\n"
    )

    assert config.areg.agents == ("codex",)
    assert config.roaster.diff.exclude == ()


def test_rejects_known_sections_when_not_tables() -> None:
    with pytest.raises(AsdlProjectConfigError, match=r"\[areg\] must be a TOML table"):
        parse_asdl_project_config('areg = "not a table"\n')


def test_rejects_config_path_when_not_a_file(tmp_path: Path) -> None:
    (tmp_path / "asdl.toml").mkdir()

    with pytest.raises(AsdlProjectConfigError, match="exists but is not a file"):
        load_asdl_project_config(tmp_path)
