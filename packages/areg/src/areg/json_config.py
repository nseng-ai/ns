from __future__ import annotations

import json
from json import JSONDecodeError
from pathlib import Path

import click


def read_json_object(path: Path, *, description: str) -> dict[str, object]:
    try:
        parsed = json.loads(path.read_text(encoding="utf-8"))
    except JSONDecodeError as exc:
        raise click.ClickException(f"Invalid JSON in {description}: {exc}.") from exc
    except OSError as exc:
        raise click.ClickException(f"Failed to read {description} at {path}: {exc}") from exc

    if not isinstance(parsed, dict):
        raise click.ClickException(f"{description} must contain a JSON object.")
    return parsed


def extract_string_list_field(
    data: dict[str, object],
    field_name: str,
    *,
    error_message: str,
    require_non_empty: bool = False,
    require_non_blank_items: bool = False,
) -> list[str]:
    value = data.get(field_name)
    if not isinstance(value, list) or (require_non_empty and not value):
        raise click.ClickException(error_message)

    items: list[str] = []
    for item in value:
        if not isinstance(item, str) or (require_non_blank_items and not item.strip()):
            raise click.ClickException(error_message)
        items.append(item)
    return items
