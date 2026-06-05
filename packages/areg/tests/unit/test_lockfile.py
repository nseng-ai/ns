from __future__ import annotations

import json
from pathlib import Path

import click
import pytest

from areg.check.lockfile import parse_lockfile_data, read_lockfile

_VALID_HASH = "a" * 64
_REMOTE_HASH = "b" * 64


def _write_lockfile(project: Path, data: object) -> None:
    project.mkdir(parents=True, exist_ok=True)
    (project / "skills-lock.json").write_text(json.dumps(data), encoding="utf-8")


def _entry(
    *,
    source: object = "skills/example",
    source_type: object = "local",
    computed_hash: object = _VALID_HASH,
    skill_path: object | None = None,
) -> dict[str, object]:
    data = {
        "source": source,
        "sourceType": source_type,
        "computedHash": computed_hash,
    }
    if skill_path is not None:
        data["skillPath"] = skill_path
    return data


def test_read_lockfile_parses_valid_empty_lockfile(tmp_path: Path) -> None:
    _write_lockfile(tmp_path, {"version": 1, "skills": {}})

    lockfile = read_lockfile(tmp_path)

    assert lockfile.version == 1
    assert lockfile.skills == ()
    assert lockfile.names == frozenset()


def test_parse_lockfile_data_parses_typed_entries() -> None:
    lockfile = parse_lockfile_data(
        {
            "version": 1,
            "skills": {
                "local-skill": _entry(source="skills/local-skill"),
                "remote-skill": _entry(
                    source="dagster-io/asdl-tools",
                    source_type="github",
                    computed_hash=_REMOTE_HASH,
                    skill_path="skills/remote-skill",
                ),
            },
        }
    )

    assert [skill.name for skill in lockfile.skills] == ["local-skill", "remote-skill"]
    assert lockfile.skills[0].source == "skills/local-skill"
    assert lockfile.skills[0].source_type == "local"
    assert lockfile.skills[0].computed_hash == _VALID_HASH
    assert lockfile.skills[0].skill_path is None
    assert lockfile.skills[1].source_type == "github"
    assert lockfile.skills[1].skill_path == "skills/remote-skill"


def test_read_lockfile_rejects_invalid_json_syntax(tmp_path: Path) -> None:
    (tmp_path / "skills-lock.json").write_text("not valid json{{{", encoding="utf-8")

    with pytest.raises(click.ClickException, match="Invalid JSON in skills-lock.json"):
        read_lockfile(tmp_path)


@pytest.mark.parametrize(
    ("data", "expected"),
    [
        ([], "root must be an object"),
        ({"skills": {}}, "$.version is required and must be 1"),
        ({"version": 2, "skills": {}}, "$.version must be 1"),
        ({"version": 1}, "$.skills is required and must be an object"),
        ({"version": 1, "skills": []}, "$.skills must be an object"),
        ({"version": 1, "skills": {"pytest": []}}, "$.skills.pytest must be an object"),
        (
            {"version": 1, "skills": {"pytest": {"source": "repo", "computedHash": _VALID_HASH}}},
            "$.skills.pytest.sourceType is required and must be a string",
        ),
        (
            {"version": 1, "skills": {"pytest": _entry(source_type=1)}},
            "$.skills.pytest.sourceType must be a string",
        ),
        (
            {"version": 1, "skills": {"pytest": _entry(source_type="npm")}},
            "$.skills.pytest.sourceType must be one of",
        ),
        (
            {
                "version": 1,
                "skills": {"pytest": {"sourceType": "github", "computedHash": _VALID_HASH}},
            },
            "$.skills.pytest.source is required and must be a string",
        ),
        (
            {"version": 1, "skills": {"pytest": _entry(source=1)}},
            "$.skills.pytest.source must be a string",
        ),
        (
            {"version": 1, "skills": {"pytest": {"source": "repo", "sourceType": "github"}}},
            "$.skills.pytest.computedHash is required and must be a string",
        ),
        (
            {"version": 1, "skills": {"pytest": _entry(computed_hash=1)}},
            "$.skills.pytest.computedHash must be a string",
        ),
        (
            {"version": 1, "skills": {"pytest": _entry(skill_path=1)}},
            "$.skills.pytest.skillPath must be a string",
        ),
    ],
)
def test_parse_lockfile_data_rejects_malformed_shapes(data: object, expected: str) -> None:
    with pytest.raises(click.ClickException) as exc_info:
        parse_lockfile_data(data)

    assert "Invalid skills-lock.json" in exc_info.value.message
    assert expected in exc_info.value.message
