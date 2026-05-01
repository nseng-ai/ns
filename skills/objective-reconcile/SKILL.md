---
name: objective-reconcile
description: "Command: objective-reconcile"
allowed-tools:
  - "Bash(objective exec reconcile-plan *)"
  - "Bash(objective exec reconcile-summary *)"
  - "Bash(objective exec reconcile-diff *)"
  - "Bash(objective exec reconcile-apply *)"
  - "Read"
  - "Write"
---

# objective-reconcile

Refresh canonical objectives on trunk from landed branch snapshots and their
merged PRs. The CLI handles deterministic mechanics; the skill performs only
the conservative semantic rewrite of Markdown.

> For the canonical-vs-branch model, document anatomy, lifecycle, and shared
> rewrite rules, see `../objective/SKILL.md` and
> `../objective/references/mutation-contract.md`.

## Goal

Sweep every canonical objective on trunk and conservatively fold landed
branch evidence (merged PRs) into canonical `body.md`, `roadmap.md`, and
`notes.md`. The default scope is all canonical objectives. An optional slug
or comma-separated slug list narrows the sweep.

## CLI invariants

The `objective exec reconcile-*` commands enforce the mechanical contract:

- only merged-PR-backed branch snapshots are eligible evidence;
- open, closed-unmerged, no-PR, and lookup-error snapshots are surfaced as
  skipped evidence;
- canonical writes are serial and drift-checked with captured blob SHAs;
- per-slug/file failures are isolated and reported;
- `reconcile-apply` accepts either the raw plan object or the JSON envelope
  written by `--format json`.

Do not use ad hoc Python or manual JSON surgery for normal plan inspection.
Use the summary and diff commands below; resort to custom scripts only when
debugging a CLI failure.

## Workflow

### 1. Generate the plan

```bash
mkdir -p /tmp/objective-reconcile
objective exec reconcile-plan [slug-or-comma-separated-list] --format json > /tmp/objective-reconcile/plan.json
```

### 2. Read the compact summary

```bash
objective exec reconcile-summary [slug-or-comma-separated-list] --format markdown
```

Use this to identify actionable slugs, skipped snapshots, gaps, conflicts,
PR titles, and canonical files without reading raw Markdown blobs.

### 3. Inspect deterministic diffs for each actionable slug

```bash
objective exec reconcile-diff <slug> --format markdown
```

The diff treats Markdown as opaque text. Use it to compare canonical files
against each included merged snapshot.

### 4. Perform the semantic rewrite only

For each actionable slug:

1. Inspect canonical content and the deterministic diffs.
2. Apply `../objective/references/mutation-contract.md`:
   - `body.md`: quiet factual updates only; move `Status:` only when the
     end-state changed categorically.
   - `roadmap.md`: check items only when merged evidence corroborates them;
     add nearby follow-ups when useful.
   - `notes.md`: append durable findings; never paste branch text wholesale.
3. Write only changed proposed files using this layout:

```text
/tmp/objective-reconcile/<slug>/body.md.proposed
/tmp/objective-reconcile/<slug>/roadmap.md.proposed
/tmp/objective-reconcile/<slug>/notes.md.proposed
```

Skip slugs with no eligible evidence, canonical conflicts, or only gaps.

### 5. Apply the proposed writes

```bash
objective exec reconcile-apply \
  --plan-file /tmp/objective-reconcile/plan.json \
  --proposed-dir /tmp/objective-reconcile \
  --format json
```

`reconcile-apply` discovers `<slug>/<file>.proposed` files, validates known
objective filenames, performs drift checks, and writes canonical updates.
Do not edit `plan.json` to add `proposed_writes` unless `--proposed-dir` is
unavailable.

### 6. Report

Use the apply JSON plus the summary/diff context. Include:

- slugs swept, rewritten, unchanged, and with gaps/conflicts;
- per rewritten slug: files written and `<old_head_sha> -> <new_head_sha>`;
- recovery commands copied exactly from apply output;
- skipped snapshots, gaps, and conflicts surfaced verbatim;
- a short semantic note describing what landed evidence you folded in.

## Edge cases

- Empty target set: report that no canonical objectives matched and stop.
- Unknown slug: surface the CLI gap and do not create a new objective here.
- Canonical `body.md` missing: surface the conflict and skip the slug.
- No merged-PR-backed snapshots: surface as unchanged/gap; nothing to fold.
- Drift during apply: report the skipped file and rerun the plan before
  attempting another apply.

## Closing an objective after reconcile

`reconcile` never auto-closes an objective. After a successful reconcile, if
every Completion Criterion in canonical `body.md` is satisfied and the
operator agrees the work is done, run `objective close <slug>` (optionally
with `--reason "<short note>"`). Closure is explicit; do not infer it from PR
state or checkbox completion.
