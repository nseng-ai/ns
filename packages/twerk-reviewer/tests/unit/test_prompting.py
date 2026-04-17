from __future__ import annotations

from twerk_reviewer.models import LocalDiff, ReviewDefinition
from twerk_reviewer.prompting import build_review_prompt


def test_build_review_prompt_includes_contract_and_diff() -> None:
    prompt = build_review_prompt(
        review_definition=ReviewDefinition(
            name="Dignified Python",
            description="Review Python diffs for style violations.",
            instructions="Flag concrete issues in the diff.",
        ),
        local_diff=LocalDiff(
            base_ref="master",
            diff_text="diff --git a/app.py b/app.py\n+print('hello')\n",
        ),
    )

    assert "Reviewer name: Dignified Python" in prompt
    assert "Review Python diffs for style violations." in prompt
    assert '"findings": [' in prompt
    assert "Base ref: master" in prompt
    assert "diff --git a/app.py b/app.py" in prompt
