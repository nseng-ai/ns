"""Parsing helpers for markdown-defined reviewers."""

from __future__ import annotations

from twerk_reviewer.models import ReviewDefinition


def parse_review_definition(source: str) -> ReviewDefinition:
    """Parse a markdown reviewer definition into a structured model."""
    lines = source.splitlines()
    first_content_index = next((index for index, line in enumerate(lines) if line.strip()), None)
    if first_content_index is None:
        raise ValueError("Review definition is empty.")

    title_line = lines[first_content_index].strip()
    if not title_line.startswith("# "):
        raise ValueError("Review definition must start with a level-1 heading.")

    review_name = title_line[2:].strip()
    if not review_name:
        raise ValueError("Review definition heading must include a reviewer name.")

    sections = _parse_sections(lines[first_content_index + 1 :])
    description = sections.get("Description", "")
    instructions = sections.get("Instructions", "")
    default_model = sections.get("Default Model", "")

    missing_sections: list[str] = []
    if not description:
        missing_sections.append("Description")
    if not instructions:
        missing_sections.append("Instructions")
    if missing_sections:
        section_list = ", ".join(missing_sections)
        raise ValueError(f"Review definition is missing required sections: {section_list}")

    return ReviewDefinition(
        name=review_name,
        description=description,
        instructions=instructions,
        default_model=default_model or None,
    )


def _parse_sections(lines: list[str]) -> dict[str, str]:
    sections: dict[str, str] = {}
    current_section: str | None = None
    current_lines: list[str] = []

    for raw_line in lines:
        stripped = raw_line.strip()
        if stripped.startswith("# "):
            raise ValueError("Review definition may only contain one level-1 heading.")
        if stripped.startswith("## "):
            if current_section is not None:
                sections[current_section] = _normalize_section_body(current_lines)
            current_section = stripped[3:].strip()
            current_lines = []
            continue

        if current_section is None:
            if stripped:
                raise ValueError(
                    "Content before the first level-2 heading is not supported. "
                    "Add sections like `## Description` and `## Instructions`."
                )
            continue

        current_lines.append(raw_line)

    if current_section is not None:
        sections[current_section] = _normalize_section_body(current_lines)

    return sections


def _normalize_section_body(lines: list[str]) -> str:
    return "\n".join(lines).strip()
