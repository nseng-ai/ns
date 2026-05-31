from __future__ import annotations

from areg.check.checks import pairing


def test_templates_dir_resolves_to_real_bundled_dir() -> None:
    result = pairing._templates_dir()
    assert result is not None
    assert result.is_dir()
    assert result.name == "_templates"
    assert (result / "CLAUDE.md").is_file()
    assert (result / "AGENTS.md").is_file()
