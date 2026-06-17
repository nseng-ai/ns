---
name: ccc-branch-triage
description: Use when the user wants to triage outstanding Graphite/GitHub branches or stacks for landing, retirement, restacking, or deferral with cmux workspace awareness; detect branches open in cmux by workspace cwd + Git branch; preserve the root checkout and prompt the user to switch to a slot for mutations.
---

# ccc-branch-triage

Process outstanding Graphite/GitHub branches one at a time for landing, retirement/freeing/deletion, restacking, or deferral. The distinguishing safety gate is cmux occupancy: before recommending or mutating, join each cmux workspace's current directory to the Git branch checked out there. Workspace titles and descriptions are advisory only.

## Safety contract

- Inventory, classification, and option presentation are read-only.
- Never change the root repository checkout's branch. Read-only inventory may run from root, but branch-changing mutations from root are refused.
- Before any mutation, refresh PR, Graphite, Git, slot/worktree, and cmux facts.
- Ask for explicit user confirmation before every mutation.
- If this session is in the root checkout and a mutation would require branch-specific state, stop and tell the user which slot/worktree to switch to, then rerun this workflow there. If no suitable slot exists, report that a slot/worktree is needed; do not allocate one automatically in v1.
- Dirty or active cmux workspaces are `Do not touch automatically` unless the user explicitly chooses to inspect from that workspace.
- Dirty detached workspaces are high risk; never free, delete, overwrite, or retarget them automatically.
- Do not parse `gt ls`, `gt log`, or other human-facing Graphite display output for machine topology. Use plumbing/structured sources where possible; use display commands only as human visual confirmation.

## Read-only inventory procedure

Collect facts in this order:

1. Current workspace state:

   ```bash
   git status --short --branch
   ```

2. GitHub PR facts with JSON fields such as `number`, `title`, `headRefName`, `baseRefName`, `state`, `isDraft`, `mergeStateStatus`, `reviewDecision`, `statusCheckRollup`, `url`, and `updatedAt`:

   ```bash
   gh pr list --json number,title,headRefName,baseRefName,state,isDraft,mergeStateStatus,reviewDecision,statusCheckRollup,url,updatedAt
   gh pr view <branch-or-pr> --json number,title,headRefName,baseRefName,state,isDraft,mergeStateStatus,reviewDecision,statusCheckRollup,url,updatedAt
   ```

3. Git worktree and cleanliness facts:

   ```bash
   git worktree list --porcelain
   git -C <cwd> status --porcelain
   ```

4. cmux facts, joined by workspace cwd plus Git branch. First collect cmux surface/workspace facts:

   ```bash
   cmux tree --all --json
   cmux workspace list --window <window-ref> --json
   ```

   For every workspace cwd that exists, inspect Git state there:

   ```bash
   git -C <cwd> symbolic-ref --short HEAD
   git -C <cwd> status --porcelain
   ```

   If `symbolic-ref` fails, render detached HEAD as `DETACHED@<sha>`:

   ```bash
   git -C <cwd> rev-parse --short HEAD
   ```

   Join cmux workspace facts to branch facts by `(cwd, checked_out_branch_or_detached_sha)`. Treat titles/descriptions as labels that may drift, not as identity.

5. Graphite parent/child/topology facts from plumbing or structured commands when available:

   ```bash
   gt --cwd <worktree> parent --no-interactive
   gt --cwd <worktree> children --no-interactive
   asdl slot gt exec stack-branches --format json
   ```

   Run structured stack inventory from a relevant non-trunk worktree when useful. Use `gt ls` only as a human visual cross-check.

## cmux badges

Use compact, stable badges in branch rows:

- `open` plus workspace refs when a branch is open in cmux.
- `active` when the cmux active workspace is on that branch.
- `caller` when this Pi/caller workspace is on that branch.
- `DIRTY` when `git status --porcelain` in the workspace cwd is non-empty.
- `dup` when multiple workspaces point at the same `(cwd, branch)` pair.
- `↯label` when workspace title/description appears stale relative to the checked-out branch.
- `DETACHED@<sha>` for detached workspaces; dirty detached workspaces are high risk.

## Classification model

Classify branches by safety/actionability, not just stack topology. For each branch row include: branch name, PR number/state, merge status/check summary, base/parent or parent-stack blocker, slot/worktree if any, cmux workspace refs/badges, and suggested next action.

### Ready to process now

These branches are clean, have no open cmux workspace, are not blocked by obvious parent/stack state, and are candidates for the next landing/restack/retirement decision.

### Open in cmux — ask before touching

These branches appear clean enough for consideration, but a cmux workspace is open. Ask the user before touching and prefer switching to that workspace for inspection or mutation.

### Needs inspection before choosing an action

These branches have unknown or unstable merge state, parent stack unresolved, local ahead/behind, unclear Graphite state, or missing evidence. Inspect before recommending landing, restacking, or retirement.

### Already merged / retire candidates

These merged or closed PR branches/local slots may be freed or deleted only after confirmation and safety checks prove there is no dirty/open cmux workspace at risk.

### Do not touch automatically

These are active, dirty, dirty detached, duplicate-active, or otherwise high-risk workspaces. Do not free/delete/overwrite them automatically.

## Mutation procedures

Mutations are supervised. Always perform the final freshness check first, present the exact action and risk, then ask for explicit confirmation.

### Landing

1. Refresh PR, Graphite, Git, slot/worktree, and cmux facts.
2. If current cwd is the root checkout and landing requires branch-specific checkout/state, refuse and use the root rerun prompt below.
3. In a suitable slot/worktree for the branch, dry-run first:

   ```bash
   gt merge --dry-run --no-interactive
   ```

4. Confirm the dry-run merges only intended PRs.
5. Ask for explicit confirmation.
6. Run:

   ```bash
   gt merge --no-interactive
   ```

7. Poll GitHub until the PR reflects the outcome, or report pending/failed state:

   ```bash
   gh pr view <number> --json state,mergedAt,mergeStateStatus
   ```

8. Update local trunk only from a safe workspace. From root, `git pull --ff-only` is allowed only when it does not change branches and the worktree is clean; otherwise instruct the user.

### Retirement / free / delete

- Only consider merged, closed, or explicitly superseded branches.
- Confirm no dirty/open cmux workspace is associated with the branch.
- If a slot is assigned, prefer dry-run first:

  ```bash
  uv run asdl slot free --branch <branch> --dry-run
  ```

  Then ask for confirmation and, if safe, run:

  ```bash
  uv run asdl slot free --branch <branch> --yes
  ```

- For Graphite branch deletion, inspect first and state exactly what will be deleted. Use only after confirmation and only when the branch is not checked out in active/dirty cmux workspaces:

  ```bash
  gt delete <branch> -f -q
  ```

- Never close GitHub PRs automatically in v1 unless the user explicitly asks and PR state has been refreshed.

### Restack

- Restack is in scope as a supervised action, but route complex or conflicting restacks to `code-gt-restack-resolve` or `code-resolve-merge-conflicts` rather than duplicating conflict procedure here.
- From root, refuse branch-changing restack work and prompt the user to switch to the target slot/worktree and rerun.
- Require a clean worktree before restacking.
- Prefer dry-run/planning when available. If no dry-run exists, present the exact branch/stack, affected workspaces, and risk before asking confirmation.

## Root rerun prompt

Use this shape when the appropriate action would mutate branch-specific state from the root checkout:

```text
This action would require changing branch state, and this session is running in the root checkout.
I will not change the root workspace checkout.
Switch to the branch's slot/worktree and rerun this workflow:

  cd <slot-worktree>
  # rerun your branch-triage command/request here

Target branch: <branch>
Suggested worktree: <path>
Reason: <landing/restack/retire requires branch-specific mutation>
```

## Future CLI push-down

If this workflow proves stable, move the mechanical inventory into a hidden `ccc exec` command. Candidate command names: `ccc exec branch-triage` or `ccc exec branch-inventory`. It should return JSON for PR facts, Graphite facts, git worktree/slot facts, cmux workspace facts, and joined branch classifications.

Do not implement deterministic CLI support in v1; this skill remains the procedural source of truth for now.
