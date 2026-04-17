"""Prompt assembly for twerk-reviewer."""

from __future__ import annotations

from functools import cache
from importlib.resources import files

from twerk_reviewer.models import LocalDiff, ReviewDefinition


@cache
def _review_prompt_template() -> str:
    return files("twerk_reviewer.prompts").joinpath("review_prompt.md").read_text(encoding="utf-8")


def build_review_prompt(
    *,
    review_definition: ReviewDefinition,
    local_diff: LocalDiff,
) -> str:
    """Build the prompt sent to the review executor."""
    return _review_prompt_template().format(
        review_name=review_definition.name,
        review_description=review_definition.description,
        review_instructions=review_definition.instructions,
        base_ref=local_diff.base_ref,
        diff_text=local_diff.diff_text,
    ).strip()
