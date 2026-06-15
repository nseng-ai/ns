---
name: sdl-submit
description: "Command: sdl-submit"
allowed-tools:
  - "Bash(sdl submit*)"
metadata:
  internal: true
---

# sdl-submit

Submit or update the current Graphite stack by delegating to the repo-local `sdl submit` command. This is the cross-harness path for `/sdl:submit`; do not run a parallel hand-written `gt submit` sequence unless the CLI is unavailable and the user explicitly accepts the fallback.

## When to use

Use only when the user explicitly asks to submit or update the current Graphite stack/PRs. This performs write-capable external effects through Graphite/GitHub.

## Workflow

Run from the repository root:

```bash
sdl submit
```

The CLI owns the orchestration:

- if the worktree is dirty, first creates a checkpoint with `sdl cp`;
- checks submit readiness with `gt submit -nps --no-ai --no-interactive --dry-run`;
- runs `gt submit -nps --no-ai --no-interactive` to submit/update the current stack;
- verifies that the current branch has a PR after submit;
- regenerates title/body descriptions for submitted PRs every time, overwriting any existing PR body;
- reports formatter-owned guidance for restack-required, empty-branch, and post-submit description-generation failures;
- when model access is available, appends an `AI interpretation` section with a concise explanation and next steps for failed submit output.

If the CLI says a restack is required:

- in an interactive session, follow the CLI prompt;
- in a non-interactive/headless invocation, rerun only with explicit user approval:

```bash
sdl submit --restack
```

Automatic checkpointing uses SDL checkpoint environment variables:

- `SDL_CHECKPOINT_MODEL` defaults to `openai-codex/gpt-5.4-mini`;
- `ASDL_DEV_CHECKPOINT_MODEL` remains a legacy fallback when `SDL_CHECKPOINT_MODEL` is unset.

PR description generation uses:

- `ASDL_DEV_PR_DESCRIPTION_MODEL` for the model ref, defaulting to `openai-codex/gpt-5.4-mini`;
- `ASDL_DEV_PR_DESCRIPTION_PROMPT` as an optional prompt-file override;
- `.asdl/prompts/pr-description.md` as the repo-local prompt override before the built-in default.

Submit failure interpretation uses `SDL_SUBMIT_FAILURE_MODEL`, defaulting to the standard SDL fast model.

To regenerate the current branch PR explicitly, run:

```bash
asdl-dev pr-regen
```

`submit` regenerates PR title/body metadata for submitted PRs every time, replacing any existing PR body. Explicit `asdl-dev pr-regen` also regenerates both the title and body for the current branch PR, replacing any existing body.

## Failure handling

Surface CLI output directly, including any `AI interpretation` section. Do not bypass the checkpoint failure, restack guidance, Graphite submit failure, or post-submit PR verification failure. Do not fall back to raw `gt submit` unless the user explicitly asks for a manual fallback after seeing the CLI failure.

## Boundaries

- This skill submits/updates PRs; require explicit user intent.
- It does not land/merge PRs.
- It edits PR titles/bodies through `sdl submit` or explicit `asdl-dev pr-regen`, and these regeneration paths replace existing PR bodies.
