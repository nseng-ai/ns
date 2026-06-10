---
name: internal-code-submit
description: "Command: internal-code-submit"
allowed-tools:
  - "Bash(asdl-dev submit*)"
metadata:
  internal: true
---

# internal-code-submit

Submit or update the current Graphite stack by delegating to the shared `asdl-dev submit` CLI. This is the cross-harness path for `/code:submit`; do not run a parallel hand-written `gt submit` sequence unless the CLI is unavailable and the user explicitly accepts the fallback.

## When to use

Use only when the user explicitly asks to submit or update the current Graphite stack/PRs. This performs write-capable external effects through Graphite/GitHub.

## Workflow

Run:

```bash
asdl-dev submit
```

The CLI owns the orchestration:

- if the worktree is dirty, first creates a checkpoint with `asdl-dev cp`;
- checks submit readiness with `gt submit -nps --no-ai --dry-run`;
- runs `gt submit -nps --no-ai` to submit/update the current stack;
- verifies that the current branch has a PR after submit;
- generates title/body descriptions for PRs newly created by that submit;
- reports formatter-owned guidance for restack-required, empty-branch, and post-submit description-generation failures.

If the CLI says a restack is required:

- in an interactive session, follow the CLI prompt;
- in a non-interactive/headless invocation, rerun only with explicit user approval:

```bash
asdl-dev submit --restack
```

Automatic checkpointing uses the same environment as `asdl-dev cp`:

- `ASDL_DEV_TEXT_BACKEND` defaults to `pi`;
- `ASDL_DEV_CHECKPOINT_MODEL` defaults to `openai-codex/gpt-5.4-mini`.

PR description generation uses:

- `ASDL_DEV_PR_DESCRIPTION_MODEL` for the model ref, defaulting to `openai-codex/gpt-5.4-mini`;
- `ASDL_DEV_PR_DESCRIPTION_PROMPT` as an optional prompt-file override;
- `.asdl/prompts/pr-description.md` as the repo-local prompt override before the built-in default.

To regenerate the current branch PR explicitly, run:

```bash
asdl-dev pr-regen
```

`pr-regen` refuses to overwrite non-empty PR bodies unless they contain the asdl generated-body marker. Use `asdl-dev pr-regen --force` only when the user explicitly wants to overwrite a manually edited PR body.

## Failure handling

Surface CLI output directly. Do not bypass the checkpoint failure, restack guidance, Graphite submit failure, or post-submit PR verification failure. Do not fall back to raw `gt submit` unless the user explicitly asks for a manual fallback after seeing the CLI failure.

## Boundaries

- This skill submits/updates PRs; require explicit user intent.
- It does not land/merge PRs.
- It only edits PR titles/bodies through `asdl-dev submit` for newly created PRs or through explicit `asdl-dev pr-regen`.
