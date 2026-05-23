# `/land-stack` User-Facing Behavior Specification

This document specifies the observable behavior of the project-local Pi extension command
`/land-stack`. It is written so the behavior can be reimplemented from scratch without relying
on the current TypeScript structure.

The command lands the current Graphite stack path from the bottom branch through the current
branch, one pull request at a time.

## Goals and non-goals

### Goals

- Land the Graphite stack path from trunk up to the current branch.
- Merge each target PR one at a time with a head-SHA guard.
- Verify every GitHub merge before performing local Graphite cleanup.
- Keep descendant branches above the current branch open, restacked, and submitted when needed.
- Stop at the first unsafe or ambiguous state.
- Clearly show the planned mutations before landing.

### Non-goals

The command must not:

- merge descendants above the current branch;
- delete remote branches;
- run global `gt sync --delete-all`;
- wait for checks;
- enable auto-merge;
- continue after a meaningful failure.

## Command surface

Pi registers one slash command:

```text
/land-stack [--yes] [--dry-run] [--help]
```

Description shown by Pi:

```text
Land the current Graphite stack path bottom-to-current, one PR at a time
```

Supported options:

| Option      | Alias | Behavior                                                                                                          |
| ----------- | ----- | ----------------------------------------------------------------------------------------------------------------- |
| `--yes`     | `-y`  | Skips only the main landing-plan confirmation. Does not skip submit/update or managed-slot cleanup confirmations. |
| `--dry-run` | none  | Runs preflight, shows the plan, and exits before any mutation.                                                    |
| `--help`    | `-h`  | Shows usage text and exits before preflight.                                                                      |

Unknown arguments fail before preflight with:

```text
Unknown /land-stack argument: <arg>
```

Argument completion suggests these long options when they match the current token:

```text
--yes
--dry-run
--help
```

The command waits for Pi to become idle before doing any work, including help.

## Help output

`/land-stack --help` displays:

```text
Usage:
/land-stack [--yes] [--dry-run] [--help]

Lands the current Graphite stack path from bottom branch through the current branch, one PR at a time.
Requires a clean repo, non-draft open PRs, bottom PR based on gt trunk, and no manual worktree conflicts; can offer to run gt restack + submit/update for stale PR heads before merging.

Options:
  --yes, -y    Skip the main landing confirmation. PR submit/update and managed slot cleanup still require explicit UI confirmation.
  --dry-run    Show the plan and exit before mutating anything.
  --help, -h   Show this help.
```

In interactive Pi, this is shown as an info notification. In non-interactive modes it is written
to standard output.

## Dependencies and external commands

The behavior assumes the current Pi working directory is inside a Git repository using Graphite
and GitHub pull requests. The command interacts with these CLIs:

- `git`
- `gt`
- `gh`
- `slot` only when freeing managed slot worktrees

Commands are displayed using shell-style quoting where necessary. For example:

```text
gh pr view 'branch name' 'can'\''t'
```

## Stack discovery behavior

The command discovers:

1. repository root;
2. current Git branch;
3. Graphite trunk branch;
4. current Graphite stack.

It treats Graphite trunk as the required final merge base.

The current stack is interpreted from the current column in `gt log short --stack -r --no-interactive` output:

- `◉` marks the current branch.
- `◯` marks other stack branches.
- Only entries aligned in the same text column as the current marker are part of the landing path.
- Branch annotations beginning with `(` are ignored when reading branch names.
- The first aligned ancestor is treated as the stack root/trunk in the display.
- Aligned ancestors before the current branch, excluding trunk, plus the current branch are the branches to merge.
- Aligned descendants after the current branch are left open and may be restacked/submitted, but are not merged.

If no current marker is found, the command refuses to infer the stack.

If more than one current marker is found, the command proceeds using the first but includes this warning in the plan:

```text
multiple current markers found in gt log output
```

If aligned parsing ignores off-column branches, the plan includes:

```text
<n> branch(es) in gt log output sit outside the current branch's column and were not included in the stack walk
```

If the stack root shown by Graphite differs from `gt trunk`, the plan includes:

```text
gt log stack root is <root>, but gt trunk is <trunk>; <trunk> remains the required merge target
```

## Preflight requirements

The command refuses before mutation unless all applicable preflight checks pass.

### Repository and branch state

The command fails if:

- the working directory is not inside a Git repository;
- HEAD is detached;
- the current Git branch cannot be resolved;
- Graphite trunk cannot be resolved;
- the Graphite stack cannot be loaded;
- the Graphite current marker does not match Git's current branch;
- the current branch is trunk;
- the current branch has no PR path to land.

The current branch/trunk no-op failure is informational:

```text
Current branch is <branch>, which is trunk or has no PR path to land. Nothing to do.
```

### Clean working tree

The working tree must be clean according to `git status --porcelain=v1`.

If dirty:

```text
Working tree is dirty; refusing to start stack landing.
```

The command also refuses when Git has an in-progress operation:

```text
A merge is in progress; refusing to start stack landing.
A cherry-pick is in progress; refusing to start stack landing.
A revert is in progress; refusing to start stack landing.
A rebase is in progress; refusing to start stack landing.
```

### Local branches

Every landing branch and every descendant branch relevant to restacking must exist locally.

If missing:

```text
Local branch <branch> does not exist; refusing to start stack landing.
```

### Pull requests

Each landing branch must have a GitHub PR whose visible metadata satisfies:

- state is `OPEN`;
- PR is not a draft;
- PR head branch exactly equals the local branch;
- PR head SHA matches the local branch SHA, unless the command is still in the submit/update preflight phase;
- the bottom PR targets Graphite trunk, unless the command is still in the submit/update preflight phase.

Failures are explicit, for example:

```text
PR #<number> for <branch> is <state>, expected OPEN.
PR #<number> for <branch> is a draft; mark it ready before landing.
PR #<number> head branch is <actual>, expected <branch>.
PR #<number> head SHA does not match local branch SHA; run gt submit/update first.
Bottom PR #<number> targets <base>, expected <trunk>; restack/submit it first.
```

Immediately before each merge, the stricter gate is applied again. At that point a wrong base or
head SHA is a hard stop.

## Worktree conflict behavior

The command inspects Git worktrees for all landing and descendant branches.

The current branch checked out at the current repository root is allowed.

If a relevant branch is checked out in a non-slot worktree, the command refuses before mutation:

```text
Branch <branch> is checked out in non-slot worktree <path>; detach it manually and rerun.
```

For multiple manual conflicts:

```text
Relevant branches are checked out in non-slot worktrees; detach them manually and rerun:
- <branch> <path>
```

A managed slot worktree is a path containing `/.slots/repos/` and matching
`/worktrees/slot-<name>`. Managed slot conflicts do not immediately fail; they trigger the
managed-slot cleanup flow.

## Landing plan

After preflight and before mutation, the command formats a full plan.

Plan header:

```text
Land Graphite stack path: <trunk> -> <branch1> -> ... -> <current>

Current branch: <current>
Trunk branch: <trunk>
```

Merge list:

```text
Will merge, in order:
  1. #<pr-number> <branch> <short-sha> <title>
  2. #<pr-number> <current> <short-sha> <title> Current branch
```

Branches above current:

```text
Will leave open/restack but not merge:
  - <descendant>
```

or:

```text
No descendant PRs above the current branch will be merged.
```

Warnings section, when present:

```text
Warnings:
  - <warning>
```

Submit/update section when no pre-merge update is required:

```text
No pre-merge PR submit/update is required.
```

Submit/update section when PR metadata is stale:

```text
Before merging, this command will ask before running gt submit/update because GitHub PR metadata is behind local refs:
  - #<pr-number> <branch>: <reason>; <reason>
  Command: gt submit --branch <current> --no-stack --update-only --no-edit --no-ai --no-interactive
```

Submit/update section when restack is also required:

```text
Before merging, this command will ask before running gt restack + submit/update because local branch reachability shows restack is required and GitHub PR metadata is behind local refs:
  Restack: <branch> on <parent>
  - #<pr-number> <branch>: <reason>; <reason>
  Command: gt restack --branch <branch> --upstack --no-interactive
  Command: gt submit --branch <current> --no-stack --update-only --no-edit --no-ai --no-interactive
```

Managed slot section when no cleanup is required:

```text
No managed slot cleanup is required before merging.
```

Managed slot section when cleanup is required:

```text
Before merging, this command will ask before running slot gt free-stack because these stack branches are checked out in managed slots:
  - <slot-name> <branch> <path>
```

Every plan ends with:

```text
For each merged PR:
  - gh pr merge <number> --squash --match-head-commit <sha>
  - verify PR is MERGED on <trunk>
  - if another branch remains, gt get <next-branch> --downstack --no-restack --no-checkout --force --no-interactive
  - gt delete <landed-branch> -f -q
  - restack/submit the next branch only, if one remains

Will not merge descendants above current, will not delete remote branches, will not run global gt sync --delete-all, will not wait for checks or enable auto-merge, and will stop on first failure.
```

## Main confirmation

Unless `--yes` is supplied, the user must confirm the plan before mutation.

Dialog title:

```text
Land this stack path?
```

Dialog body: the full landing plan.

If the user declines:

```text
Cancelled before merge; no PRs were landed.
```

In non-interactive mode, omitting `--yes` refuses before mutation:

```text
Refusing to land a stack without confirmation in non-interactive mode. Re-run with --yes.
```

followed by the plan.

## Dry-run behavior

With `--dry-run`, the command performs preflight and formats the plan, then exits before any
mutation.

It reports:

```text
Dry run only; no PRs or local refs were changed.
```

followed by the full plan.

No PRs are merged, no local refs are deleted, no restack/submit is run, and no managed slots are
freed.

## Stale PR metadata flow

If any PR's GitHub metadata is stale relative to local Graphite refs, the command asks for explicit
permission before running submit/update, even when `--yes` was supplied.

Staleness reasons include:

```text
head <pr-short-sha> != local <local-short-sha>
base <actual-base> != <expected-base>
```

If restack is not needed, the dialog title is:

```text
Run gt submit/update?
```

If restack is needed, the dialog title is:

```text
Run gt restack + submit/update?
```

The dialog body lists affected PRs and exact commands. If restack is needed, it starts with:

```text
Local branch reachability shows this stack needs restack before submit/update, and GitHub PR metadata is behind local refs. Run restack then submit/update before merging?
```

Otherwise it starts with:

```text
GitHub PR metadata is behind local Graphite refs. Run Graphite submit/update before merging?
```

If the user declines:

```text
Cancelled before merge; no PRs were landed.
```

In non-interactive mode, the command refuses rather than running submit/update:

```text
GitHub PR metadata is behind local Graphite refs, but this context cannot ask for the required <submit/update-or-restack+submit/update> confirmation.
```

If confirmed, the command may run:

```text
gt restack --branch <restack-target> --upstack --no-interactive
gt submit --branch <current> --no-stack --update-only --no-edit --no-ai --no-interactive
```

Then it re-runs preflight. If stale metadata remains after submit/update:

```text
gt submit/update completed, but GitHub PR metadata still differs from local Graphite refs.
No PRs were landed.
```

Suggested next action:

```text
Run gt submit --branch <current> --no-stack --update-only --no-edit --no-ai --no-interactive manually, inspect PR heads, and rerun /land-stack.
```

## Managed slot cleanup flow

If relevant branches are checked out in managed slot worktrees, the command asks for explicit
permission before freeing slots, even when `--yes` was supplied.

Dialog title:

```text
Run slot gt free-stack?
```

Dialog body:

```text
Run slot gt free-stack? This detaches/frees managed slots for stack branches.

- <slot-name> <branch> <path>
```

If the user declines:

```text
Cancelled before merge; no PRs were landed.
```

In non-interactive mode, the command refuses rather than freeing slots:

```text
Managed slot worktrees block stack restack/ref updates, but this context cannot ask for the required slot cleanup confirmation.
```

If confirmed, the command runs:

```text
slot gt free-stack
```

Then it rechecks repo cleanliness and worktree conflicts. If conflicts remain:

```text
slot gt free-stack completed, but relevant branches are still checked out in other worktrees.
- <branch> <path> (<kind>)
No PRs were landed.
```

## Merge loop

For each landing branch from bottom to current, the command performs this sequence.

### 1. Reload and gate

Immediately before merging a branch, reload:

- local branch SHA;
- GitHub PR metadata.

The strict merge gate requires:

- PR state is `OPEN`;
- PR is not draft;
- PR head branch equals the local branch;
- PR head SHA equals the local branch SHA;
- PR base equals Graphite trunk.

If the PR base is wrong at this stage, the command fails with:

```text
PR #<number> targets <base>, expected <trunk>; restack/submit it first.
```

Suggested next action:

```text
Run gt restack/submit for <branch>, then rerun /land-stack.
```

### 2. Merge

The command runs:

```text
gh pr merge <number> --squash --match-head-commit <head-sha>
```

If GitHub rejects the merge, the command stops immediately before local cleanup:

```text
Merge rejected; stopping stack landing immediately.
```

Suggested next action:

```text
Inspect PR #<number>, resolve the merge rejection, then rerun /land-stack from the desired branch.
```

### 3. Verify GitHub state

After `gh pr merge` exits successfully, the command reloads the PR by number and verifies:

- PR state is `MERGED`;
- `mergedAt` is present;
- PR base is trunk;
- PR head branch is the branch that was just merged.

If verification cannot load the PR:

```text
gh pr merge exited 0, but verification could not load PR #<number>; local Graphite cleanup skipped.
```

If verification loads the PR but it is not correct:

```text
gh pr merge exited 0 but PR did not verify as MERGED; local Graphite cleanup skipped.
```

Suggested next action:

```text
Inspect PR #<number> on GitHub before deleting or restacking local Graphite branches.
```

### 4. Refresh next branch when needed

If another branch remains to process or preserve, the command refreshes through that branch:

```text
gt get <next-branch> --downstack --no-restack --no-checkout --force --no-interactive
```

The next branch is:

- the next landing branch, if one remains; otherwise
- the first descendant branch above current, if one exists.

If this refresh fails after a PR has merged:

```text
PR #<number> merged, but targeted Graphite refresh failed.
```

Suggested next action:

```text
Run gt get <next-branch> --downstack --no-restack --no-checkout --force --no-interactive manually, inspect the stack, and rerun /land-stack if appropriate.
```

### 5. Delete local Graphite branch

The command deletes the landed local Graphite branch:

```text
gt delete <landed-branch> -f -q
```

If deletion fails because Graphite reports the branch is already absent, the command treats it as
success and streams:

```text
✓ $ gt delete <branch> -f -q — branch <branch> already absent
```

If this is the final target branch and deletion fails because the branch is checked out elsewhere,
the command treats the landing as successful and streams:

```text
✓ $ gt delete <branch> -f -q — branch <branch> still checked out; clean up manually with gt sync or direct branch deletion
```

If this is the final target branch and deletion fails for another reason, the command completes with
a warning rather than failing, because all target PRs were already merged.

Warning message:

```text
All target PRs were merged, but deleting the local Graphite branch <branch> failed.
```

Suggested next action:

```text
Delete or repair local Graphite branch <branch> manually, then inspect the stack.
```

If deletion fails before more landing work remains, the command stops:

```text
PR #<number> merged, but deleting the local Graphite branch <branch> failed.
```

Suggested next action:

```text
Delete or repair local Graphite branch <branch> manually, then inspect the stack before rerunning /land-stack.
```

### 6. Restack and submit next branch

If another branch remains to process or preserve, the command runs:

```text
gt restack --branch <next-branch> --upstack --no-interactive
gt submit --branch <next-branch> --no-stack --update-only --no-edit --no-ai --no-interactive
```

If restack fails before another target merge remains:

```text
Restack failed after merging #<previous-pr>; stopping before merging <branch>.
```

If restack fails only for a descendant branch after all target PRs have merged:

```text
Restack failed after merging #<previous-pr>; descendant branch <branch> was left for manual restack/update.
```

Suggested next action:

```text
Resolve restack failures for <branch>, run gt submit/update, then rerun /land-stack if appropriate.
```

If submit/update fails before another target merge remains:

```text
Submit/update failed after merging #<previous-pr>; stopping before merging <branch>.
```

If submit/update fails only for a descendant branch after all target PRs have merged:

```text
Submit/update failed after merging #<previous-pr>; descendant branch <branch> was left for manual PR update.
```

Suggested next action:

```text
Update PR for <branch> manually, verify it targets <trunk>, then rerun /land-stack if appropriate.
```

## Success summary

On success, the command shows a final summary and appends it to the command stream.

Base format:

```text
Landed <n> PR(s): #<number> <branch>, #<number> <branch>.
```

If descendants remain:

```text
Left open/restacked: <branch>, <branch>.
```

Always included:

```text
Remote branches were not deleted.
Clean up any remaining local branches manually, for example by running `gt sync` or deleting branches directly.
```

If there are no warnings, the interactive notification level is `success`.

If there are warnings, the notification level is `warning` and the summary includes:

```text
Completed with <n> warning(s):
- <warning message>
  <command details if available>
  Suggested next action: <action>
```

## Failure presentation

Failures are reported both as a final command-stream message and as a notification or console
message.

A simple pre-mutation failure can be shown directly, for example:

```text
Working tree is dirty; refusing to start stack landing.
```

Failures with additional context use this full structure:

```text
land-stack stopped.

Already landed:
  - #<number> <branch>

Failed at: #<number> <branch>

<failure message>

<command details if available>

Suggested next action: <action>
```

`Already landed` appears only when at least one PR was successfully verified as merged.

`Failed at` appears only when a failed PR or branch is known.

Interactive failure notifications are shortened:

```text
land-stack stopped at #<number> <branch>: <first failure line>
```

or:

```text
land-stack stopped: <first failure line>
```

Informational cancellations show only the first failure line, for example:

```text
Cancelled before merge; no PRs were landed.
```

Unexpected exceptions are reported as:

```text
land-stack failed unexpectedly: <message>
```

The status line is cleared on every success, cancellation, or failure path.

## Command detail formatting

When command details are included in a failure or warning, they have this shape:

```text
$ <command>        # omitted if no command display is known
exit <code>        # followed by " (killed or timed out)" when applicable
----- stdout tail -----
<stdout tail or (empty)>
----- stderr tail -----
<stderr tail or (empty)>
```

Stdout/stderr tails are terminal-escape-stripped, carriage returns are normalized to newlines, and
only a bounded tail is shown. If earlier lines were omitted, the tail begins with:

```text
… <n> earlier line(s) omitted
```

## Non-interactive output behavior

When no UI is available:

- success, dry-run, help, and informational output go to standard output;
- error-level failures go to standard error;
- confirmation-dependent flows refuse rather than assuming yes.

`--yes` is sufficient only for the main landing confirmation. It is not sufficient for stale PR
metadata updates or managed slot cleanup in non-interactive mode.

## Terminal hyperlink behavior

The final success notification and final command-stream summary linkify landed PR references when
valid PR URLs are available.

Only `http:` and `https:` URLs without control characters are linkified. Link text remains the PR
reference, for example:

```text
#101
```
