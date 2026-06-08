"""Parsing helpers for markdown-defined reviewers."""

from __future__ import annotations

from typing import Any

import yaml

from roaster.models import ReviewDefinition

_FRONTMATTER_FENCE = "---"

_ALLOWED_FRONTMATTER_KEYS: frozenset[str] = frozenset(
    {"ci", "description", "default_model", "when_changed"}
)


def parse_review_definition(source: str, *, name: str) -> ReviewDefinition:
    """Parse a review definition written as YAML frontmatter + markdown body.

    The reviewer `name` is supplied by the caller (typically the filename
    without its extension) rather than declared in the frontmatter.
    """
    if not name.strip():
        raise ValueError("Review definition `name` must be a non-empty string.")

    frontmatter_text, body = _split_frontmatter(source)

    try:
        parsed_frontmatter = yaml.safe_load(frontmatter_text)
    except yaml.YAMLError as exc:
        raise ValueError(f"Review definition frontmatter is not valid YAML: {exc}") from exc

    if parsed_frontmatter is None:
        raise ValueError("Review definition frontmatter is empty.")
    if not isinstance(parsed_frontmatter, dict):
        raise ValueError("Review definition frontmatter must be a YAML mapping.")

    _reject_unknown_keys(parsed_frontmatter)

    description = _require_string(parsed_frontmatter, "description")
    ci = _require_ci_bool(frontmatter_text, parsed_frontmatter)

    default_model_value = parsed_frontmatter.get("default_model")
    if default_model_value is None:
        default_model: str | None = None
    elif isinstance(default_model_value, str) and default_model_value.strip():
        default_model = default_model_value.strip()
    else:
        raise ValueError("Review definition field `default_model` must be a non-empty string.")

    when_changed = _optional_string_tuple(parsed_frontmatter, "when_changed")

    instructions = body.strip()
    if not instructions:
        raise ValueError("Review definition body (instructions) must not be empty.")

    return ReviewDefinition(
        name=name.strip(),
        description=description,
        instructions=instructions,
        default_model=default_model,
        ci=ci,
        when_changed=when_changed,
    )


def _reject_unknown_keys(frontmatter: dict[str, Any]) -> None:
    unknown = sorted(key for key in frontmatter if key not in _ALLOWED_FRONTMATTER_KEYS)
    if not unknown:
        return
    allowed = ", ".join(sorted(_ALLOWED_FRONTMATTER_KEYS))
    unknown_list = ", ".join(f"`{key}`" for key in unknown)
    raise ValueError(
        f"Review definition frontmatter contains unknown field(s): {unknown_list}. "
        f"Allowed fields: {allowed}."
    )


def _split_frontmatter(source: str) -> tuple[str, str]:
    lines = source.splitlines()
    first_content_index = next((index for index, line in enumerate(lines) if line.strip()), None)
    if first_content_index is None:
        raise ValueError("Review definition is empty.")

    if lines[first_content_index].strip() != _FRONTMATTER_FENCE:
        raise ValueError("Review definition must begin with a `---` frontmatter fence.")

    closing_index: int | None = None
    for index in range(first_content_index + 1, len(lines)):
        if lines[index].strip() == _FRONTMATTER_FENCE:
            closing_index = index
            break
    if closing_index is None:
        raise ValueError("Review definition frontmatter is missing a closing `---` fence.")

    frontmatter_text = "\n".join(lines[first_content_index + 1 : closing_index])
    body = "\n".join(lines[closing_index + 1 :])
    return frontmatter_text, body


def _require_string(frontmatter: dict[str, Any], field: str) -> str:
    if field not in frontmatter:
        raise ValueError(f"Review definition frontmatter is missing required field `{field}`.")
    value = frontmatter[field]
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"Review definition field `{field}` must be a non-empty string.")
    return value.strip()


def _require_ci_bool(frontmatter_text: str, frontmatter: dict[str, Any]) -> bool:
    field = "ci"
    if field not in frontmatter:
        raise ValueError(f"Review definition frontmatter is missing required field `{field}`.")

    ci_literal = _top_level_ci_literal(frontmatter_text)
    if ci_literal not in {"true", "false"} or not isinstance(frontmatter[field], bool):
        raise ValueError("Review definition field `ci` must be literal true or false.")
    return frontmatter[field]


def _top_level_ci_literal(frontmatter_text: str) -> str | None:
    ci_lines: list[str] = []
    for line in frontmatter_text.splitlines():
        if line[:1].isspace():
            continue
        stripped = line.strip()
        if stripped.startswith("ci:"):
            ci_lines.append(stripped)

    if len(ci_lines) != 1:
        return None

    value = ci_lines[0].partition(":")[2].strip()
    if "#" in value:
        value = value.split("#", 1)[0].strip()
    return value


def _optional_string_tuple(frontmatter: dict[str, Any], field: str) -> tuple[str, ...]:
    if field not in frontmatter:
        return ()

    value = frontmatter[field]
    if not isinstance(value, list):
        raise ValueError(f"Review definition field `{field}` must be a list of non-empty strings.")
    if not value:
        raise ValueError(f"Review definition field `{field}` must contain at least one pattern.")

    values: list[str] = []
    for index, item in enumerate(value):
        if not isinstance(item, str) or not item.strip():
            raise ValueError(
                f"Review definition field `{field}` item {index} must be a non-empty string."
            )
        values.append(item.strip())

    return tuple(values)
