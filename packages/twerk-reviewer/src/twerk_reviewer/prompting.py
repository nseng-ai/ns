"""Prompt assembly for twerk-reviewer."""

from __future__ import annotations

from textwrap import dedent

from twerk_reviewer.models import LocalDiff, ReviewDefinition


def build_review_prompt(
    *,
    review_definition: ReviewDefinition,
    local_diff: LocalDiff,
) -> str:
    """Build the prompt sent to the review executor."""
    return dedent(
        f"""
        You are a code reviewer enforcing a markdown-defined engineering standard.

        Reviewer name: {review_definition.name}
        Reviewer description: {review_definition.description}

        Instructions:
        {review_definition.instructions}

        Review only the supplied diff. Return JSON with this shape:
        {{
          "findings": [
            {{
              "path": "relative/path.py",
              "line": 12,
              "severity": "warning",
              "summary": "Short summary",
              "details": "Actionable explanation tied to the diff"
            }}
          ]
        }}

        Use null for `line` when a finding does not point at a single line. If
        there are no findings, return:
        {{"findings": []}}

        Base ref: {local_diff.base_ref}

        Diff:
        ```diff
        {local_diff.diff_text}
        ```
        """
    ).strip()
