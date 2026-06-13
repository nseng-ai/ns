# Prompt Authoring Rules

This directory contains repo-local prompt policy consumed by agent workflows across harnesses. Treat prompt text as durable agent-facing instructions, not Pi-only UI copy.

## Harness-neutral command references

- Prefer native CLI commands in prompt files when a workflow has both a CLI and a harness-specific adapter.
- Mention Pi slash commands, Claude commands, Codex commands, or other harness-specific affordances only when the prompt is explicitly about that harness runtime or UI surface.
- If a harness-specific command is useful context, identify it as an adapter over the CLI rather than the canonical behavior owner.
- For checkpointing guidance, write `sdl cp`; do not write `/sdl:cp` or the legacy `/code:cp` in durable saved-plan policy.
