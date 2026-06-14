from __future__ import annotations

import click
import pytest

from areg.json_config import extract_string_list_field, read_json_object


def test_read_json_object_returns_dict(tmp_path) -> None:
    path = tmp_path / "settings.json"
    path.write_text('{"skills": []}\n', encoding="utf-8")

    assert read_json_object(path, description="settings.json") == {"skills": []}


def test_read_json_object_rejects_non_object(tmp_path) -> None:
    path = tmp_path / "settings.json"
    path.write_text("[]\n", encoding="utf-8")

    with pytest.raises(click.ClickException, match="must contain a JSON object"):
        read_json_object(path, description="settings.json")


def test_extract_string_list_field_returns_strings() -> None:
    assert extract_string_list_field(
        {"skills": ["-skills/example"]},
        "skills",
        error_message="skills must be strings",
    ) == ["-skills/example"]


def test_extract_string_list_field_rejects_blank_when_required() -> None:
    with pytest.raises(click.ClickException, match="agents must be non-empty"):
        extract_string_list_field(
            {"agents": [""]},
            "agents",
            error_message="agents must be non-empty",
            require_non_empty=True,
            require_non_blank_items=True,
        )
