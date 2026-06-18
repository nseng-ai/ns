---
name: code-just-the-stack
description: "Run `just` across the current Graphite stack from bottom to top, fixing failures with separate commits, restacking as you go, and submitting when green. Use when the user says just-the-stack, run just across this stack, make every branch pass just, or stack branches are failing tests."
allowed-tools:
  - "Bash(git status*)"
  - "Bash(git branch*)"
  - "Bash(gt *)"
  - "Bash(just *)"
  - "Bash(sdl cp*)"
  - "Bash(slot *)"
  - Read
  - Edit
  - Write
  - Grep
  - Glob
---

# code-just-the-stack

Run the user-facing `just-the-stack` workflow: validate the current Graphite stack path from bottom to top with `just`, fix failures on the branch where they occur, create separate checkpoint-style fix commits, restack descendants as needed, and submit the stack once every branch is green.

Invocation authorizes validating, fixing, restacking, and `gt submit --no-interactive` for the current stack. It does **not** authorize guessing across sibling stacks, carrying a dirty worktree, weakening checks, or freeing other occupied slots without confirmation.

## Related skills

- Use `graphite` for the Graphite navigation mental model.
- For `just` failures, follow the `code-just-fix` posture: fix the root cause honestly, use formatter/autofix recipes for mechanical lint/format failures, and never skip, weaken, or suppress tests/diagnostics.
- For conflict-heavy or ambiguous restacks, use `code-gt-restack-resolve` or `code-resolve-merge-conflicts`; do not invent conflict policy here.
- For separate fix commits, use `sdl cp`; do not hand-roll checkpoint commits or amend/squash unless the user explicitly asks for a different commit mode.

## Workflow

1. **Preflight**
   - Run `git status --short`. If it is non-empty, stop and ask the user to clean, stash, or checkpoint first.
   - Record the starting branch with `git branch --show-current` for the final report.
   - Confirm Graphite tracking with plumbing such as `gt parent --no-interactive`, or by attempting `gt bottom`. If Graphite reports the branch is untracked or parentage is unknown, stop and ask the user to track or switch branches; do not run `gt track` for them.

2. **Enter the bottom of this stack path**
   - Run `gt bottom` to switch to the branch closest to trunk in the current Graphite stack path.
   - The branch set is the path reached by repeated `gt up` from this bottom branch through the Graphite top, inclusive. Do not validate sibling stacks merely because they appear in `gt ls`.

3. **Validate each branch bottom-to-top**
   - Record the current branch with `git branch --show-current`.
   - Run `just`.
   - If `just` passes, record that branch as passed.
   - If `just` fails, inspect the failure, edit the root cause, and rerun `just`. Stop if the same gate fails twice after reasonable local fixes, or if the fix requires a product/design choice.
   - When a branch required edits and now passes, run `sdl cp` on that same branch to create a separate checkpoint-style fix commit. Capture the printed commit summary. If `sdl cp` refuses because the worktree is clean, record that no commit was needed; for any other refusal, stop and report stdout/stderr.

4. **Restack after every fix commit**
   - After a fix commit, run `gt restack --no-interactive`. If this installed Graphite rejects `--no-interactive` for `gt restack`, retry once as `gt restack`; stop if Graphite opens or requires an interactive prompt.
   - If restack fails because an in-scope branch is checked out in another slot, ask before running `slot gt free-stack`. Only retry restack after the user authorizes slot freeing.
   - If restack enters a conflict/rebase state, use `code-gt-restack-resolve` from the current state.
   - After restack, verify `git status --short` is clean before continuing.

5. **Move upward**
   - Run `gt up --no-interactive`. If this installed Graphite rejects `--no-interactive` for `gt up`, retry once as `gt up`; stop if Graphite opens or requires an interactive branch-choice prompt.
   - If Graphite reports that you are already at the top of the stack, the loop is complete.
   - If Graphite reports ambiguous children or prompts for a choice, stop and ask the user; do not guess a sibling branch.

6. **Submit only after every branch is green**
   - After the top branch has passed, run `gt submit --no-interactive`.
   - If submit fails because of remote divergence, branch protection, missing metadata, or a Graphite safety refusal, stop and report the exact command/output. Do not force-push, bypass checks, or change submit mode unless the user explicitly instructs you.

## Final report

Report a branch-by-branch table or bullets with:

- status for each branch: `passed`, `fixed`, `committed`, `restacked`, or `blocked`;
- any `sdl cp` commit summaries;
- the `gt submit --no-interactive` result and any PR updates Graphite reports;
- the current branch at the end;
- unresolved blockers or user decisions needed.
