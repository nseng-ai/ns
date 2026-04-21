---
name: dev-memjective-update
description: "Rewrite the current branch's memjective snapshot after a slice of work has landed. Assumes the branch already has exactly one `memjectives/<slug>.md` entry in brmem and the user has completed a unit of work they want reflected in the snapshot. Loads the existing snapshot, applies conservative in-place edits per the spec's mutation contract (check completed items, split newly granular items, append Notes, amend How to Make Progress when the recipe actually changed), writes the updated text back to brmem, and reports old/new commit SHAs for recoverability. Use after finishing a slice — phrases like 'update the memjective', 'record progress on the memjective', 'snapshot what I just landed'. Does **not** decide what to work on next (see `dev-memjective-next`) and does **not** implement anything (that's the work that happens between `next` and `update`). Does **not** rewrite the master seed. Does **not** carry-forward onto a branch with no snapshot — for that, run the `brmem put` command printed by `dev-memjective-next`."
allowed-tools:
  - "Bash(git rev-parse *)"
  - "Bash(brmem *)"
  - "Read"
  - "Write"
metadata:
  internal: true
---

<!-- INTERNAL SKILL: twerk-only. Local-first memjective prototype on top of brmem. -->

# dev-memjective-update

Rewrite the current branch's memjective snapshot after a slice of work has
landed.

See the `dev-memjective` spec skill for shared vocabulary (seed vs. snapshot,
carry-forward, one-per-branch invariant) and the full mutation contract.

## Goal

On the current branch:

1. Confirm exactly one active memjective snapshot exists.
2. Load it.
3. Rewrite it conservatively to reflect the slice of work the user just
   completed.
4. Write the updated text back to brmem.
5. Report old/new commit SHAs so prior snapshots are recoverable.

This skill deliberately does **not** decide what to work on next and does
**not** implement anything. `dev-memjective-next` handles the "decide" half of
the loop; the actual implementation is ordinary engineering work between the
two skills.

## Core rules

- **Local-first only.** Never touch GitHub.
- **One memjective per branch.** Abort if the branch has 0 or more than 1
  entries in the `memjectives` namespace — use `dev-memjective-next` or the
  exact `brmem put` command it prints to attach a memjective onto a branch
  that has none.
- **Never rewrite the master seed.** `update` mutates only the current
  branch's snapshot.
- **Conservative in-place edits.** Follow the mutation contract in
  `../dev-memjective/references/mutation-contract.md`. Do not regenerate the
  document from scratch.
- **Preserve history.** brmem keeps prior snapshots by commit; the report
  surfaces the old SHA so the user can recover.

## Workflow

### 1. Pre-flight: confirm repo + current branch

```bash
git rev-parse --show-toplevel
git rev-parse --abbrev-ref HEAD
```

Call the branch `<branch>`.

Abort if:

- not in a git repo
- the current branch is detached (`HEAD`)

### 2. Confirm exactly one memjective snapshot on the current branch

```bash
brmem list --namespace memjectives
```

`--branch` is omitted so the current branch is used implicitly.

Decision rules:

- **0 matches** → abort; this skill does not attach a memjective onto a branch
  that has none. Tell the user to run `dev-memjective-next` and follow the
  `brmem put` command it prints to do the carry-forward explicitly, or to use
  `dev-memjective-create` if this is a brand-new memjective.
- **1 match** → that is the active branch snapshot. Continue.
- **2+ matches** → abort; the branch is in an invalid v0 state.

### 3. Capture the prior snapshot commit

Before rewriting, capture the current snapshot commit for the report:

```bash
brmem check <slug>.md --namespace memjectives
```

### 4. Load the active snapshot

```bash
brmem get <slug>.md --namespace memjectives
```

Read the document. Interpret its sections per the spec skill's **Document
anatomy**: Title, Status, Intro, Completion Criteria, Status Checklist, How
to Make Progress, Notes.

If the document is badly malformed, consult the template at
`../dev-memjective/templates/memjective-template.md` for intended shape, but
preserve the existing content rather than regenerating it.

### 5. Rewrite conservatively

Apply the mutation contract in
`../dev-memjective/references/mutation-contract.md`. Summary of the allowed
per-section edits on the current-branch snapshot:

- **Title** — leave as-is unless the user explicitly asks to rename.
- **Status** — may update (`in progress` / `blocked` / `done`).
- **Intro** — clarify or append; do not replace wholesale.
- **Completion Criteria** — check items; add brief evidence notes; do not
  delete or rewrite criteria.
- **Status Checklist** — check completed items; add newly discovered
  follow-ups near the affected slice; split items when work turned out more
  granular than expected. Keep completed items visible — do not erase
  progress history.
- **How to Make Progress** — edit only when the actual work recipe has
  changed, not just because one checklist item finished.
- **Notes** — append findings, constraints, pointers, collisions. Prefer
  striking or annotating obsolete notes over silently deleting them. Add the
  section if it does not exist and you have something worth preserving.

### 6. Persist the updated snapshot

Write the updated text to a temp file, then store it back to the same brmem
key:

```bash
brmem put <slug>.md --namespace memjectives --file <temp-file>
```

Capture the new commit SHA.

### 7. Report

Summarize:

- memjective slug
- what changed in the snapshot (sections touched, items checked, notes
  appended)
- old snapshot commit SHA
- new snapshot commit SHA
- recovery hint:

```text
Recover the prior snapshot with:
brmem get <slug>.md --namespace memjectives --at <old-sha>
```

## Edge cases

- **Detached HEAD** → abort.
- **Current branch has no memjective snapshot** → abort; direct the user to
  `dev-memjective-next` or the `brmem put` command it would print.
- **Current branch has multiple memjective snapshots** → abort; invalid v0
  state.
- **User wants the master seed updated** → refuse; the master seed is frozen
  during the normal lifecycle.

## Anti-patterns

- Updating the master-branch memjective entry.
- Regenerating the memjective from memory or from the original user brief
  when a real snapshot already exists.
- Silently deleting completed checklist items or Notes.
- Rewriting Completion Criteria because the plan drifted. If the criteria no
  longer match the work, the memjective has outgrown the prototype.
- Doing any implementation work from inside this skill. Implementation
  happens between `dev-memjective-next` and `dev-memjective-update`, not
  inside either.
- Attaching a memjective onto a branch that has none. That is explicitly
  outside this skill's scope; `dev-memjective-next` prints the exact
  `brmem put` command to run manually.
