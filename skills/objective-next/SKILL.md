---
name: objective-next
description: "Command: objective-next"
allowed-tools:
  - "Bash(objective exec next-context *)"
  - "Bash(objective exec next-collision *)"
  - "Bash(objective exec attach *)"
  - "Read"
  - "ExitPlanMode"
---

# objective-next

Prepare the current branch's objective snapshot when needed, then recommend the
next numbered roadmap entry and implementation shape.

> For shared concepts — vocabulary, storage model, content anatomy, lifecycle,
> carry-forward semantics, and mutation contracts — see
> `../objective/SKILL.md`. For conservative branch snapshot rewrites, follow
> `../objective-update/SKILL.md`.

## Goal

Given an objective slug — supplied directly or resolved from the current
branch's attached objectives — ensure the current branch has an up-to-date
snapshot, load that prepared snapshot, summarize the objective state, and
recommend the next numbered roadmap entry. Decide on demand whether that entry
should be implemented as one PR, a short stack, docs-only work, or should be
split before implementation.

`next` may mutate only as preparation: it can delegate to the attach primitive
when the branch has no snapshot and to the update workflow when the snapshot is
stale. After preparation, the recommendation itself is a read of the prepared
current-branch snapshot. `next` never mutates canonical state, creates branches,
edits source code, or implements the work.

## Inputs

- **Slug, optional.** Parse the objective slug from the prompt when present.
  Otherwise let `objective exec next-context` resolve from the current branch.
  Never infer an objective slug from the branch name.

`next` plans against the current branch only. There is no `--from`,
`--from-file`, or `--branch <other>` flag — to inspect a different branch,
check it out first.

## Core Rules

- **Prepare before planning.** If the current branch has no snapshot, attach
  one first; if it has a stale snapshot, update it first; then rerun
  `next-context` and plan from the up-to-date context.
- **Attachment remains the carry-forward primitive.** Missing snapshots are
  attached only by the `objective-attach` workflow. During `next`, delegate to
  `objective-attach [<slug>]` when the branch has no snapshot; do not hand-copy
  objective files or manually construct attach plan files.
- **Conservative updates only.** When preparation needs an update, follow
  `../objective-update/SKILL.md`: load only attached files, triage branch
  commits, rewrite conservatively, and advance `.absorbed.jsonl` only after the
  snapshot covers the current branch work.
- **Use numbered roadmap entries.** Read `data.roadmap_content` semantically.
  Pick the first unfinished numbered entry unless priority is clearly different
  or the user names an entry. Do not require or invent roadmap branch-slug
  labels.
- **Recommend shape on demand.** For the selected entry, recommend one of:
  single PR, short stack, docs-only change, split first, or ask the user when
  the shape is genuinely ambiguous.
- **Collision-safe branch hints.** If you suggest a branch slug, check it with
  `objective exec next-collision`. On collision, warn and ask for a human
  choice; do not auto-resolve.
- **Content-only planning.** Do not inspect repo source files to audit progress.
  Implementation evidence is folded back by the update workflow.

## Workflow

### 1. Plan-mode approval (if active)

If the harness is in plan mode, exit plan mode before running this skill.
Unlike a pure read-only flow, this skill may write a current branch snapshot as
preparation, so do not run mutating steps inside plan mode without the harness
approval path.

### 2. Gather prepared context

Run the deterministic context helper and parse the JSON envelope:

```bash
objective exec next-context [<slug>] --format json
```

Handle the result. `next-context` may exit 2 for preparation-control states.
For `no_objective_on_branch` off trunk, continue with the preparation path
below; this is an expected workflow branch, not a terminal failure. Other
exit-2 errors are terminal unless this workflow explicitly handles them.

- **Success with `data.snapshot_state == "up-to-date"` or `null`**: the context
  is ready. Continue to Step 5.
- **Success with `data.snapshot_state == "stale"`**: run the update preparation
  in Step 3 for `data.slug`, rerun `next-context <slug>`, then continue from the
  up-to-date context.
- **`error_type == "no_objective_on_branch"` off trunk**: run the preparation
  flow in Step 3. It will attach when needed and prompt for selection if
  ambiguous. Rerun `next-context [<resolved-slug>]` and continue.
- **`error_type == "ambiguous_objective"`**: the current branch already carries
  multiple objectives. Ask which existing attached objective to inspect, rerun
  `next-context <selected-slug>`, update if stale, then continue.
- **Other errors**: surface the message and stop. On trunk with no canonical
  objectives, tell the user to run `objective-create`. On trunk with multiple
  canonicals and no slug, ask the user to pass an explicit slug.

### 3. Prepare by attach/update when needed

If Step 2 showed that preparation is needed, delegate to the existing operation
workflows rather than reproducing their internals here:

- For a missing snapshot, follow `../objective-attach/SKILL.md` to attach the
  objective to the current branch. If attach reports candidate-slug or
  source-branch ambiguity, list the alternatives, ask the user to choose, and
  rerun attach with the selected values.
- For a stale snapshot, follow `../objective-update/SKILL.md` for the resolved
  slug. That workflow owns update precheck, conservative rewrites, serialized
  `brmem put` writes, and absorbed-marker advancement.

If either delegated workflow reports a terminal error, surface it and stop. Do
not manually construct attach plan files, inspect raw source files for progress,
or run lower-level update commands from this skill.

### 4. Rerun context after preparation

After any attach or update, rerun:

```bash
objective exec next-context <resolved-slug> --format json
```

Use this up-to-date context for the status report and roadmap-entry
recommendation. If it still reports stale, stop and explain that preparation did
not converge.

### 5. Interpret the prepared content

Use the `body_content`, `roadmap_content`, `notes_content`, `files_present`,
`current_branch`, `trunk_branch`, `on_trunk`, and `snapshot_state` fields from
the prepared context. Interpret them using this skill's content inventory and
the anatomy in `../objective/SKILL.md`.

Keep the status report tight enough to verify at a glance:

- source label / current branch and resolved slug
- content files present
- title and status from `body_content`
- progress state from `body_content`, `roadmap_content`, and `notes_content`
- first unfinished numbered roadmap entry
- durable findings or notes presence, summarized in one line when useful
- description/goals summary only when it adds signal

If optional content is absent, say so briefly and fall back to the available
Markdown. Do not fetch missing files yourself.

### 6. Select the next numbered roadmap entry

Use semantic judgment over the prepared roadmap content:

- Prefer the first unfinished numbered entry. An entry is unfinished when it has
  unchecked implementation tasks or prose that clearly describes remaining
  codified work.
- If priority is non-obvious, present 2-3 candidate numbered entries with
  one-line rationales, then ask the user to choose.
- If an entry is too large or mixes unrelated work, recommend splitting it and
  describe the proposed split before branch creation.
- Treat child checklist items as tasks within their numbered entry; they are not
  separate roadmap entries unless the roadmap explicitly numbers them.

If there is no `roadmap.md`, or the roadmap has no unfinished numbered entry,
report that clearly and recommend whether to create/update the roadmap or close
the objective.

### 7. Recommend implementation shape and branch hint

For the selected entry, choose the smallest safe implementation shape:

- **single PR** — default when the entry is cohesive and testable.
- **short stack** — when the entry naturally decomposes into ordered, reviewable
  changes that should land together.
- **docs-only change** — when the entry only updates objective docs, skill docs,
  README/help text, or other documentation.
- **split first** — when the entry is too broad, contains unrelated work, or
  has unclear acceptance criteria.

When recommending work on a branch, suggest a terse candidate branch slug based
on the entry title (lowercase ASCII letters, digits, and hyphens; no slash; no
leading `objective-`; no consecutive hyphens; usually 50 characters or fewer).
Then call:

```bash
objective exec next-collision <candidate-slug> --format json
```

Report the returned collision state:

- `clear`: safe to use
- `branch_exists`: a local branch already uses the slug
- `canonical_exists`: a canonical objective already uses the slug
- warnings: include them verbatim or summarized without changing their meaning

On any collision or warning, ask for a human choice: pick a different slug,
rename the would-be branch, append a suffix, or proceed knowingly. Do not
auto-resolve.

### 8. Final output

Return:

- whether preparation was needed (`none`, `attached`, `updated`, or
  `attached + updated`)
- source label / current branch and resolved objective slug
- concise status summary and open-work summary
- selected numbered roadmap entry
- recommended implementation shape (`single PR`, `short stack`, `docs-only`,
  `split first`, or `ask`)
- candidate branch slug and collision result when a branch is recommended
- next-step hint tailored to the shape

For branch-based work, the hint should say:

```text
To proceed: create a branch for <candidate-branch-slug> using the repo's normal
branch workflow. On the new branch, run objective-attach (or rerun
objective-next on the unattached branch and let it prepare before planning).
After implementing the work, run objective-update <objective-slug>; after the
work lands, run objective-reconcile <objective-slug> on the trunk branch.
```

## Edge Cases And Anti-Patterns

- Detached `HEAD`: abort.
- Current branch is the trunk branch: `next-context` may read canonical state;
  skip branch snapshot state preparation because canonical rewrites go through
  `objective-reconcile`, not `objective-update`.
- Multiple slugs on the current branch: legitimate when two unrelated parent
  objectives are attached on the same branch; list both and ask.
- Unattached non-trunk branch: delegate to `objective-attach`, then update if
  stale before recommending.
- Branch name does not equal objective slug. Never derive the objective slug
  from the branch name.
- Source has only the required content file: report that no roadmap progress
  surface exists and ask for a numbered roadmap entry or explicit human choice.
- Never manually create attach plan files during `objective-next`; delegate
  missing snapshot attachment to `objective-attach`.
- Never auto-pick from a multi-slug current branch, auto-resolve a collision,
  inspect source code for drift, hand-copy a snapshot, walk ancestors outside
  the attach primitive, write canonical state, create branches, or implement
  work during `next`.
