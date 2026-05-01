from __future__ import annotations

from pathlib import Path

from twerk_slots.shell_integration import (
    SLOT_CD_DIRECTIVE_FILE,
    active_cd_directive_path,
    write_cd_directive_if_active,
)


def test_active_cd_directive_path_inactive_when_unset() -> None:
    assert active_cd_directive_path({}) is None


def test_active_cd_directive_path_inactive_when_empty() -> None:
    assert active_cd_directive_path({SLOT_CD_DIRECTIVE_FILE: ""}) is None


def test_active_cd_directive_path_returns_env_path() -> None:
    env = {SLOT_CD_DIRECTIVE_FILE: "/tmp/slot directive"}

    assert active_cd_directive_path(env) == Path("/tmp/slot directive")


def test_write_cd_directive_if_active_inactive_when_disabled(tmp_path: Path) -> None:
    directive_path = tmp_path / "directive"

    result = write_cd_directive_if_active(
        "/tmp/worktree",
        enabled=False,
        env={SLOT_CD_DIRECTIVE_FILE: str(directive_path)},
    )

    assert result.status == "inactive"
    assert result.path == directive_path
    assert not directive_path.exists()


def test_write_cd_directive_if_active_writes_raw_path(tmp_path: Path) -> None:
    directive_path = tmp_path / "directive"
    destination = tmp_path / "work tree; $(echo nope)"

    result = write_cd_directive_if_active(
        destination,
        env={SLOT_CD_DIRECTIVE_FILE: str(directive_path)},
    )

    assert result.status == "written"
    assert result.path == directive_path
    assert directive_path.read_text(encoding="utf-8") == str(destination)


def test_write_cd_directive_if_active_does_not_create_parent_dirs(tmp_path: Path) -> None:
    directive_path = tmp_path / "missing" / "directive"

    result = write_cd_directive_if_active(
        "/tmp/worktree",
        env={SLOT_CD_DIRECTIVE_FILE: str(directive_path)},
    )

    assert result.status == "failed"
    assert result.path == directive_path
    assert result.error is not None
    assert not directive_path.parent.exists()
