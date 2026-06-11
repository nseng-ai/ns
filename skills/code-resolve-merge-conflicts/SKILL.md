---
name: code-resolve-merge-conflicts
description: "Resolve merge conflicts from an in-progress rebase or merge. Use when a rebase or merge hits conflicts and the user wants Claude to resolve them intelligently. Also the per-conflict engine that driver skills (e.g. code-gt-restack-resolve) invoke."
allowed-tools:
  - "Bash(git status *)"
  - "Bash(git show *)"
  - "Bash(git diff *)"
  - "Bash(git log *)"
  - "Bash(git merge-base *)"
  - "Bash(git add *)"
  - "Bash(git restore *)"
  - "Bash(git checkout --ours *)"
  - "Bash(git checkout --theirs *)"
  - "Bash(git rebase *)"
  - "Bash(git merge *)"
  - "Bash(git commit *)"
  - "Bash(gt continue)"
  - "Bash(just *)"
  - "Bash(uv run pytest *)"
  - Read
  - Edit
  - Grep
---

# code-resolve-merge-conflicts

Resolve conflicts from a rebase or merge that is **already in progress**. This
skill does NOT initiate the operation — it was started externally (`git rebase`,
`git merge`, or a driver skill) and hit conflicts. Your job is to resolve those
conflicts safely and continue to completion.

This document is also the **conflict-resolution engine** for driver skills. A
driver (e.g. `code-gt-restack-resolve`) owns starting the operation and its
surrounding workflow, and delegates every conflict stop here. The **Driver
contract** section defines exactly what a driver may override; everything else
is fixed policy for every invocation, bare or driven.

## When to use

- User says "resolve conflicts", "fix conflicts", "help with rebase", "merge
  conflicts"
- A rebase or merge is in progress and has conflicted files
- A driver skill directs you here for per-conflict mechanics

## Operation modes

| Mode   | Detect via `git status`                                      | Default continue command | Intent-diff source                                                |
| ------ | ------------------------------------------------------------ | ------------------------ | ----------------------------------------------------------------- |
| rebase | "rebase in progress"; "Last command done: pick `<sha>`"      | `git rebase --continue`  | `git show <sha> -- <file>`                                        |
| merge  | "You have unmerged paths" while merging; `MERGE_HEAD` exists | `git merge --continue`   | `git diff $(git merge-base HEAD MERGE_HEAD) MERGE_HEAD -- <file>` |

**Conflict-marker sides differ by mode.** In a **merge**, `<<<<<<< HEAD` is your
branch and `>>>>>>> <ref>` is the incoming branch. In a **rebase** the sides are
inverted from what you might expect: `HEAD` is the new base being rebased onto
(plus commits already replayed), and `>>>>>>> <sha>` is your own commit being
replayed.

**Graphite check:** if the rebase was started by Graphite (`gt restack`,
`gt move`), continue with `gt continue` instead of `git rebase --continue` so
gt's stack bookkeeping stays intact — or switch to the
`code-gt-restack-resolve` skill, which drives the whole restack.

## Driver contract

A driver skill may override exactly three things:

1. **Continue command** — e.g. `gt continue` instead of the mode default.
2. **Extra bail-out conditions** — e.g. "a conflict surfaces in a branch
   outside the selected scope".
3. **Post-completion checks** — e.g. `gt log` / `gt ls` after the final
   continue.

Everything else — classification, region-only edits, the verification gate,
escalation format, abort policy — is engine policy and not overridable.

## The decisive technique: intent-diff

Resolve from **intent**, not from raw conflict markers. The intent-diff (see
the modes table) shows what the incoming side actually changed relative to its
own parent, separated from content it never touched. The most common conflict
shape: the base **added** content while the incoming commit **edited adjacent**
content — the fix is a complementary merge that keeps both.

**Edit only the conflict region** to keep the chosen side(s). Never
`git checkout --theirs`/`--ours` a whole file — that discards non-conflicting
changes elsewhere in the file. The only exception is auto-generated files
(workflow step 2).

## Workflow

### 1. Check status

Run `git status` — determine the mode (rebase or merge), the stopped/incoming
commit, and all conflicted files.

### 2. Auto-generated files

Files with an auto-generated header comment (e.g. `<!-- AUTO-GENERATED FILE -->`
or similar tooling markers): accept either side whole-file —
`git checkout --theirs <file>` (or `--ours`) — and `git add`. These get
regenerated in step 7. All other files proceed to step 3.

### 3. Resolve each real content file

a. **Get the intent-diff** (modes table) — the ground truth for what the
incoming side changed.

b. **Classify** the conflict region against the four **safe** categories:

- **complementary / non-overlapping** — sides change different things in the
  region; keep both
- **identical** — both sides made the same change; keep one
- **formatting / whitespace / import-order** — purely mechanical; resolve to
  the correct mechanical form
- **one-side strict-superset** — one side fully contains the other; keep the
  superset

Anything **outside** the safe set → **escalate** (step 5), no matter how
confident the resolution looks.

c. **Edit only the conflict region.** The resolved file must contain no
`<<<<<<<`, `=======`, or `>>>>>>>` markers.

### 4. Verify before continuing

When any auto-resolved file is **code**, run the scoped project check before
the continue command:

| Conflicted files     | Check                                                                    |
| -------------------- | ------------------------------------------------------------------------ |
| `ts/**` only         | `just ts-check` (optionally `just ts-test`)                              |
| Python only          | `just ty` + targeted `uv run pytest <affected package>` (or `just test`) |
| Mixed / uncertain    | `just check`                                                             |
| Docs / markdown only | no check                                                                 |

- **Pass** → `git add` the resolved files → run the continue command.
- **Fail** → `git restore --merge <file>` to bring back the conflict markers,
  then **escalate** that file.

### 5. Escalate

Pause and hand the decision to the user. Present:

- both sides of the conflict region,
- the intent-diff, and
- a **proposed** resolution with your reasoning.

Use AskUserQuestion or an inline prompt. On the user's decision: apply it,
`git add`, run the continue command, and **auto-resume** the loop.

### 6. Continue and loop

Run the continue command. Each continue may stop on the next commit with new
conflicts — repeat from step 1 until the operation reports completion.

### 7. Regenerate auto-generated files

Regenerate any auto-generated files from step 2 using the project's tooling
(doc generators, index builders, lock files). Commit the regenerated files
separately.

### 8. Verify completion

Run `git status` (clean) and `git log --oneline -5` to confirm the operation
completed, plus any driver post-completion checks.

## Bail-out

Stop and hand back with a summary — never `git rebase --abort` /
`git merge --abort` (or `gt abort`) without explicit confirmation — when:

- the verification gate fails repeatedly on the same resolution,
- the repository is in a state you cannot safely classify, or
- any driver-supplied bail-out condition triggers.

Summarize what was resolved, what remains, and the exact command/state you
stopped at so the user (or a fresh session) can resume.
