---
name: dev-memjective-digest
description: Command
allowed-tools:
  - "Bash(git rev-parse *)"
  - "Bash(memjective tree *)"
  - "Bash(memjective show *)"
  - "Bash(memjective list *)"
  - "Bash(brmem check *)"
  - "Bash(git log *)"
  - "Bash(gh pr list *)"
metadata:
  internal: true
---

<!-- INTERNAL SKILL: twerk-only. Local-first memjective subsystem on top of brmem. -->

# dev-memjective-digest

Render a one-page digest of a memjective from its canonical master snapshot,
every live branch snapshot, and the PRs associated with those branches.

> For the canonical-vs-branch model, document anatomy, lifecycle, and shared
> rewrite rules, see `../dev-memjective/SKILL.md` and
> `../dev-memjective/references/mutation-contract.md`.

## Goal

Given a memjective slug, print one Markdown digest that briefs a new agent (or
human) on the workstream in a single read: top-level metadata, the original
thesis, a slice/PR table, and a short list of binding findings.

`digest` is read-only. It never writes to `brmem`, never modifies canonical
state, and never opens, closes, or comments on PRs. It is safe to run on any
branch, including `master`.

## Memjective Content

The skill reads three files per memjective, both from canonical state on
`master` and from each live branch snapshot:

- `body.md` (required): stable workstream spine and progress guidance.
- `roadmap.md` (optional): ordered slice plan and progress surface.
- `notes.md` (optional): durable findings.

`digest` reads every present file across every snapshot. It does not write
back. See `../dev-memjective/SKILL.md` for the canonical-vs-branch model and
file anatomy.

## Inputs

- **Slug, optional.** When omitted, auto-resolve from the current branch when
  exactly one slug is attached (matches `memjective show` / `memjective tree`
  semantics). When the slug cannot be resolved — zero slugs on the branch, or
  more than one — abort and direct the user to `memjective list` to choose
  one explicitly.

## Core Rules

- **Read-only.** Never call `brmem put`, `dev-memjective-update`, or
  `dev-memjective-reconcile`. Never call any mutating `memjective` or `gh`
  command.
- **`memjective tree --format json <slug>` is the structural spine.** Do not
  re-derive the branch → PR mapping by hand from `git for-each-ref` and
  `gh pr view`. The tree command already reports each branch carrying a
  snapshot, its PR (number, state, title, URL), the seed-presence flag, and
  the snapshot-stale flag.
- **Per-file timing comes from `git log`, not `brmem check`.** For the
  per-file last-touched timestamp on a multi-slug ref (especially `master`),
  use `git log -1 --format=%cI refs/brmem/ns/memjectives/<branch> --
  <slug>/body.md`. `brmem check`'s `head_date` reports the ref's head commit
  time, not the slug's last-touched time, and is wrong here.
- **Most-progressed branch.** The branch whose snapshot has the most checked
  roadmap items (`[x]` in `roadmap.md`). Tiebreak by latest `body.md` commit
  time from the `git log -1` query above.
- **"Behind" reframe.** Master is "behind" only relative to **landed** PRs.
  - If no PRs have merged: `<N> slices ahead on branches, but reconcile is a
    no-op until PRs merge`.
  - If PRs have merged but reconcile has not folded them in: `reconcile
    pending — <K> merged PRs not yet folded in`.
- **Drift detection.** After rendering the slices table, run one
  `gh pr list --state open --search "<keywords from unchecked slice
  titles>"` to find PRs whose intent matches an unchecked slice but whose
  branch is **not** in `memjective tree` entries. Mark such rows with `⚠`
  in the Memj column.
- **Don't fabricate findings.** If `notes.md` is empty or absent on every
  snapshot, render the Key findings section as a single line: `_No durable
  findings recorded yet._` Do not invent durable contract decisions to fill
  the section.
- **Don't reshape the canonical slice list.** Slice rows come from
  `master`'s `roadmap.md` ordering — not the most-progressed branch's. The
  most-progressed branch only drives the ✓ column.
- **Print only.** Do not write the digest to a file, do not stash it in
  `brmem`, do not commit it. The user redirects output if they want it
  saved.

## Output Format

The skill MUST emit exactly this shape (verbatim contract — column order,
row order, and section headings are locked):

```markdown
# `<slug>` — digest

|                         |                                                                             |
| ----------------------- | --------------------------------------------------------------------------- |
| **Status**              | <body status> · <N PRs open, M merged>                                      |
| **Roadmap**             | <X / Y> slices checked on branches · <X' / Y> on master                     |
| **Completion criteria** | <X / Y> met on branches · <X' / Y> on master                                |
| **Live branches**       | <count> — most-progressed: `<branch>` (updated <date>)                      |
| **Master canonical**    | seeded <date>; last touched for this slug <date>; <reconcile-readiness cue> |

## Thesis

<one dense paragraph distilled from master `body.md` Description + Out of scope>

## Slices

| #   | ✓ | Slice         | PR          | Branch     | Memj |
| --- | - | ------------- | ----------- | ---------- | ---- |
| 1   | ✓ | <slice title> | [#NNN](url) | `<branch>` | ✓    |
| ... |   |               |             |            |      |
| K   |   | <slice title> | [#NNN](url) | `<branch>` | ↻    |
| K+1 |   | <slice title> | [#NNN](url) | `<branch>` | ⚠    |
| K+2 |   | <slice title> | —           | —          | —    |

**Memj legend:** ✓ snapshot fresh · ↻ snapshot stale (run
`dev-memjective-update`) · ⚠ branch + PR exist but no snapshot (run
`dev-memjective-claim`) · — no branch yet.

## Key findings (binding for future work)

- **<short headline>.** <one or two sentences>
- ... (3–5 bullets max; durable contract decisions only — module paths,
  behavior deletions, error-message lock-ins, API surface moves)
```

Format invariants:

- Slug in title, no other adornment.
- Top metadata table is exactly 5 rows in the order shown.
- Slice rows pulled from **master**'s `roadmap.md` ordering, not the
  most-progressed branch's.
- ✓ in column 2 = checked on the most-progressed branch's `roadmap.md`.
- Memj column from `memjective tree --format json`'s `stale` field plus
  drift detection:
  - ✓ branch is in `tree` entries with `stale: false` (fresh)
  - ↻ branch is in `tree` entries with `stale: true` (claim happened, but
    branch has commits since the last `dev-memjective-update`)
  - ⚠ a PR exists with branch matching this slice's intent but the branch
    is **not** in `tree` entries (no claim has run)
  - — no associated branch
- Key findings are extracted from `notes.md` across all branch snapshots,
  ruthlessly compressed to durable contract decisions. Skip implementation
  trivia (test names, module-line numbers, scope-choice asides).
- No "Slices in flight" / "Remaining" subheaders — the table's ✓ column is
  the in-flight signal.
- No per-slice prose summary column.

## Workflow

### 1. Preflight

```bash
git rev-parse --show-toplevel
```

Abort if not in a git repo. Resolve the slug from the prompt; if absent,
auto-resolve from the current branch when exactly one slug is attached.
Abort with a pointer to `memjective list` when the slug cannot be resolved.

### 2. Fetch the structural spine

```bash
memjective tree <slug> --format json
```

Fail with the same error `tree` returns when the slug is missing — do not
catch and rephrase. Capture for each entry: branch, PR number, PR state, PR
title, PR URL, `stale` flag, `seed_present` flag.

### 3. Read canonical content

```bash
memjective show <slug>
```

This is master canonical. Capture `body.md`, `roadmap.md`, and `notes.md`
rendered text.

### 4. Read every branch snapshot

For each entry returned by step 2:

```bash
memjective show <slug> --branch <entry.branch>
```

Capture `body.md`, `roadmap.md`, `notes.md` rendered text per snapshot.

### 5. Per-file last-touched timestamps

For master and each branch snapshot, get the per-file timestamp:

```bash
git log -1 --format=%cI refs/brmem/ns/memjectives/<branch> -- <slug>/body.md
```

**Do not** use `brmem check`'s `head_date` for this — on multi-slug refs
(especially `master`) it reports the ref's head time, not the slug's
last-touched time.

Optional: a second `git log -1 ...` filtered to commits whose message
starts with `brmem copy ...` gives the claim time, useful for distinguishing
stale claims from active work.

### 6. Compute the metadata table

- **PR open/merged counts** from `tree` entries' PR state.
- **Roadmap counts** by parsing `[x]` vs `[ ]` in the rendered roadmap of
  the most-progressed branch (and `master` separately).
- **Completion criteria counts** by parsing `[x]` vs `[ ]` in the
  Completion Criteria section of `body.md`, branch-side and master-side.
- **Most-progressed branch** by checked-roadmap-items count, tiebreak by
  latest per-file `body.md` timestamp from step 5.
- **Reconcile readiness cue** per the "Behind" reframe rule above.

### 7. Drift detection

Build a search query from the unchecked slice titles' keywords and run:

```bash
gh pr list --state open --search "<keywords>"
```

For each open PR returned whose branch is not in `tree` entries, mark the
matching slice row's Memj column as `⚠`.

If `gh pr list` fails (no auth, network), continue without drift detection
and emit a one-line warning under the digest.

### 8. Compose Key findings

Read every snapshot's `notes.md` rendered text. Select **at most 5** durable
contract decisions — module paths, behavior deletions, error-message
lock-ins, API surface moves. Drop implementation trivia. Tag a finding with
the branch it originated on only when the reader needs to follow up there.

If every `notes.md` is empty or absent, render: `_No durable findings
recorded yet._`

### 9. Render the Markdown digest verbatim

Print to stdout per the format spec above. Do not write a file. Do not
modify any brmem ref. Do not commit.

## Edge Cases and Anti-Patterns

- **No live branches.** Skip the Slices table's PR / Branch / Memj columns;
  fall back to `master`'s `roadmap.md` for the slice list and a `—` PR
  column. Metadata reads `0 (only master)`.
- **Slug not seeded on master.** Abort and direct the user to
  `dev-memjective-create`.
- **Branch snapshot exists but body has no roadmap section.** Render the
  digest without the slice table; emit a warning line that `roadmap.md`
  is missing and progress can't be quantified.
- **All PRs merged but reconcile not run.** Metadata cue reads `reconcile
  pending — K merged PRs not yet folded in`.
- **`gh pr list` fails (no auth).** Continue without drift detection; emit
  a one-line warning under the digest noting that drift was not checked.
- Never call `brmem put`, `dev-memjective-update`, `dev-memjective-reconcile`,
  or any other mutating command. Never write the digest to a file or commit
  it. Never re-derive the branch → PR mapping by hand when `memjective tree`
  is available.
