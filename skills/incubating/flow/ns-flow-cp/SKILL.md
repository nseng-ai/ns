---
name: ns-flow-cp
disable-model-invocation: true
description: "Create a quick `[cp]` checkpoint commit for the current diff by delegating to `ns flow cp`."
allowed-tools:
  - "Bash(ns flow cp*)"
---

# ns-flow-cp

Create a quick checkpoint commit for the current git diff by delegating to the `ns flow cp` CLI. This is the cross-harness path for `/ns:flow:cp`.

## When to use

Use for quick checkpoints where you would otherwise type `git commit -a -m cp` or a similar throwaway message. The message audience is later agents scanning `git log`, not humans reading PR descriptions.

Do **not** use for milestone commits, PR-ready commits, or anything that should carry a carefully authored head commit message. Write those messages yourself.

## Workflow

Run:

```bash
ns flow cp
```

The CLI owns the deterministic behavior:

- refuses to create a checkpoint on `main` or `master`;
- refuses when the worktree is clean;
- drafts and validates a `[cp]` commit message with 1-3 bullets;
- stages tracked and untracked changes.

## Failure handling

If `ns flow cp` fails, surface its stderr/stdout and stop; recovery only on an explicit user choice after seeing the failure.

## Rules

- Never hand-roll the checkpoint commit when `ns flow cp` is available.
- Never run `git commit --amend` or `git commit --no-verify` for this workflow.
- Do not add Co-Authored-By trailers to checkpoint commits unless the user explicitly asks for a hand-authored commit instead.
