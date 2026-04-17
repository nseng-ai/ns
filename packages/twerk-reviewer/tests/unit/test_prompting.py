from __future__ import annotations

from twerk_reviewer.models import LocalDiff, ReviewDefinition
from twerk_reviewer.prompting import build_review_prompt, build_review_system_prompt


def test_build_review_prompt_describes_the_reviewer_and_diff() -> None:
    prompt = build_review_prompt(
        review_definition=ReviewDefinition(
            name="Dignified Python",
            description="Review Python diffs for style violations.",
            instructions="Flag concrete issues in the diff.",
            default_model=None,
        ),
        local_diff=LocalDiff(
            base_ref="master",
            diff_text="diff --git a/app.py b/app.py\n+print('hello')\n",
        ),
    )

    assert "Reviewer name: Dignified Python" in prompt
    assert "Review Python diffs for style violations." in prompt
    assert "Flag concrete issues in the diff." in prompt
    assert "Base ref: master" in prompt
    assert "diff --git a/app.py b/app.py" in prompt


def test_build_review_prompt_no_longer_carries_output_contract() -> None:
    """Output contract moved to the system prompt; keep the user prompt clean."""
    prompt = build_review_prompt(
        review_definition=ReviewDefinition(
            name="X",
            description="Y",
            instructions="Z",
        ),
        local_diff=LocalDiff(base_ref="master", diff_text=""),
    )

    assert '"findings": [' not in prompt
    assert "JSON" not in prompt


def test_system_prompt_findings_directs_structured_output_tool() -> None:
    prompt = build_review_system_prompt("findings")

    assert "StructuredOutput" in prompt
    assert "findings" in prompt
    assert "schema" in prompt.lower()


def test_system_prompt_text_forbids_json_output() -> None:
    prompt = build_review_system_prompt("text")

    assert "markdown review" in prompt.lower()
    assert "Do not emit JSON" in prompt
    # Reviewer gets read-only exploration; it must not mutate the repo.
    assert "read-only" in prompt.lower()
    assert "mutate" in prompt.lower()
