from __future__ import annotations

PROMPT_PATH = ".twerk/branch-memory/oneshot/prompt.md"


def build_oneshot_branch_memory(prompt: str) -> dict[str, str]:
    return {PROMPT_PATH: f"{prompt.rstrip()}\n"}
