---
name: dev-memjective-update
description: "Rewrite the current branch's memjective snapshot after a slice of work lands. Requires exactly one `memjectives/<slug>/body.md` entry on the branch, aborts on legacy flat keys or orphaned metadata, loads the authoritative body plus optional `meta.json`, applies conservative in-place edits from the mutation contract, shows a diff preview before persisting, rewrites `body.md` only when the prose changed, always rewrites `meta.json`, and reports old/new commit SHAs for body and metadata separately. Use when the user wants to record memjective progress or snapshot landed work."
allowed-tools:
  - "Bash(git rev-parse *)"
  - "Bash(git diff *)"
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
body authority, repairable metadata, invalid states) and the full mutation
contract.

## Goal

On the current branch, confirm there is exactly one active memjective body,
load it, update it conservatively to reflect the completed slice, preview the
body diff, persist the changed body only when needed, always refresh the
metadata, and report old/new commit SHAs so prior state is recoverable.

This skill does **not** choose the next slice and does **not** implement
anything. `dev-memjective-peek` handles the lightweight status check + slug
suggestion, and `dev-memjective-next` handles carry-forward + implementation on
a fresh slice branch.

## Core rules

- **Local-first only.** Never touch GitHub.
- **Exactly one active body.** Abort if the current branch has 0 or more than 1
  `*/body.md` entries in namespace `memjectives`.
- **Legacy flat keys are unsupported.** Abort if the current branch contains
  any `^[^/]+\.md$` memjective key.
- **Orphaned metadata is invalid.** Abort if the branch contains `*/meta.json`
  without matching `*/body.md`.
- **Body is authoritative; metadata is repairable.** Missing metadata is a
  warning and a repair opportunity, not a reason to discard the body.
- **Never rewrite the master seed.** `update` mutates only the current branch
  snapshot.
- **Conservative in-place edits.** Follow the mutation contract in
  `../dev-memjective/references/mutation-contract.md`. Do not regenerate the
  document from scratch.
- **Preserve history.** Report old and new SHAs for `body.md` and `meta.json`
  separately.

## Workflow

### 1. Pre-flight: confirm repo + current branch

```bash
git rev-parse --show-toplevel
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
```

Call the branch `<branch>` and current HEAD `<head-sha>`.

Abort if:

- not in a git repo
- the current branch is detached (`HEAD`)

### 2. Resolve exactly one active memjective

```bash
brmem list --namespace memjectives
```

`--branch` is omitted so the current branch is used implicitly.

Classify the results into:

- `*/body.md`
- `*/meta.json`
- legacy flat `^[^/]+\.md$`

Decision rules:

- **any legacy flat key** → abort with an unsupported-layout error
- **any `meta.json` without sibling `body.md`** → abort; invalid state
- **0 body matches** → abort; this skill does not attach memjectives onto bare
  branches
- **1 body match** → that is the active snapshot body; continue
- **2+ body matches** → abort; invalid state

Extract `<slug>` from the active `<slug>/body.md` path.

### 3. Capture prior SHAs separately

Before rewriting, capture the current commit SHAs for the active files:

```bash
brmem check <slug>/body.md --namespace memjectives
brmem check <slug>/meta.json --namespace memjectives
```

The body SHA must exist. The metadata SHA may be missing; record that explicitly
for the final report.

### 4. Load the active body and optional metadata

Read the body:

```bash
brmem get <slug>/body.md --namespace memjectives
```

Then try to read metadata:

```bash
brmem get <slug>/meta.json --namespace memjectives
```

If metadata is missing, continue using the body and note that fresh metadata
will be synthesized.

Interpret the body sections per the spec skill's **Document anatomy**: Title,
Status, Intro, Completion Criteria, Status Checklist, How to Make Progress,
Notes.

If the body is malformed, consult the template at
`../dev-memjective/templates/memjective-template.md` for intended shape, but
preserve the existing content rather than regenerating it.

### 5. Rewrite the body conservatively

Apply the mutation contract in
`../dev-memjective/references/mutation-contract.md`. In practice, keep the body
rewrite narrow:

- preserve the document shape and title unless the user explicitly asked to
  rename it
- update `Status` if the branch state changed
- mark completed work in `Completion Criteria` and `Status Checklist`, and keep
  completed items visible
- add only nearby follow-up checklist items when the work split more finely
  than expected
- update `How to Make Progress` only when the actual recipe changed
- append durable findings to `Notes`; annotate obsolete notes instead of
  silently deleting them

Write the original body and the revised body to temp files.

### 6. Show a diff preview before persisting

Before writing anything back, show a concise preview of the body diff:

```bash
git --no-pager diff --no-index -- <old-body-temp> <new-body-temp>
```

If the diff reveals unintended churn, tighten the rewrite before persisting.

### 7. Persist the body only when it changed

If the revised body text differs from the original body text:

```bash
brmem put <slug>/body.md --namespace memjectives --file <new-body-temp>
```

Capture the new body SHA.

If the body text is unchanged:

- do **not** rewrite `body.md`
- set the "new" body SHA in the report equal to the old body SHA

### 8. Refresh and persist the metadata

Synthesize fresh metadata per
`../dev-memjective/references/meta-schema.md`.

Start from existing metadata when present, but repair it conservatively around
the authoritative body. The refreshed metadata must set:

- `schema_version: 1`
- `slug: <slug>`
- `kind: "snapshot"`
- `branch: <branch>`
- `parent_branch: <best-effort-parent-or-null>`
- `baseline_head_sha: <head-sha>`
- `meta_updated_at: <now>`

Metadata rules:

- preserve `source_branch` when it exists and still makes sense; otherwise use
  `null`
- set `body_updated_at` to `<now>` only when the body text actually changed
- otherwise preserve prior `body_updated_at` when metadata exists
- if metadata was missing and the body did not change, set `body_updated_at` to
  `<now>` as a repair baseline

Persist it:

```bash
brmem put <slug>/meta.json --namespace memjectives --file <new-meta-temp>
```

Capture the new metadata SHA.

### 9. Report

Summarize:

- memjective slug
- what changed in the body (sections touched, items checked, notes appended)
- whether the body text changed or stayed identical
- old body SHA
- new body SHA
- old metadata SHA or `missing`
- new metadata SHA
- recovery hints:

```text
Recover the prior body with:
brmem get <slug>/body.md --namespace memjectives --at <old-body-sha>

Recover the prior metadata with:
brmem get <slug>/meta.json --namespace memjectives --at <old-meta-sha>
```

If metadata was previously missing, say so instead of printing the second
recovery command.

## Edge cases

- **Detached HEAD** → abort.
- **Current branch has no memjective body** → abort; direct the user to
  `dev-memjective-next` or `dev-memjective-create` as appropriate.
- **Current branch has multiple memjective bodies** → abort; invalid state.
- **Current branch has orphaned metadata** → abort; invalid state.
- **Current branch has legacy flat keys** → abort; unsupported layout.
- **Metadata is missing** → continue, warn, and repair it during step 8.
- **User wants the master seed updated** → refuse; the master seed is frozen
  during the normal lifecycle.

## Anti-patterns

- Updating the master-branch memjective entries.
- Regenerating the memjective body from memory or from the original user brief
  when a real snapshot body already exists.
- Rewriting the body just to refresh timestamps or metadata.
- Bumping `body_updated_at` when the body prose did not change.
- Treating stale or missing metadata as more trustworthy than the body.
- Silently deleting completed checklist items or Notes.
- Rewriting Completion Criteria because the plan drifted. If the criteria no
  longer match the work, the memjective has outgrown the prototype.
- Doing implementation work from inside this skill. Implementation happens
  between `dev-memjective-next` and `dev-memjective-update`, not inside either.
