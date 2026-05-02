from __future__ import annotations

import os
from collections.abc import Mapping
from pathlib import Path

SUPPORTED_SHELLS = ("zsh", "bash")


def detect_shell(env: Mapping[str, str] | None = None) -> str:
    environ = os.environ if env is None else env
    raw = environ.get("SHELL", "")
    name = Path(raw).name if raw else ""
    if name in SUPPORTED_SHELLS:
        return name
    return "zsh"


def rc_path_for_shell(shell: str) -> Path:
    if shell == "zsh":
        return Path.home() / ".zshrc"
    return Path.home() / ".bashrc"


def unsupported_shell_message(shell: str) -> str:
    return f"Shell '{shell}' is not supported. Supported shells: {', '.join(SUPPORTED_SHELLS)}."


def append_marker_block(
    *,
    rc_path: Path,
    marker_begin: str,
    marker_end: str,
    body: str,
) -> bool:
    existing = rc_path.read_text(encoding="utf-8") if rc_path.exists() else ""
    if marker_begin in existing:
        return True

    block = f"\n{marker_begin}\n{body}\n{marker_end}\n"
    if existing and not existing.endswith("\n"):
        block = "\n" + block

    rc_path.parent.mkdir(parents=True, exist_ok=True)
    with rc_path.open("a", encoding="utf-8") as fh:
        fh.write(block)
    return False
