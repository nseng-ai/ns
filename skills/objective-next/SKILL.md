---
name: objective-next
description: "Command: objective-next"
allowed-tools:
  - "Bash(objective exec next-context *)"
  - "Bash(objective exec next-collision *)"
  - "Read"
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
load that prepared snapshot, summarize the objective state, and recommend the
next roadmap slice using its visible preassigned slice slug.

`next` may mutate only as preparation: it can delegate to the claim primitive
when the branch has no snapshot and to the update workflow when the snapshot
is stale. After preparation, the recommendation itself is a read of the
prepared current-branch snapshot. `next` never mutates canonical state,
creates branches, edits source code, or implements the slice.

## Inputs

- **Slug, optional.** Parse the objective slug from the prompt when present.
  Otherwise let `objective exec next-context` resolve from the current branch.
  Never infer an objective slug from the branch name; a branch commonly
  carries a parent objective whose slug differs from the branch's slice slug.

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
  planning read; source discovery happens only inside `objective-claim` when
  the branch is missing a snapshot.
- **Use preassigned roadmap slice slugs.** Read `data.roadmap_content`
  semantically. Every PR-sized roadmap section heading should contain one
  visible marker shaped ``(slice: `<slug>`)``. Use that marker for the selected
  slice. Do not generate a fallback slug, and do not treat child checklist
  items as independently sluggable slices.
- **CLI authority for collision checks.** Use `objective exec next-collision`
  to test the selected slice slug. Do not reproduce branch- or canonical-
  collision logic with raw `git` or `brmem`.
- **Content-only planning.** Do not inspect repo source files to audit
  progress. Implementation evidence is folded back by the update workflow.
- **Collision-safe suggestion.** Check the selected slice slug with
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

Handle the result. `next-context` may exit 2 for preparation-control states.
For `no_objective_on_branch` off trunk, continue with the preparation path
below; this is an expected workflow branch, not a terminal failure. Other
exit-2 errors are terminal unless this workflow explicitly handles them.

- **Success with `data.freshness == "fresh"` or `null`**: the context is
  ready. Continue to Step 5.
- **Success with `data.freshness == "stale"`**: run the update preparation in
  Step 3 for `data.slug`, rerun `next-context <slug>`, then continue from the
  fresh context.
- **`error_type == "no_objective_on_branch"` off trunk**: run the preparation
  flow in Step 3. It will claim when needed and prompt for selection if
  ambiguous. Rerun `next-context [<resolved-slug>]` and continue.
- **`error_type == "ambiguous_objective"`**: the current branch already
  carries multiple objectives. Ask which existing claimed objective to inspect,
  rerun `next-context <selected-slug>`, update if stale, then continue.
- **Other errors**: surface the message and stop. On trunk with no canonical
  objectives, tell the user to run `objective-create`. On trunk with multiple
  canonicals and no slug, ask the user to pass an explicit slug.

### 3. Prepare by claim/update when needed

If Step 2 showed that preparation is needed, delegate to the existing
operation workflows rather than reproducing their internals here:

- For a missing snapshot, follow `../objective-claim/SKILL.md` to attach the
  objective to the current branch. If claim reports candidate-slug or source-
  branch ambiguity, list the alternatives, ask the user to choose, and rerun
  claim with the selected values.
- For a stale snapshot, follow `../objective-update/SKILL.md` for the resolved
  slug. That workflow owns update precheck, conservative rewrites, serialized
  `brmem put` writes, and absorbed-marker advancement.

If either delegated workflow reports a terminal error, surface it and stop. Do
not manually construct claim plan files, inspect raw source files for progress,
or run lower-level update commands from this skill.

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
- first incomplete roadmap slice section and its visible slice marker
- durable findings or notes presence, summarized in one line when useful
- description/goals summary only when it adds signal

If optional content is absent, say so briefly and fall back to the available
Markdown. Do not fetch missing files yourself.

### 6. Select the preassigned roadmap slice slug

Use semantic judgment over the prepared roadmap content:

- Prefer the first incomplete roadmap slice section that is still PR-sized.
  A section is incomplete when it has unchecked implementation tasks or prose
  that clearly describes remaining codified work.
- Extract the selected section's visible heading marker shaped
  ``(slice: `<slug>`)``. The selected slug is the next-slice slug.
- Treat child checklist items as tasks within the slice; they do not get their
  own slice slugs.
- If priority is non-obvious, present 2-3 candidate sections with their
  existing marker slugs and one-line rationales, then ask the user to choose.
  Do not invent a new slug while presenting alternatives.

Prompt-level slug sanity rules:

- lowercase ASCII letters, digits, and hyphens only
- no slash
- no `.md` suffix
- no leading `objective-`
- no consecutive hyphens
- usually 50 characters or fewer

If the selected next section has no marker, multiple markers, an obviously
invalid marker, or only child-task markers, ask the user to repair the
roadmap or clarify the intended slug. Do not generate a fallback slug from the
heading text.

### 7. Check selected slug collision

After selecting one visible slice slug, call:

```bash
objective exec next-collision <candidate-slug> --format json
```

Here `<candidate-slug>` is the preassigned marker slug from the roadmap
section, not a freshly generated name. Report the returned collision state:

- `clear`: safe to use
- `branch_exists`: a local branch already uses the slug
- `canonical_exists`: a canonical objective already uses the slug
- warnings: include them verbatim or summarized without changing their meaning

On any collision or warning, ask for a human choice: repair the roadmap marker,
pick a different existing section, rename the would-be branch, append a suffix,
or proceed knowingly. Do not auto-resolve.

### 8. Final output

Return:

- whether preparation was needed (`none`, `claimed`, `updated`, or
  `claimed + updated`)
- source label / current branch and resolved objective slug
- concise status summary and open-work summary
- selected roadmap section and preassigned next-slice slug
- collision result from `objective exec next-collision`
- next-step hint:

```text
To proceed: write a plan for <selected-slice-slug>, then use the repo's
normal branch workflow to create the slice branch from that slug. On the new
branch, run objective-claim (or rerun objective-next on the unclaimed branch
and let it prepare before planning). After implementing the slice, run
objective-update <objective-slug>; after the work lands, run
objective-reconcile <objective-slug> on the trunk branch.
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
- Branch name does not equal objective slug or slice slug. Never derive either
  slug from the branch name.
- Source has only the required content file: report that no roadmap progress
  surface exists and ask for a roadmap slice marker or explicit human choice;
  do not invent a next-slice slug.
- Roadmap section lacks a visible slice marker, has more than one marker, or
  has an obviously invalid marker: ask for repair/clarification.
- Never manually create claim plan files during `objective-next`; delegate
  missing snapshot attachment to `objective-claim`.
- Never auto-pick a slug from a multi-slug current branch, auto-resolve a
  collision, invent a fallback next-slice slug, inspect source code for drift,
  hand-copy a snapshot, walk ancestors outside the claim primitive, write
  canonical state, create branches, or implement work during `next`.
