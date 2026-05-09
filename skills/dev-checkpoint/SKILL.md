---
name: dev-checkpoint
description: Command
model: claude-haiku-4-5
allowed-tools:
  - "Bash(git status:*)"
  - "Bash(git diff:*)"
  - "Bash(git add:*)"
  - "Bash(git commit:*)"
  - "Bash(git rev-parse:*)"
  - "Bash(git symbolic-ref:*)"
  - "Bash(git log:*)"
metadata:
  internal: true
---

<!-- PUBLIC SKILL: Do not reference asdl-internal module paths or class names in this file. Describe CLI operations, not implementation. See AGENTS.md § "Public Skill Authoring". -->

# dev-checkpoint

Stage everything on the current branch and create a single new commit. The whole skill runs on Haiku via the `model:` frontmatter override — no subagent indirection. Replaces ad-hoc `git commit -a -m cp` checkpoints with something a later agent can scan in `git log` without reopening the diff.

## When to use

Quick checkpoints where you would otherwise type `git commit -a -m cp` (or similar throwaway message). The audience for the message is other agents reading `git log`, not humans reading PR descriptions — _minimally_ informative is the goal, not polished.

Do **not** use this for milestone commits, PR-ready commits, or anything that will be the head of a submitted branch. Write those messages yourself.

## Workflow

### 1. Pre-flight

- `git symbolic-ref --short HEAD` — refuse if the branch is `main` or `master`. Report the branch and stop.
- `git status --porcelain` — refuse if the working tree is clean (nothing to commit).

### 2. Capture pending state

- `git diff HEAD` — tracked changes.
- `git status --porcelain` — enumerates untracked files. `git add -A` will include them, but they will not appear in `git diff HEAD`, so you need the filenames separately for the message.

### 3. Draft the commit message

Output exactly: one short subject line prefixed with `[cp]` (≤52 chars total. Shorter is better. Use imperative mood with no trailing period), a blank line, then 1–3 bullets starting with `-`. No prose paragraphs, no markdown headers, no Co-Authored-By trailer, no closing remarks. Three bullets is the cap, not the floor — one bullet is fine for a small diff.

### 4. Stage and commit

- `git add -A` to stage tracked + untracked changes.
- Create the commit using the HEREDOC form so bullet formatting survives:

  ```
  git commit -m "$(cat <<'EOF'
  [cp] <subject line>

  - <bullet 1>
  - <bullet 2>
  - <bullet 3>
  EOF
  )"
  ```

- No `--amend`. No `--no-verify`. If a pre-commit hook fails, surface the hook output to the user and stop — do not retry, do not amend, do not bypass.

### 5. Report

Print `git log -1 --oneline` followed by the full commit message body. Nothing else.

## Rules

- Never run on `main` or `master`.
- Never `--amend`. Never `--no-verify`.
- The whole skill runs on Haiku via the `model:` frontmatter override; do not escalate to a larger model mid-skill.
- Three bullets is the cap, not the floor — one bullet is fine for a small diff.
- No `Co-Authored-By:` trailer. Checkpoint commits are kept terse for `git log` scanning; if a checkpoint needs attribution, write the commit by hand instead.
