"""Embedded prompt fallback loading."""

from __future__ import annotations

from importlib.resources import files

_DEFAULT_FILENAMES = {
    "subagent-launch": "subagent-launch.md",
    "plans-write": "plans-write.md",
}


def load_embedded_default_prompt(name: str) -> str | None:
    """Return packaged fallback prompt text for ``name`` when one exists."""

    if name not in _DEFAULT_FILENAMES:
        return None

    filename = _DEFAULT_FILENAMES[name]
    return files("asdl_core.prompts.defaults").joinpath(filename).read_text(encoding="utf-8")
