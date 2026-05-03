"""Prompt assembly for asdl-reviewer."""

from __future__ import annotations

from functools import cache
from importlib.resources import files

from asdl_reviewer.models import LocalDiff, ReviewDefinition, ReviewFormat


def _read_prompt(filename: str) -> str:
    return files("asdl_reviewer.prompts").joinpath(filename).read_text(encoding="utf-8").strip()


@cache
def _review_prompt_template() -> str:
    return files("asdl_reviewer.prompts").joinpath("review_prompt.md").read_text(encoding="utf-8")


@cache
def _system_prompt_findings() -> str:
    return _read_prompt("review_system_findings.md")


@cache
def _system_prompt_text() -> str:
    return _read_prompt("review_system_text.md")


def build_review_system_prompt(review_format: ReviewFormat) -> str:
    """Build the harness-owned system prompt for a review run."""
    if review_format == "findings":
        return _system_prompt_findings()
    return _system_prompt_text()


def build_review_prompt(
    *,
    review_definition: ReviewDefinition,
    local_diff: LocalDiff,
) -> str:
    """Build the user prompt sent to the review executor."""
    return (
        _review_prompt_template()
        .format(
            review_name=review_definition.name,
            review_description=review_definition.description,
            review_instructions=review_definition.instructions,
            base_ref=local_diff.base_ref,
            diff_text=local_diff.diff_text,
        )
        .strip()
    )
