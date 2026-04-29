---
name: objective-reconcile
description: "Command: objective-reconcile"
allowed-tools:
  - "Bash(objective exec reconcile-plan *)"
  - "Bash(objective exec reconcile-apply *)"
  - "Read"
  - "Write"
---

# objective-reconcile

Refresh canonical objectives on `master` from landed branch snapshots and
their merged PRs. The deterministic mechanics — slug-set resolution,
canonical-presence checks, branch-snapshot enumeration, PR-state gating,
old-SHA capture, and serial canonical writes — live in
`objective exec reconcile-plan` / `objective exec reconcile-apply`. This
skill is a thin workflow that drives those commands and performs the
conservative semantic rewrite over raw Markdown.

> For the canonical-vs-branch model, document anatomy, lifecycle, and shared
> rewrite rules, see `../objective/SKILL.md` and
> `../objective/references/mutation-contract.md`.

## Goal

Sweep every canonical objective on `master` and rewrite each one
conservatively, folding only landed branch evidence (merged PRs) into
canonical `body.md`, `roadmap.md`, and `notes.md`. The default scope is
**all** canonical objectives on `master`. An optional slug or
comma-separated slug list narrows the sweep without otherwise changing
the per-slug procedure.

## Core invariants enforced by code (not prose)

These are guaranteed by `objective exec reconcile-plan` and
`objective exec reconcile-apply`; you do not need to re-implement them:

- **Parent-only serial canonical writes.** All `brmem put` calls run
  serially inside `reconcile-apply`. There is no parallel write path. All
  canonical objective files share the
  `refs/brmem/ns/objectives/<encoded-master>` snapshot ref, so this
  serialization is required to avoid silent clobbering.
- **PR-state gating.** Only branch snapshots whose PR is `MERGED` are
  eligible evidence. `OPEN`, `CLOSED` (unmerged), no-PR, and
  PR-lookup-error snapshots are recorded as evidence skips with a stable
  reason, never folded into canonical state.
- **Canonical drift detection.** `reconcile-apply` rejects any file whose
  per-file content blob has changed since the plan was generated, with
  `expected_old_blob_sha`. The recovery hint uses
  `expected_old_head_sha` for `brmem get ... --at <sha>`.
- **Per-slug isolation.** A failure on one slug or one file does not
  block the others; it surfaces as a skip with reason. Whole-run aborts
  are reserved for missing/malformed plan-files and schema mismatches.

## Workflow

### 1. Generate the plan

```bash
objective exec reconcile-plan [slug-or-comma-separated-list] --format json > /tmp/objective-reconcile/plan.json
```

The JSON envelope (`schema: "reconcile-plan/v1"`) has one entry per
target slug. For each slug it carries:

- `canonical_present`, `canonical_files` (raw Markdown +
  `expected_old_blob_sha` + `expected_old_head_sha`),
- `included_snapshots`: branch snapshots whose PR is `MERGED`, with their
  raw Markdown files,
- `skipped_snapshots`: with `reason` ∈ `open` / `closed_unmerged` /
  `no_pr` / `lookup_error`,
- `gaps`, `conflicts` (e.g. canonical `body.md` missing).

### 2. Conservatively rewrite per slug

For each slug with at least one `included_snapshots` entry:

1. Read the raw Markdown blocks for canonical and each merged-PR-backed
   branch snapshot.
2. Apply the rules in
   `../objective/references/mutation-contract.md`:
   check landed roadmap items, append durable findings to `notes.md`,
   move `Status:` only when the end-state changed categorically, do not
   paste branch text wholesale, do not delete completed history, do not
   rename sections.
3. Write the proposed new file contents to disk under
   `/tmp/objective-reconcile/<slug>/<file>.proposed`.
4. Extend the plan envelope's `slugs[i].proposed_writes` array with one
   entry per file you rewrote:

   ```json
   {"file": "body.md", "proposed_path": "/tmp/objective-reconcile/<slug>/body.md.proposed"}
   ```

Skip slugs that have no eligible evidence (the plan flags them with a
gap) — there is nothing to fold in.

### 3. Apply the plan

```bash
objective exec reconcile-apply --plan-file /tmp/objective-reconcile/plan.json --format json
```

Output is a `reconcile-plan/v1` envelope with `slugs[i].writes`
(successful applies, with `old_blob_sha` / `old_head_sha` /
`new_head_sha` / `recovery_command`), `slugs[i].skipped` (drift, missing
file), and `slugs[i].gaps`.

### 4. Render the report

Lead with a header line that reports counts: slugs swept, slugs
rewritten, slugs unchanged, slugs with gaps. For every slug that was
either rewritten or had a gap, emit a sub-section containing:

- slug and canonical target (`master`, the permanent canonical branch),
- per-file `<old_head_sha> -> <new_head_sha>`,
- branch snapshots consulted (from the plan), with PR state, and
  one-line contributions you used,
- any `skipped_snapshots` from the plan (open / closed / no-PR / lookup
  error),
- conflicts and evidence gaps verbatim from both envelopes,
- recovery hint: copy `recovery_command` from each successful write.

Slugs with no rewrite and no gap may collapse into a single "Unchanged"
group listing names.

## Conservative rewrite rules (summary)

The full rules live in `../objective/references/mutation-contract.md`.
Typical reconcile work over the raw Markdown:

- **`body.md`**: quietest file. Only move `Status:` categorically and
  apply small factual clarifications. Do not rebuild wholesale, do not
  delete completed history, do not rename sections.
- **`roadmap.md`**: check items only when corroborated by merged PR
  evidence. Add nearby follow-ups discovered during landed branch work.
- **`notes.md`**: append durable findings from landed branch `notes.md`
  or merged PR context. Never copy raw branch text verbatim.

When merged branch snapshots disagree, prefer the corroborated signal,
keep canonical conservative, and surface the contradiction in the
report's per-slug `conflicts` line — do not force a confident rewrite.

## Edge cases

- **Empty target set.** `reconcile-plan` returns `slugs: []`. Print one
  line ("no canonical objectives on master") and stop.
- **Operator-supplied unknown slug.** Plan emits a gap for that slug;
  skip in step 2; surface in the report.
- **Canonical `body.md` missing.** Plan emits a `conflicts` entry;
  surface and skip.
- **No merged-PR-backed branch snapshots for a slug.** Plan emits a
  `gaps` entry; nothing to fold; surface as Unchanged.
- **Drift between plan and apply.** `reconcile-apply` skips that file
  with a drift reason; re-run plan to refresh, or manually inspect the
  recovery command.
