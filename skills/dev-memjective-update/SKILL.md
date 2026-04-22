---
name: dev-memjective-update
description: "Rewrite the current branch's memjective snapshot after a slice of work lands. Requires exactly one `memjectives/<slug>/body.md` entry on the branch. Applies conservative in-place edits per the mutation contract, writes back to brmem, and reports old/new commit SHAs for recovery. See `dev-memjective` for the subsystem overview."
allowed-tools:
  - "Bash(git rev-parse *)"
  - "Bash(brmem *)"
  - "Read"
  - "Write"
metadata:
  internal: true
---

<!-- INTERNAL SKILL: twerk-only. Local-first memjective subsystem on top of brmem. -->

# dev-memjective-update

Rewrite the current branch's memjective snapshot after a slice of work lands.

> For shared concepts — vocabulary (`snapshot`, `master-branch snapshot`,
> `per-branch snapshot`), the storage model, the one-memjective-per-branch
> invariant, carry-forward semantics, the lifecycle, and the mutation-contract
> summary — see `../dev-memjective/SKILL.md`.

## Goal

On the current branch, confirm there is exactly one snapshot, load it, update
it conservatively to reflect the completed slice, write it back to brmem, and
report old/new commit SHAs so prior snapshots are recoverable.

This skill does **not** choose the next slice and does **not** implement
anything. `dev-memjective-peek` handles the lightweight status check + slug
suggestion, and `dev-memjective-next` handles carry-forward + implementation on
a fresh slice branch.

## Core rules

- **Conservative in-place edits.** Follow the mutation contract in
  `../dev-memjective/references/mutation-contract.md`. Do not regenerate the
  document from scratch.
- **Preserve history.** brmem keeps prior snapshots by commit; report the old
  SHA so the user can recover it.

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
  that has none. Tell the user to run `dev-memjective-next` on this branch
  to carry the snapshot forward and implement the next slice, or to run
  `dev-memjective-create` if this is a brand-new memjective.
- **1 match** → that is the active branch snapshot. Continue.
- **2+ matches** → abort; the branch is in an invalid state.

### 3. Capture the prior snapshot commit

Before rewriting, capture the current snapshot commit for the report:

```bash
brmem check <slug>/body.md --namespace memjectives
```

### 4. Load the active snapshot

```bash
brmem get <slug>/body.md --namespace memjectives
```

Read the document. Interpret its sections per the spec skill's **Document
anatomy**: Title, Status, Description, Goals, Completion Criteria, Roadmap,
How to Make Progress, Notes.

If the document is badly malformed, consult the template at
`../dev-memjective/templates/memjective-template.md` for intended shape, but
preserve the existing content rather than regenerating it.

### 5. Rewrite conservatively

Apply the mutation contract in
`../dev-memjective/references/mutation-contract.md`. In practice, keep the
rewrite narrow:

- Preserve the document shape and title unless the user explicitly asked to
  rename it.
- Update `Status` if the branch state changed.
- Mark completed work in `Completion Criteria` and `Roadmap`, and keep
  completed items visible.
- Add only nearby follow-up roadmap items when the work split more finely
  than expected.
- Update `Description` or `Goals` only for small clarifications.
- Update `How to Make Progress` only when the actual recipe changed.
- Append durable findings to `Notes`; annotate obsolete notes instead of
  silently deleting them.

The intended cost reduction is explicit here: normal update sessions should
mostly touch `Status`, `Completion Criteria`, `Roadmap`, and `Notes`.
Top-of-document context should stay mostly stable over time.

**Sourcing "what landed" signal.** For simple rewrites, `git log --oneline
master` is usually enough — squash-merged PRs appear as `Title (#N)`
commits on master. When the commit title is terse or the snapshot cites PR
numbers that need cross-checking, consulting GitHub directly via `gh pr
view <N>` or `gh pr list --state merged --search ...` is encouraged —
reading GitHub is allowed. Do not synthesize new document content from PR
bodies; use GitHub signal only to ground the conservative edits the
mutation contract already allows.

### 6. Persist the updated snapshot

Write the updated text to a temp file, then store it back to the same brmem
key:

```bash
brmem put <slug>/body.md --namespace memjectives --file <temp-file>
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
brmem get <slug>/body.md --namespace memjectives --at <old-sha>
```

## Edge cases

- **Detached HEAD** → abort.
- **Current branch has no memjective snapshot** → abort; direct the user to
  run `dev-memjective-next` on this branch to carry-forward and implement a
  slice before re-running `update`.
- **Current branch has multiple memjective snapshots** → abort; invalid state.
- **User wants the master-branch snapshot updated** → refuse; the
  master-branch snapshot is frozen during the normal lifecycle.

## Anti-patterns

- Updating the master-branch memjective entry.
- Regenerating the memjective from memory or from the original user brief
  when a real snapshot already exists.
- Silently deleting completed roadmap items or Notes.
- Rewriting Completion Criteria because the plan drifted. If the criteria no
  longer match the work, the memjective has outgrown the subsystem.
- Using `update` to rename sections or rebuild snapshots wholesale.
- Doing any implementation work from inside this skill. Implementation
  happens inside `dev-memjective-next`, not here.
- Attaching a memjective onto a branch that has none. That is explicitly
  outside this skill's scope; `dev-memjective-next` performs the
  carry-forward as part of its workflow on a fresh slice branch.
