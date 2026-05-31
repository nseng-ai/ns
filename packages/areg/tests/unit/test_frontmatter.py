from __future__ import annotations

from pathlib import Path

import pytest

from areg.check.frontmatter import parse_skill_frontmatter


def test_parses_basic_fields(tmp_path: Path) -> None:
    skill_md = tmp_path / "SKILL.md"
    skill_md.write_text("---\nname: my-skill\ndescription: hello\n---\n\nbody\n")

    fields = parse_skill_frontmatter(skill_md)

    assert fields == {"name": "my-skill", "description": "hello"}


def test_skips_full_line_comments(tmp_path: Path) -> None:
    skill_md = tmp_path / "SKILL.md"
    skill_md.write_text(
        "---\n"
        "name: my-skill\n"
        "# this is a comment explaining the next field\n"
        "# multi-line comments are fine\n"
        'description: "Command: my-skill"\n'
        "---\n"
    )

    fields = parse_skill_frontmatter(skill_md)

    assert fields == {"name": "my-skill", "description": "Command: my-skill"}


def test_skips_indented_comments(tmp_path: Path) -> None:
    skill_md = tmp_path / "SKILL.md"
    skill_md.write_text(
        "---\nname: my-skill\n  # indented comment is also skipped\ndescription: hello\n---\n"
    )

    fields = parse_skill_frontmatter(skill_md)

    assert fields == {"name": "my-skill", "description": "hello"}


def test_missing_closing_delimiter_raises(tmp_path: Path) -> None:
    skill_md = tmp_path / "SKILL.md"
    skill_md.write_text("---\nname: my-skill\n")

    with pytest.raises(ValueError, match="missing closing frontmatter delimiter"):
        parse_skill_frontmatter(skill_md)


def test_invalid_line_raises(tmp_path: Path) -> None:
    skill_md = tmp_path / "SKILL.md"
    skill_md.write_text("---\nnot a key value line\n---\n")

    with pytest.raises(ValueError, match="invalid frontmatter line"):
        parse_skill_frontmatter(skill_md)
