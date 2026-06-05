from __future__ import annotations

from importlib.resources import files

import pytest


@pytest.mark.parametrize(
    ("filename", "schema_version"),
    (
        ("stack_triage.md", "roaster.stack.triage.v1"),
        ("stack_resolver.md", "roaster.stack.resolver.v1"),
    ),
)
def test_stack_prompt_resources_are_packaged_and_readable(
    filename: str,
    schema_version: str,
) -> None:
    resource = files("roaster.prompts").joinpath(filename)

    assert resource.is_file()
    content = resource.read_text(encoding="utf-8")
    assert schema_version in content
    assert content.startswith("# Roaster")
