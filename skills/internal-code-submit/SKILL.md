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
- checks submit readiness with `gt submit -nps --ai --dry-run`;
- runs `gt submit -nps --ai` to submit/update the current stack;
- verifies that the current branch has a PR after submit;
- reports formatter-owned guidance for restack-required and empty-branch cases.

If the CLI says a restack is required:

- in an interactive session, follow the CLI prompt;
- in a non-interactive/headless invocation, rerun only with explicit user approval:

```bash
asdl-dev submit --restack
```

Automatic checkpointing uses the same environment as `asdl-dev cp`:

- `ASDL_DEV_TEXT_BACKEND` defaults to `pi`;
- `ASDL_DEV_CHECKPOINT_MODEL` defaults to `openai-codex/gpt-5.4-mini`.

## Failure handling

Surface CLI output directly. Do not bypass the checkpoint failure, restack guidance, Graphite submit failure, or post-submit PR verification failure. Do not fall back to raw `gt submit` unless the user explicitly asks for a manual fallback after seeing the CLI failure.

## Boundaries

- This skill submits/updates PRs; require explicit user intent.
- It does not land/merge PRs.
- It does not edit PR titles or bodies after submit.
