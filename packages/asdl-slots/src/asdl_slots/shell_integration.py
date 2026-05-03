"""Parent-shell integration helpers for slot navigation commands."""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

SLOT_CD_DIRECTIVE_FILE = "SLOT_CD_DIRECTIVE_FILE"
CdDirectiveStatus = Literal["inactive", "written", "failed"]


@dataclass(frozen=True, slots=True)
class CdDirectiveResult:
    status: CdDirectiveStatus
    path: Path | None
    error: str | None = None


def active_cd_directive_path(env: Mapping[str, str] | None = None) -> Path | None:
    environ = os.environ if env is None else env
    raw_path = environ.get(SLOT_CD_DIRECTIVE_FILE)
    if raw_path is None or raw_path == "":
        return None
    return Path(raw_path)


def write_cd_directive_if_active(
    destination: Path | str,
    *,
    enabled: bool = True,
    env: Mapping[str, str] | None = None,
) -> CdDirectiveResult:
    directive_path = active_cd_directive_path(env)
    if not enabled or directive_path is None:
        return CdDirectiveResult(status="inactive", path=directive_path)

    if not directive_path.parent.exists():
        return CdDirectiveResult(
            status="failed",
            path=directive_path,
            error=f"parent directory does not exist: {directive_path.parent}",
        )

    try:
        directive_path.write_text(str(destination), encoding="utf-8")
    except OSError as exc:
        return CdDirectiveResult(status="failed", path=directive_path, error=str(exc))
    return CdDirectiveResult(status="written", path=directive_path)
