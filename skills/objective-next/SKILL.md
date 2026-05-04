---
name: objective-next
description: "Command: objective-next"
allowed-tools:
  - "Bash(git rev-parse *)"
  - "Bash(git rev-list *)"
  - "Bash(git log *)"
  - "Bash(git show *)"
  - "Bash(brmem get *)"
  - "Bash(brmem put *)"
  - "Bash(objective exec next-context *)"
  - "Bash(objective exec next-collision *)"
  - "Bash(objective exec update-precheck *)"
  - "Bash(objective exec claim-plan *)"
  - "Bash(objective exec claim-apply *)"
  - "Bash(objective exec absorb-patches *)"
  - "Read"
  - "Write"
  - "ExitPlanMode"
---

# objective-next

Prepare the current branch's objective snapshot when needed, then recommend
the next PR-sized slice.

> For shared concepts — vocabulary, storage model, content anatomy, lifecycle,
> carry-forward semantics, and mutation contracts — see
> `../objective/SKILL.md`. For conservative branch snapshot rewrites, follow
> `../objective-update/SKILL.md`.

## Goal

Given an objective slug — supplied directly or resolved from the current
branch's claimed objectives — ensure the current branch has a fresh snapshot,
load that prepared snapshot, summarize the objective state, and suggest a
collision-checked kebab-case slug for the next slice.

`next` may mutate only as preparation: it can delegate to the claim primitive
when the branch has no snapshot and to the update workflow when the snapshot
is stale. After preparation, the recommendation itself is a read of the
prepared current-branch snapshot. `next` never mutates canonical state,
creates branches, edits source code, or implements the slice.

## Inputs

- **Slug, optional.** Parse the objective slug from the prompt when present.
  Otherwise let `objective exec next-context` resolve from the current branch.
  Never infer a slug from the branch name; a branch commonly carries a parent
  objective whose slug differs from the branch's slice slug.

`next` plans against the current branch only. There is no `--from`,
`--from-file`, or `--branch <other>` flag — to inspect a different branch,
check it out first.

## Core Rules

- **Prepare before planning.** If the current branch has no snapshot, claim
  one first; if it has a stale snapshot, update it first; then rerun
  `next-context` and plan from the fresh context.
- **Claim remains the carry-forward primitive.** Missing snapshots are
  attached only by the `objective-claim` workflow. During `next`, delegate to
  `objective-claim [<slug>]` when the branch has no snapshot; do not
  hand-copy objective files or manually construct claim plan files.
- **Conservative updates only.** When preparation needs an update, follow
  `../objective-update/SKILL.md`: load only attached files, triage branch
  commits, rewrite conservatively, and advance `.absorbed.jsonl` only after
  the snapshot covers the current branch work.
- **Current-branch-only source.** Always load the snapshot claimed on the
  current branch. There is no source cascade and no ancestor walk during the
  planning read; source discovery happens only inside `claim-plan` when the
  branch is missing a snapshot.
- **CLI authority for collision checks.** Use `objective exec next-collision`
  to test a candidate slug. Do not reproduce branch- or canonical-collision
  logic with raw `git` or `brmem`.
- **Content-only planning.** Do not inspect repo source files to audit
  progress. Implementation evidence is folded back by the update workflow.
- **Collision-safe suggestion.** Check the suggested slice slug with
  `next-collision`. On collision, warn and ask for a human choice; do not
  auto-resolve.

## Workflow

### 1. Plan-mode approval (if active)

If the harness is in plan mode, exit plan mode before running this skill.
Unlike a pure read-only flow, this skill may write a current branch snapshot
as preparation, so do not run mutating steps inside plan mode without the
harness approval path.

### 2. Gather prepared context

Run the deterministic context helper and parse the JSON envelope:

```bash
objective exec next-context [<slug>] --format json
```

Handle the result. `next-context` and `update-precheck` may exit 2 for
preparation-control states. For `no_objective_on_branch` and
`slug_not_attached`, continue with the preparation path below — these are
expected workflow branches, not terminal failures. Other exit-2 errors are
terminal unless this workflow explicitly handles them.

- **Success with `data.freshness == "fresh"` or `null`**: the context is
  ready. Continue to Step 5.
- **Success with `data.freshness == "stale"`**: run the update preparation in
  Step 3 for `data.slug`, rerun `next-context <slug>`, then continue from the
  fresh context.
- **`error_type == "no_objective_on_branch"` off trunk**: run the update
  preparation in Step 3. It will implicitly claim when needed and prompt for
  selection if ambiguous. Rerun `next-context [<resolved-slug>]` and continue.
- **`error_type == "ambiguous_objective"`**: the current branch already
  carries multiple objectives. Ask which existing claimed objective to inspect,
  rerun `next-context <selected-slug>`, update if stale, then continue.
- **Other errors**: surface the message and stop. On trunk with no canonical
  objectives, tell the user to run `objective-create`. On trunk with multiple
  canonicals and no slug, ask the user to pass an explicit slug.

### 3. Prepare by claim/update when needed

Follow the `objective-update` workflow for the selected or requested slug.
The important orchestration shape is:

1. Run:

   ```bash
   objective exec update-precheck [<slug>] --format json
   ```

2. If the precheck reports `no_objective_on_branch` or `slug_not_attached`,
   delegate to the `objective-claim` workflow:

   ```text
   objective-claim [<slug>]
   ```

   Treat these errors as expected preparation control flow, not terminal
   failures. If `objective-claim` reports ambiguity (candidate slugs or
   tied source branches), list the alternatives, ask the user to choose,
   and rerun `objective-claim` with the selected slug (and
   `--from <branch>` when the ambiguity was over source branches). If it
   reports a real error, surface the message and stop. Do not manually
   construct claim plan files during `next`.

3. Rerun `update-precheck <resolved-slug>` after any claim.
4. If freshness is fresh, preparation is complete.
5. If freshness is stale, complete the normal conservative update flow from
   `../objective-update/SKILL.md`. When that workflow rewrites files,
   persist them through serial `brmem put` writes (one at a time per the
   serialization rule in `objective-update`), then run:

   ```bash
   objective exec absorb-patches <slug> --expected-head <data.branch_head_sha> --format json
   ```

### 4. Rerun context after preparation

After any claim or update, rerun:

```bash
objective exec next-context <resolved-slug> --format json
```

Use this fresh context for the status report and slice recommendation. If it
still reports stale, stop and explain that preparation did not converge.

### 5. Interpret the prepared content

Use the `body_content`, `roadmap_content`, `notes_content`, `files_present`,
`current_branch`, `trunk_branch`, `on_trunk`, and `freshness` fields from the
prepared context. Interpret them using this skill's content inventory and the
anatomy in `../objective/SKILL.md`.

Keep the status report tight enough to verify at a glance:

- source label / current branch and resolved slug
- content files present
- title and status from `body_content`
- progress state from `body_content`, `roadmap_content`, and `notes_content`
- first meaningful open work, especially unchecked roadmap items
- durable findings or notes presence, summarized in one line when useful
- description/goals summary only when it adds signal

If optional content is absent, say so briefly and fall back to the available
Markdown. Do not fetch missing files yourself.

### 6. Choose a candidate next-slice slug

Use semantic judgment over the prepared content:

- Prefer the first unchecked roadmap item that is still PR-sized.
- If priority is non-obvious, present 2-3 candidate slugs with one-line
  rationales and ask the user to choose.
- Generate the candidate slug yourself; the CLI does not supply it.

Slug rules:

- lowercase ASCII, hyphen-separated
- specific to the slice, not the whole objective
- no `.md` suffix
- usually 50 characters or fewer
- no redundant `objective-` prefix and no verbatim repeat of the parent slug

### 7. Check candidate slug collision

After choosing one candidate slug, call:

```bash
objective exec next-collision <candidate-slug> --format json
```

Report the returned collision state:

- `clear`: safe to use
- `branch_exists`: a local branch already uses the slug
- `canonical_exists`: a canonical objective already uses the slug
- warnings: include them verbatim or summarized without changing their meaning

On any collision or warning, ask for a human choice: pick another slug, append
a suffix, or proceed knowingly. Do not auto-resolve.

### 8. Final output

Return:

- whether preparation was needed (`none`, `claimed`, `updated`, or
  `claimed + updated`)
- source label / current branch and resolved objective slug
- concise status summary and open-work summary
- suggested next-slice slug and collision result
- next-step hint:

```text
To proceed: write a plan file using <suggested-slug>, create a branch for that
slice, then run objective-claim (or rerun objective-next on the unclaimed
branch and let it prepare before planning). After implementing the slice, run
objective-update <slug>; after the work lands, run objective-reconcile <slug>
on the trunk branch.
```

## Edge Cases And Anti-Patterns

- Detached `HEAD`: abort.
- Current branch is the trunk branch: `next-context` may read canonical state;
  skip branch freshness preparation because canonical rewrites go through
  `objective-reconcile`, not `objective-update`.
- Multiple slugs on the current branch: legitimate when two unrelated parent
  objectives are claimed on the same branch; list both and ask.
- Unclaimed non-trunk branch: delegate to `objective-claim`, then update if
  stale before recommending.
- Branch name does not equal slug. Never derive the slug from the branch name.
- Source has only the required content file: report that no optional progress
  surface exists; fall back to progress guidance, or ask if the next slug is
  ambiguous.
- Never manually create claim plan files during `objective-next`; delegate
  missing snapshot attachment to `objective-claim`.
- Never auto-pick a slug from a multi-slug current branch, auto-resolve a
  collision, inspect source code for drift, hand-copy a snapshot, walk
  ancestors outside `claim-plan`, write canonical state, create branches, or
  implement work during `next`.
