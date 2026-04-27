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

Render a one-page Markdown digest of a memjective from the structured facts
emitted by `memjective exec digest`.

> For the canonical-vs-branch model, document anatomy, lifecycle, and shared
> rewrite rules, see `../dev-memjective/SKILL.md`.

## Goal

Brief a new agent (or human) on a memjective in a single read: top-level
metadata, the original thesis, a slice/PR table, and a short list of binding
findings. The CLI owns every count, timestamp, PR lookup, and drift query;
this skill owns the locked Markdown contract plus two judgment calls:
distilling the **Thesis** and selecting the **Key findings**.

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

Surface the CLI's `error.message` verbatim if exit code is non-zero. The
JSON payload contains: `metadata` (five pre-formatted lines), `thesis_inputs`
(`description_md`, `out_of_scope_md`), `slices` (per-slice flags from
master's roadmap, with per-branch checked overlay), `tree` (one row per
branch + PR with `pr_state`, `branch_head_iso`, `body_last_touched`, and
a CLI-computed `memj_state`), `findings_inputs.notes_by_branch`, and
`warnings` (advisory strings — drift / unclaimed-PR detection lives here,
not as slice rows).

### 2. Distill the **Thesis** (judgment)

Compose one dense paragraph from `thesis_inputs.description_md` and
`thesis_inputs.out_of_scope_md`. State the workstream's purpose and the
boundary it sets. No bullet lists; no restating section headers.

### 3. Compose **Key findings** (judgment)

Read every entry in `findings_inputs.notes_by_branch`. Select **at most
five** durable contract decisions — module paths, behavior deletions,
error-message lock-ins, API surface moves. Drop implementation trivia
(test names, file:line citations, scope-choice asides). Tag a finding
with the branch it originated on only when the reader needs to follow up
there.

If every notes entry is empty or absent, render the section as a single
line: `_No durable findings recorded yet._` Do not invent findings to fill
the section.

## Output Format

Emit exactly this shape (verbatim contract — column order, row order, and
section headings are locked):

```markdown
# `<slug>` — digest

|                         |                                     |
| ----------------------- | ----------------------------------- |
| **Status**              | <metadata.status_line>              |
| **Roadmap**             | <metadata.roadmap_line>             |
| **Completion criteria** | <metadata.completion_criteria_line> |
| **Live branches**       | <metadata.live_branches_line>       |
| **Master canonical**    | <metadata.master_canonical_line>    |

## Thesis

<one dense paragraph distilled in step 2>

## Slices

| #   | ✓ | Slice             | PR          | PR state | Branch     | Memj    |
| --- | - | ----------------- | ----------- | -------- | ---------- | ------- |
| 1   | ✓ | <slices[0].title> | [#NNN](url) | open     | `<branch>` | `fresh` |
| ... |   |                   |             |          |            |         |

**Memj legend:** `fresh` snapshot pinned at branch HEAD (or branch deleted
post-merge — pin can no longer drift) · `stale` branch advanced past
snapshot pin, run `dev-memjective-update` · `—` no snapshot for this
slice's origin branch.

## Key findings (binding for future work)

- **<short headline>.** <one or two sentences>
- ... (3–5 bullets max; durable contract decisions only)

<!-- include only if `warnings` is non-empty -->

> ⚠ <each warning string on its own line>
```

Slice-row attribution rules:

- The five metadata rows are filled from `metadata.*_line` strings as-is.
- Slice rows come from `slices[]` in CLI-emitted order (which is master's
  roadmap order). Use `slices[i].title` for the Slice column.
- Column 2 (✓): mark when `slices[i].checked_on_most_progressed` is true.
- PR / PR state / Branch / Memj — origin-branch attribution. Each tree
  entry was opened to land exactly one slice; identify that slice by the
  strongest keyword overlap between `tree[].pr_title` and `slices[].title`,
  treated as a 1:1 match across all tree entries and slices (do not assign
  the same tree entry to multiple slices). The matched tree entry is the
  slice's origin — fill PR from `pr_url`/`pr_number`, PR state from
  `pr_state` lowercased (`open` / `merged` / `closed`), Branch from
  `branch`, and Memj directly from `memj_state`.
  - Do **not** use `checked_by_branch` ordering to pick the origin.
    Once a slice lands on master, every open downstream branch inherits
    its checkmark, so multiple branches will read as "checked" without
    having authored the slice. `checked_by_branch` is only the in-flight
    signal for column 2 (via `checked_on_most_progressed`); it is not
    the authorship signal.
  - Slices with no matching tree entry render PR / PR state / Branch / Memj
    all as `—`. Heuristic drift signals never appear in the slice rows;
    they live in `warnings` (see below).
- Memj is taken verbatim from `tree[].memj_state` (`fresh` or `stale`); a
  slice with no origin tree entry renders `—`.

Drift / unclaimed-PR rendering:

- The CLI emits unclaimed-PR advisories as strings in `warnings` (each
  prefixed with `unclaimed_pr:`). They are heuristic — open PRs whose
  titles overlap an unchecked slice but lack a snapshot. They are **not**
  promoted to slice rows; the deterministic per-slice columns must reflect
  only attached tree entries.
- Render every `warnings` string verbatim under the trailing `> ⚠` block.
  Omit the block when `warnings` is empty.

Format invariants:

- Slug in title, no other adornment.
- Metadata table is exactly five rows in the order shown.
- No "Slices in flight" / "Remaining" subheaders — column 2 is the
  in-flight signal.
- No per-slice prose summary column.
- Print to stdout only. Do not write the digest to a file, do not stash
  it in brmem, do not commit it. The user redirects output if they want
  it saved.
