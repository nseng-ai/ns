---
name: code-checkpoint
description: "Command: code-checkpoint"
allowed-tools:
  - "Bash(asdl-dev cp*)"
metadata:
  internal: true
---

# code-checkpoint

Create a quick checkpoint commit for the current git diff by delegating to the shared `asdl-dev cp` CLI. This is the cross-harness path for `/code:cp`; do not reimplement checkpointing with ad-hoc `git add` / `git commit` logic in the skill.

## When to use

Use for quick checkpoints where you would otherwise type `git commit -a -m cp` or a similar throwaway message. The message audience is later agents scanning `git log`, not humans reading PR descriptions.

Do **not** use for milestone commits, PR-ready commits, or anything that should carry a carefully authored head commit message. Write those messages yourself.

## Workflow

Run:

```bash
asdl-dev cp
```

The CLI owns the deterministic behavior:

- captures the pending worktree snapshot, including untracked files;
- refuses to create a checkpoint on `main` or `master`;
- refuses when the worktree is clean;
- drafts and validates a `[cp]` commit message with 1-3 bullets;
- stages tracked and untracked changes;
- creates one new commit without `--amend` or `--no-verify`;
- prints `git log -1 --oneline` plus the full checkpoint message.

Text generation is controlled by the CLI environment:

- `ASDL_DEV_TEXT_BACKEND` defaults to `pi`;
- `ASDL_DEV_CHECKPOINT_MODEL` defaults to `openai-codex/gpt-5.4-mini`.

## Failure handling

If `asdl-dev cp` fails, surface its stderr/stdout and stop. Do not retry by hand, do not amend, and do not bypass hooks.

## Rules

- Never hand-roll the checkpoint commit when `asdl-dev cp` is available.
- Never run `git commit --amend` or `git commit --no-verify` for this workflow.
- Do not add Co-Authored-By trailers to checkpoint commits unless the user explicitly asks for a hand-authored commit instead.
