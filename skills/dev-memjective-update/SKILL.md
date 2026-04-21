---
name: dev-memjective-update
description: "Rewrite the current branch's memjective snapshot after a slice of work lands. If the branch has no snapshot, first carry it forward verbatim from the nearest ancestor snapshot or master seed, then apply conservative in-place edits from the mutation contract. Write it back to brmem, and report old/new commit SHAs for recovery. Use when the user wants to record memjective progress or snapshot landed work. It does not choose the next slice, implement anything, or rewrite the master seed."
allowed-tools:
  - "Bash(git rev-parse *)"
  - "Bash(git for-each-ref *)"
  - "Bash(git merge-base *)"
  - "Bash(git rev-list *)"
  - "Bash(brmem *)"
  - "Read"
  - "Write"
metadata:
  internal: true
---

<!-- INTERNAL SKILL: twerk-only. Local-first memjective prototype on top of brmem. -->

# dev-memjective-update

Rewrite the current branch's memjective snapshot after a slice of work lands.

See the `dev-memjective` spec skill for shared vocabulary (seed vs. snapshot,
carry-forward, one-per-branch invariant) and the full mutation contract.

## Goal

On the current branch, confirm there is at most one snapshot. If there is
none, carry the memjective forward verbatim from the nearest ancestor snapshot
or master seed before continuing. Then load the snapshot, update it
conservatively to reflect the completed slice, write it back to brmem, and
report old/new commit SHAs so prior snapshots are recoverable.

This skill does **not** choose the next slice and does **not** implement
anything. `dev-memjective-next` handles the planning half of the loop.

## Core rules

- **Local-first only.** Never touch GitHub.
- **At most one memjective per branch.** Abort if the branch has 2+ entries
  in the `memjectives` namespace. If the branch has 0 entries, perform the
  preflight carry-forward in step 2a — an exact copy of the nearest ancestor
  snapshot (or master seed) onto the current branch — before rewriting.
- **Never rewrite the master seed.** `update` mutates only the current
  branch's snapshot (including the preflight carry-forward, which only writes
  the current branch).
- **Conservative in-place edits.** Follow the mutation contract in
  `../dev-memjective/references/mutation-contract.md`. Do not regenerate the
  document from scratch.
- **Carry-forward is always an exact copy.** The preflight copies the source
  verbatim; any reshaping happens only in the conservative rewrite that
  follows.
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

### 2. Confirm or establish the current-branch snapshot

```bash
brmem list --namespace memjectives
```

`--branch` is omitted so the current branch is used implicitly.

Decision rules:

- **0 matches** → go to step 2a (preflight carry-forward).
- **1 match** → that is the active branch snapshot. Continue to step 3.
- **2+ matches** → abort; the branch is in an invalid v0 state.

### 2a. Preflight carry-forward (runs only when step 2 found 0 matches)

Resolve a source memjective from the strongest candidate available, copy it
verbatim onto the current branch, and then fall through to step 3.

#### Explicit user source

If the user explicitly names a source, resolve that directly instead of
discovering:

- a branch name: require exactly one memjective entry on that branch
- a master seed slug: read `<slug>.md` from `master`
- a local file path: read the file directly and label the source as
  _local file_

If the explicit source is invalid, stop and surface the problem instead of
falling through to discovery.

#### Ancestor snapshot discovery

Enumerate every `(branch, key)` pair that has a memjective entry:

```bash
git for-each-ref --format='%(refname)' refs/brmem/memjectives/
```

Each refname is `refs/brmem/memjectives/<encoded-branch>/<key>`. Extract the
`<encoded-branch>` segment (the 4th path component), decode `---` → `/` to
recover the real branch name, and pair it with `<key>`.

Filter the list:

- Drop entries where the branch is `master` (handled below as a seed, not a
  snapshot).
- Drop entries where the branch equals the current `<branch>` (already
  checked in step 2).
- Drop entries where the branch no longer exists:
  ```bash
  git rev-parse --verify --quiet refs/heads/<B>
  ```
- Keep only entries where the branch is an ancestor of `HEAD`:
  ```bash
  git merge-base --is-ancestor <B> HEAD
  ```

Invariant: if any single ancestor branch surfaces with more than one entry in
the `memjectives` namespace, abort and surface the invalid v0 state instead
of presenting it as a candidate.

Decision rules for ancestor candidates:

- **0 candidates** → fall back to master seeds.
- **1 candidate** → use it automatically and label it as
  _snapshot (ancestor branch `<B>`)_.
- **2+ candidates** → rank by commit distance from `HEAD`:
  ```bash
  git rev-list --count refs/heads/<B>..HEAD
  ```
  The smallest count wins (nearest ancestor). If multiple candidates tie for
  the smallest distance, list them and ask the user to choose.

#### Master seed fallback

```bash
brmem list --namespace memjectives --branch master
```

Decision rules:

- **0 seeds** → ask the user to name a branch, a master slug, or a local
  memjective file.
- **1 seed** → use it automatically and label it as _seed (master)_.
- **2+ seeds** → list them and ask the user to choose.

#### Load and confirm the source

Read the resolved memjective text:

```bash
brmem get <slug>.md --namespace memjectives --branch <source-branch>
```

`<source-branch>` is the nearest ancestor chosen above, `master` for master
seeds, or the branch the user named explicitly. If the source is a local
file, read that file directly instead.

Before writing, print a short one-paragraph summary to the user — title,
status, source label, slug — so they can confirm the chosen source. If the
user rejects it, loop back with the next-best candidate.

#### Write the carry-forward

Write the resolved text to a temp file, then attach it to the current branch
verbatim:

```bash
brmem put <slug>.md --namespace memjectives --file <temp-file>
```

No edits to the text — any reshaping happens in step 5's conservative
rewrite. Capture the resulting commit SHA as the **carry-forward SHA** for
the final report.

### 3. Capture the prior snapshot commit

Before rewriting, capture the current snapshot commit for the report:

```bash
brmem check <slug>.md --namespace memjectives
```

When step 2a just wrote the carry-forward, this SHA matches the
carry-forward SHA — both describe the same commit at this point.

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
`../dev-memjective/references/mutation-contract.md`. In practice, keep the
rewrite narrow:

- Preserve the document shape and title unless the user explicitly asked to
  rename it.
- Update `Status` if the branch state changed.
- Mark completed work in `Completion Criteria` and `Status Checklist`, and
  keep completed items visible.
- Add only nearby follow-up checklist items when the work split more finely
  than expected.
- Update `How to Make Progress` only when the actual recipe changed.
- Append durable findings to `Notes`; annotate obsolete notes instead of
  silently deleting them.

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
- when step 2a fired, an extra line:
  ```text
  Carry-forward: <source-label> → current branch @ <carry-forward-sha>
  ```
- recovery hint:

```text
Recover the prior snapshot with:
brmem get <slug>.md --namespace memjectives --at <old-sha>
```

## Edge cases

- **Detached HEAD** → abort.
- **Current branch has no memjective snapshot** → perform the preflight
  carry-forward from step 2a, then rewrite.
- **Current branch has multiple memjective snapshots** → abort; invalid v0
  state.
- **Ancestor branch has multiple memjective snapshots** → abort; invalid v0
  state. Do not silently pick one.
- **No ancestor snapshot and no master seed** → ask the user for an explicit
  source (branch name, master slug, or local file).
- **User wants the master seed updated** → refuse; the master seed is frozen
  during the normal lifecycle. Carry-forward only writes the current branch.

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
- Editing the memjective text during preflight carry-forward. Carry-forward
  is always an exact copy; any reshaping belongs to the conservative rewrite
  in steps 3–6.
- Using Graphite plumbing (`gt parent`, `gt ls`, graphite branch-config
  reads) for ancestor detection. Raw git only.
