---
name: dev-memjective-digest
description: Command
allowed-tools:
  - "Bash(memjective exec digest *)"
  - "Bash(memjective list *)"
metadata:
  internal: true
---

<!-- INTERNAL SKILL: twerk-only. Local-first memjective subsystem on top of brmem. -->

# dev-memjective-digest

Render a one-page Markdown digest of a memjective from the raw snapshots
emitted by `memjective exec digest`.

> For the canonical-vs-branch model, document anatomy, lifecycle, and shared
> rewrite rules, see `../dev-memjective/SKILL.md`.

## Goal

Brief a new agent (or human) on a memjective in a single read: top-level
metadata, the original thesis, a slice/PR table, and a short list of binding
findings. The CLI hands over raw `body.md` / `roadmap.md` / `notes.md` blobs
plus deterministic git/PR facts (timestamps, branch state, PR state). The
skill owns every read of prose: distilling the **Thesis**, computing slice
and checkbox counts, picking the most-progressed branch, judging which
unclaimed PRs really belong to an unchecked slice, and selecting **Key
findings**.

`digest` is read-only: it never writes to brmem, never modifies canonical
state, and never opens, closes, or comments on PRs. Safe to run on any
branch, including `master`.

## Inputs

- **Slug, optional.** When omitted, the CLI auto-resolves from the current
  branch when exactly one slug is attached. When the slug cannot be
  resolved, the CLI surfaces `no_memjective_on_branch` or
  `ambiguous_memjective` — surface the message and direct the user to
  `memjective list`.

## Workflow

### 1. Fetch the facts

```bash
memjective exec digest <slug> --format json
```

Surface the CLI's `error.message` verbatim if exit code is non-zero.

The JSON payload has this shape:

```jsonc
{
  "slug": "<slug>",
  "master": {
    "body_md": "...",        // raw master body.md
    "roadmap_md": "...",     // raw master roadmap.md (may be "")
    "notes_md": "...",       // raw master notes.md (may be "")
    "body_last_touched": "<ISO-8601 or null>"
  },
  "branches": [
    {
      "branch": "<name>",
      "deleted": false,
      "body_md": "...",      // raw branch body.md
      "roadmap_md": "...",   // raw branch roadmap.md
      "notes_md": "...",     // raw branch notes.md
      "body_last_touched": "<ISO-8601 or null>",
      "branch_head_iso": "<ISO-8601 or null>",
      "memj_state": "fresh"|"stale",
      "pr_number": 833 | null,
      "pr_state": "OPEN"|"MERGED"|"CLOSED" | null,
      "pr_title": "...",
      "pr_url": "...",
      "pr_error": null
    }
  ],
  "unclaimed_pr_candidates": [
    { "number": 999, "title": "...", "url": "...", "head_ref": "..." }
  ],
  "warnings": ["drift_check_skipped: ..."]
}
```

The CLI never parses Markdown. Slice headings, status fields, completion
criteria — all of those live in the raw blobs and are your job to read.

### 2. Compute the deterministic facts

Read these directly off the blobs. Treat them as mechanical extraction —
no judgment.

- **Status.** Find the first line in `master.body_md` that matches
  `Status: <value>` (case-insensitive). The value is everything after the
  colon, trimmed. If no such line exists, treat it as `unknown`.
- **Slices on a snapshot.** Inside `roadmap_md`, every `##` heading is
  one slice in source order. Strip a leading `Slice N —` (or `Slice N -`,
  `Slice N:`) prefix from the heading text; what's left is the slice
  title. Each slice owns the lines between its `##` heading and the next
  `##` heading. A slice is **fully checked** when every `- [ ]` / `- [x]`
  task-list item under it is `[x]` (case-insensitive `x`/`X`), and there
  is at least one such item.
- **Completion criteria counts.** Inside `master.body_md`, find the
  `## Completion Criteria` section (everything from that heading up to
  the next heading of the same level or higher). Count `- [x]` (checked)
  and `- [ ]` (unchecked) task-list items in that section. Do the same on
  the most-progressed branch's `body_md` for the in-flight count.
- **Most-progressed branch.** Among `branches` where `deleted` is false,
  pick the one with the most fully-checked slices. Tiebreak by
  `body_last_touched` (later wins; missing/null sorts last). If there are
  no live branches, there is no most-progressed branch — render the
  affected metadata rows with `0 active` / no branch reference.
- **Slice attribution.** Each branch is opened to land exactly one slice.
  Identify a branch's origin slice by matching `pr_title` against master's
  slice titles — strongest semantic match wins, treated as a 1:1
  assignment across all branches and slices (do not assign one branch to
  multiple slices). Use this for the slice table's PR / Branch / Memj
  columns.

### 3. Distill the **Thesis** (judgment)

Inside `master.body_md`, locate the `## Description` section and the
`## Out of scope` section (case-insensitive heading match; section runs
until the next heading of equal or higher level). Use them as input — do
**not** restate them.

Write **two to four sentences** that answer, in this order:

1. **Value.** What gets better when this workstream lands? (Easier to
   read, fewer foot-guns, faster onboarding, smaller blast radius for a
   future change, etc.) Lead with the outcome, not the mechanic.
2. **Approach.** The _shape_ of the work in one sentence — the strategy
   that ties the slices together (e.g. "behavior-preserving cleanup
   slices, each consolidating duplicated logic onto the module that owns
   the invariant").
3. **Boundary.** Optional short clause naming what's deliberately out of
   scope, only when it sharpens the reader's mental model. Skip when the
   workstream's scope is already clear from value + approach.

Anti-patterns:

- **Do not enumerate slices or list every cleanup the workstream does.**
  The slice table already covers that. If the thesis reads like a tour of
  the roadmap, rewrite it.
- **No module paths, class names, function names, or API surface
  details.** Those are implementation; they belong in **Key findings**,
  not the thesis.
- **No bullet lists, no sub-headings, no restating the source section
  names** (`Description`, `Out of scope`).

A new reader should finish the thesis knowing _why this work exists_ and
_how it's being approached_ — not what each slice changes.

### 4. Compose **Key findings** (judgment)

Read every non-empty `notes_md` in `branches` (and `master.notes_md` if
non-empty). Select **at most five** durable contract decisions — module
paths, behavior deletions, error-message lock-ins, API surface moves.
Drop implementation trivia (test names, file:line citations, scope-choice
asides). Tag a finding with the branch it originated on only when the
reader needs to follow up there.

If every notes blob is empty or absent, render the section as a single
line: `_No durable findings recorded yet._` Do not invent findings to fill
the section.

### 5. Judge unclaimed PRs (judgment)

`unclaimed_pr_candidates` lists every open PR in the repo whose `head_ref`
is **not** attached to this memjective's snapshot tree. The CLI does not
filter by relevance — that's your call. For each candidate, compare its
`title` against master's unchecked slice titles. Promote a candidate to
the trailing `> ⚠` block only when the title plausibly describes work on
one of those slices. Drop candidates that are unrelated. Surface the
remaining warnings (`drift_check_skipped`, etc.) verbatim.

## Output Format

Emit exactly this shape (verbatim contract — column order, row order, and
section headings are locked):

```markdown
# `<slug>` — digest

|                         |                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------- |
| **Status**              | <status> · <N> PRs open, <M> merged                                                |
| **Roadmap**             | <X> / <Y> slices checked on branches · <A> / <Y> on master                         |
| **Completion criteria** | <P> / <T> met on branches · <Q> / <T> on master                                    |
| **Live branches**       | <K> active[ (+<D> merged & deleted)] — most-progressed: `<branch>` (updated <ISO>) |
| **Master canonical**    | last touched <ISO>; <readiness>                                                    |

## Thesis

<2–4 sentences distilled in step 3 — value first, then approach, optional boundary clause>

## Slices

| #   | ✓ | Slice         | PR          | PR state | Branch     | Memj    |
| --- | - | ------------- | ----------- | -------- | ---------- | ------- |
| 1   | ✓ | <slice title> | [#NNN](url) | open     | `<branch>` | `fresh` |
| ... |   |               |             |          |            |         |

**Memj legend:** `fresh` snapshot pinned at branch HEAD (or branch deleted
post-merge — pin can no longer drift) · `stale` branch advanced past
snapshot pin, run `dev-memjective-update` · `—` no snapshot for this
slice's origin branch.

## Key findings (binding for future work)

- **<short headline>.** <one or two sentences>
- ... (3–5 bullets max; durable contract decisions only)

<!-- include only if you promoted any unclaimed PRs or `warnings` is non-empty -->

> ⚠ <each rendered warning on its own line>
```

Metadata-row composition rules:

- **Status row.** `<status>` is the value extracted in step 2, or `unknown`.
  `<N>` is the count of `branches` with `pr_state == "OPEN"`. `<M>` is the
  count with `pr_state == "MERGED"`.
- **Roadmap row.** `<Y>` is the slice count of `master.roadmap_md`. `<X>`
  is the count of fully-checked slices on the most-progressed branch
  (`0` when no live branch exists). `<A>` is the count of fully-checked
  slices on `master.roadmap_md`.
- **Completion criteria row.** `<T>` is the total checkbox count in
  master's `## Completion Criteria` section. `<Q>` is the checked count
  on master. `<P>` is the checked count on the most-progressed branch's
  Completion Criteria section (`0` when no live branch).
- **Live branches row.** `<K>` is the count of `branches` with
  `deleted == false`. `<D>` is the count of `branches` with
  `deleted == true` and `pr_state == "MERGED"` (omit the `(+<D> merged &
  deleted)` clause when `<D>` is `0`). The most-progressed branch's
  name and `body_last_touched` fill the suffix; when there is no live
  branch, render `0 active — no branch snapshots`.
- **Master canonical row.** ISO timestamp is `master.body_last_touched`
  (or `unknown`). `<readiness>` is one of:
  - `reconcile pending — <M> merged PRs not yet folded in` when the
    merged-PR count exceeds master's fully-checked slice count.
  - `<ahead> slices ahead on branches, but reconcile is a no-op until PRs
    merge` when the most-progressed branch has more fully-checked slices
    than master.
  - `in sync with branch snapshots` otherwise.

Slice-row attribution rules:

- Slice rows come from `master.roadmap_md` in source order. `#` is the
  1-based ordinal; **Slice** is the title with the `Slice N —` prefix
  stripped (step 2).
- Column 2 (✓): mark when the slice is fully checked on the
  most-progressed branch. Match titles across branches by meaning
  (lowercase + whitespace + minor wording variance — the same slice may
  be reworded on a branch).
- PR / PR state / Branch / Memj — origin-branch attribution by
  `pr_title` ↔ slice-title semantic match (step 2). The matched branch is
  the slice's origin: fill PR from `pr_url`/`pr_number`, PR state from
  `pr_state` lowercased (`open` / `merged` / `closed`), Branch from
  `branch`, and Memj directly from `memj_state`.
  - Do **not** use per-branch checked overlays to pick the origin. Once a
    slice lands on master, every open downstream branch inherits its
    checkmark, so multiple branches may read as "checked" without having
    authored the slice.
  - Slices with no matching branch render PR / PR state / Branch / Memj
    all as `—`. Heuristic drift signals never appear in the slice rows;
    they live in the trailing `> ⚠` block.
- Memj is taken verbatim from the matched branch's `memj_state` (`fresh`
  or `stale`); a slice with no origin branch renders `—`.

Drift / unclaimed-PR rendering:

- For each `unclaimed_pr_candidates[i]`, decide whether `title` plausibly
  matches one of master's **unchecked** slice titles. Promote the matches
  to the trailing `> ⚠` block as one line each:
  `unclaimed_pr: PR #<n> '<title>' on branch '<head_ref>' matches an
  unchecked slice but has no snapshot. <url> — run dev-memjective-claim
  if it belongs to this memjective.`
- Render every `warnings` string verbatim under the same `> ⚠` block.
- Omit the block when there are no promoted candidates and no warnings.

Format invariants:

- Slug in title, no other adornment.
- Metadata table is exactly five rows in the order shown.
- No "Slices in flight" / "Remaining" subheaders — column 2 is the
  in-flight signal.
- No per-slice prose summary column.
- Print to stdout only. Do not write the digest to a file, do not stash
  it in brmem, do not commit it. The user redirects output if they want
  it saved.
