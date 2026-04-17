"""Prompt assembly for twerk-reviewer."""

from __future__ import annotations

from textwrap import dedent

from twerk_reviewer.models import LocalDiff, ReviewDefinition, ReviewFormat

_SYSTEM_PROMPT_FINDINGS = dedent(
    """
    You are a code reviewer. Your task is to review the unified diff
    included in the user message and return structured findings about it.

    Output rules:
    - Emit findings by calling the StructuredOutput tool with a payload that
      matches the provided JSON schema. The payload is an object with a
      `findings` array.
    - Each finding must be grounded in a concrete line or section of the
      diff. Use null for `line` only when a finding genuinely spans the
      whole file or diff.
    - If there is nothing worth flagging, call StructuredOutput with
      {"findings": []}.
    - Finish by calling StructuredOutput exactly once. Do not emit JSON as
      plain text.

    Context and tools:
    - You have read-only access to the repository (Read and Bash). Use them
      only when the diff alone is insufficient — for example to confirm how
      a changed function is used elsewhere, or to check a sibling file's
      pattern. Do not run tests, install packages, or mutate state.
    - Do not ask clarifying questions. Make the best call you can with the
      diff and the repo context you gather.
    - Only flag issues that are actually visible in the diff. Do not invent
      findings about code that is unchanged or unrelated.
    """
).strip()

_SYSTEM_PROMPT_TEXT = dedent(
    """
    You are a code reviewer. Your task is to review the unified diff
    included in the user message and write a concise markdown review of it.

    Output rules:
    - Produce a human-readable markdown review tied to concrete files and
      lines from the diff.
    - Do not emit JSON.
    - Keep the review under roughly 400 words unless the diff genuinely
      requires more.

    Context and tools:
    - You have read-only access to the repository (Read and Bash). Use them
      only when the diff alone is insufficient — for example to confirm how
      a changed function is used elsewhere, or to check a sibling file's
      pattern. Do not run tests, install packages, or mutate state.
    - Do not ask clarifying questions. Make the best call you can with the
      diff and the repo context you gather.
    - Only comment on things that are actually visible in the diff. Do not
      invent findings about code that is unchanged or unrelated.
    """
).strip()


def build_review_system_prompt(review_format: ReviewFormat) -> str:
    """Build the harness-owned system prompt for a review run."""
    if review_format == "findings":
        return _SYSTEM_PROMPT_FINDINGS
    return _SYSTEM_PROMPT_TEXT


def build_review_prompt(
    *,
    review_definition: ReviewDefinition,
    local_diff: LocalDiff,
) -> str:
    """Build the user prompt sent to the review executor."""
    return dedent(
        f"""
        Reviewer name: {review_definition.name}
        Reviewer description: {review_definition.description}

        Instructions:
        {review_definition.instructions}

        Base ref: {local_diff.base_ref}

        Diff:
        ```diff
        {local_diff.diff_text}
        ```
        """
    ).strip()
