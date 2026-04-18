from __future__ import annotations

import json
from pathlib import Path

from sklish.invocation import (
    _find_project_lock,
    _parse_lock,
    build_command,
    build_update_command,
    render_command,
)


def test_build_command_project_scope() -> None:
    argv = build_command("owner/repo", ("a", "b"), global_install=False)
    assert argv == (
        "npx",
        "skills",
        "add",
        "owner/repo",
        "--skill",
        "a",
        "b",
        "--agent",
        "codex",
        "claude-code",
        "-y",
    )


def test_build_command_user_scope_appends_g() -> None:
    argv = build_command("owner/repo", ("a",), global_install=True)
    assert argv[-1] == "-g"
    assert "-g" not in argv[:-1]


def test_render_command_is_shell_safe() -> None:
    rendered = render_command(("npx", "skills", "add", "o/r", "--skill", "a", "b"))
    assert rendered == "npx skills add o/r --skill a b"


def test_build_command_preserves_skill_order() -> None:
    argv = build_command("o/r", ("z", "a", "m"), global_install=False)
    skill_slice = argv[argv.index("--skill") + 1 : argv.index("--agent")]
    assert skill_slice == ("z", "a", "m")


def test_build_update_command_project_scope() -> None:
    argv = build_update_command(("a", "b"), global_scope=False)
    assert argv == ("npx", "skills", "update", "a", "b", "-p", "-y")


def test_build_update_command_global_scope() -> None:
    argv = build_update_command(("a",), global_scope=True)
    assert argv == ("npx", "skills", "update", "a", "-g", "-y")


def test_build_update_command_preserves_skill_order() -> None:
    argv = build_update_command(("z", "a", "m"), global_scope=False)
    assert argv[3:6] == ("z", "a", "m")


def test_parse_lock_extracts_source_types(tmp_path: Path) -> None:
    lock = tmp_path / "skills-lock.json"
    lock.write_text(
        json.dumps(
            {
                "version": 1,
                "skills": {
                    "objective": {"source": "skills/objective", "sourceType": "local"},
                    "graphite": {
                        "source": "withgraphite/agent-skills",
                        "sourceType": "github",
                    },
                    "missing-source-type": {"source": "x/y"},
                    "bad-entry": "not-a-dict",
                },
            }
        )
    )
    assert _parse_lock(lock) == {
        "objective": "local",
        "graphite": "github",
    }


def test_parse_lock_missing_file_returns_empty(tmp_path: Path) -> None:
    assert _parse_lock(tmp_path / "absent.json") == {}


def test_parse_lock_invalid_json_returns_empty(tmp_path: Path) -> None:
    lock = tmp_path / "bad.json"
    lock.write_text("{not json")
    assert _parse_lock(lock) == {}


def test_parse_lock_unexpected_shape_returns_empty(tmp_path: Path) -> None:
    lock = tmp_path / "weird.json"
    lock.write_text(json.dumps(["list", "instead", "of", "object"]))
    assert _parse_lock(lock) == {}


def test_find_project_lock_walks_up(tmp_path: Path) -> None:
    root = tmp_path / "root"
    nested = root / "a" / "b" / "c"
    nested.mkdir(parents=True)
    lock = root / "skills-lock.json"
    lock.write_text("{}")
    assert _find_project_lock(nested) == lock


def test_find_project_lock_returns_none_when_absent(tmp_path: Path) -> None:
    nested = tmp_path / "no-lock-anywhere" / "deep"
    nested.mkdir(parents=True)
    assert _find_project_lock(nested) is None
