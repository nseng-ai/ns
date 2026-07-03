---
name: sdl-flow-submit
disable-model-invocation: true
description: "Command: sdl-flow-submit"
allowed-tools:
  - "Bash(ji flow submit*)"
metadata:
  internal: true
---

# sdl-flow-submit

Submit or update the current Graphite stack by delegating to the repo-local `ji flow submit` command. This is the cross-harness path for `/ji:flow:submit`; do not run a parallel hand-written `gt submit` sequence unless the CLI is unavailable and the user explicitly accepts the fallback.

## When to use

Use only when the user explicitly asks to submit or update the current Graphite stack/PRs. This performs write-capable external effects through Graphite/GitHub.

## Workflow

Run from the repository root:

```bash
ji flow submit
```

The CLI owns the orchestration:

- if the worktree is dirty, first creates a checkpoint with `ji flow cp`;
- checks submit readiness with `gt submit -nps --no-ai --no-interactive --dry-run`;
- runs `gt submit -nps --no-ai --no-interactive` to submit/update the current stack;
- verifies that the current branch has a PR after submit;
- skips PR description regeneration when the stored patch-id/prompt fingerprint is unchanged;
- when regeneration is needed, updates PR titles and replaces only the managed generated body region, preserving human text outside it;
- reports formatter-owned guidance for restack-required, empty-branch, and post-submit description-generation failures;
- when model access is available, appends an `AI interpretation` section with a concise explanation and next steps for failed submit output.

If the CLI says a restack is required:

- in an interactive session, follow the CLI prompt;
- in a non-interactive/headless invocation, rerun only with explicit user approval:

```bash
ji flow submit --restack
```

Automatic checkpointing uses ji checkpoint environment variables:

- `JI_CHECKPOINT_MODEL` defaults to `openai-codex/gpt-5.4-mini`;
- `JI_DEV_CHECKPOINT_MODEL` remains a legacy fallback when `JI_CHECKPOINT_MODEL` is unset.

PR description generation uses:

- `JI_DEV_PR_DESCRIPTION_MODEL` for the model ref, defaulting to `openai-codex/gpt-5.4-mini`;
- `JI_DEV_PR_DESCRIPTION_PROMPT` as an optional prompt-file override;
- `.ji/prompts/pr-description.md` as the repo-local prompt override before the built-in default.

Submit failure interpretation uses `JI_SUBMIT_FAILURE_MODEL`, defaulting to the standard ji fast model.

To regenerate the current branch PR explicitly, run:

```bash
ji flow regenerate-pr
```

`ji flow submit` preserves unchanged generated descriptions by comparing the GitHub PR diff patch id, prompt hash, and generator version stored in the managed body region. Explicit `ji flow regenerate-pr` asks before editing GitHub, always regenerates the current branch PR title and managed generated body region, and preserves human-authored body text outside that region.

## Failure handling

Surface CLI output directly, including any `AI interpretation` section. Do not bypass the checkpoint failure, restack guidance, Graphite submit failure, or post-submit PR verification failure. Do not fall back to raw `gt submit` unless the user explicitly asks for a manual fallback after seeing the CLI failure.

## Boundaries

- This skill submits/updates PRs; require explicit user intent.
- It does not land/merge PRs.
- It edits PR titles/bodies through `ji flow submit` or explicit `ji flow regenerate-pr`; managed generated content is machine-owned, while human PR body text outside the managed region is preserved.
