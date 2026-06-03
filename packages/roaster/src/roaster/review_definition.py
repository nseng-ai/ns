"""Parsing helpers for markdown-defined reviewers."""

from __future__ import annotations

from typing import Any

import yaml

from roaster.models import ReviewDefinition, ReviewMetadata, ReviewScope

_FRONTMATTER_FENCE = "---"
_ALLOWED_FRONTMATTER_KEYS: frozenset[str] = frozenset(
    {"description", "default_model", "scope", "when_changed"}
)
_VALID_SCOPES: frozenset[ReviewScope] = frozenset({"all", "ci", "local"})


def parse_review_metadata(source: str, *, name: str) -> ReviewMetadata:
    """Parse frontmatter metadata without requiring instruction body content."""
    metadata, _body = _parse_review_parts(source=source, name=name)
    return metadata


def parse_review_definition(source: str, *, name: str) -> ReviewDefinition:
    """Parse a review definition written as YAML frontmatter + markdown body.

    The reviewer `name` is supplied by the caller (typically the filename
    without its extension) rather than declared in the frontmatter.
    """
    metadata, body = _parse_review_parts(source=source, name=name)

    instructions = body.strip()
    if not instructions:
        raise ValueError("Review definition body (instructions) must not be empty.")

    return ReviewDefinition(
        name=metadata.key,
        description=metadata.description,
        instructions=instructions,
        default_model=metadata.default_model,
        scope=metadata.scope,
        when_changed=metadata.when_changed,
    )


def _parse_review_parts(source: str, *, name: str) -> tuple[ReviewMetadata, str]:
    normalized_name = name.strip()
    if not normalized_name:
        raise ValueError("Review definition `name` must be a non-empty string.")

    frontmatter_text, body = _split_frontmatter(source)
    parsed_frontmatter = _parse_frontmatter(frontmatter_text)
    _reject_unknown_keys(parsed_frontmatter)

    return (
        ReviewMetadata(
            key=normalized_name,
            description=_require_string(parsed_frontmatter, "description"),
            default_model=_optional_non_empty_string(parsed_frontmatter, "default_model"),
            scope=_optional_scope(parsed_frontmatter),
            when_changed=_optional_string_tuple(parsed_frontmatter, "when_changed"),
        ),
        body,
    )


def _parse_frontmatter(frontmatter_text: str) -> dict[str, Any]:
    try:
        parsed_frontmatter = yaml.safe_load(frontmatter_text)
    except yaml.YAMLError as exc:
        raise ValueError(f"Review definition frontmatter is not valid YAML: {exc}") from exc

    if parsed_frontmatter is None:
        raise ValueError("Review definition frontmatter is empty.")
    if not isinstance(parsed_frontmatter, dict):
        raise ValueError("Review definition frontmatter must be a YAML mapping.")
    return parsed_frontmatter


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


def _optional_non_empty_string(frontmatter: dict[str, Any], field: str) -> str | None:
    if field not in frontmatter:
        return None
    value = frontmatter[field]
    if isinstance(value, str) and value.strip():
        return value.strip()
    raise ValueError(f"Review definition field `{field}` must be a non-empty string.")


def _optional_scope(frontmatter: dict[str, Any]) -> ReviewScope:
    if "scope" not in frontmatter:
        return "all"

    value = frontmatter["scope"]
    if not isinstance(value, str) or not value.strip():
        raise ValueError("Review definition field `scope` must be one of: all, ci, local.")

    normalized = value.strip()
    if normalized == "all" or normalized == "ci" or normalized == "local":
        return normalized

    valid_values = ", ".join(sorted(_VALID_SCOPES))
    raise ValueError(f"Review definition field `scope` must be one of: {valid_values}.")


def _optional_string_tuple(frontmatter: dict[str, Any], field: str) -> tuple[str, ...]:
    if field not in frontmatter:
        return ()

    value = frontmatter[field]
    if not isinstance(value, list) or not value:
        raise ValueError(f"Review definition field `{field}` must be a non-empty list of strings.")

    entries: list[str] = []
    for item in value:
        if not isinstance(item, str) or not item.strip():
            raise ValueError(
                f"Review definition field `{field}` must be a non-empty list of strings."
            )
        entries.append(item.strip())
    return tuple(entries)
