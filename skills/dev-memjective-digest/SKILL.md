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
branch + PR), `drift_open_prs` (open PRs whose titles match unchecked
slices but aren't in `tree`), `findings_inputs.notes_by_branch`, and
`warnings`.

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

| #   | ✓ | Slice             | PR          | Branch     | Memj |
| --- | - | ----------------- | ----------- | ---------- | ---- |
| 1   | ✓ | <slices[0].title> | [#NNN](url) | `<branch>` | ✓    |
| ... |   |                   |             |            |      |

**Memj legend:** ✓ snapshot fresh · ↻ branch + snapshot exist but branch
deleted (merged) · ⚠ open PR matches an unchecked slice but no snapshot
(run `dev-memjective-claim`) · — no associated branch.

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
- PR / Branch / Memj: pick the first branch in `slices[i].checked_by_branch`
  whose value is true and whose entry exists in `tree`. Fill `pr_*` and
  `deleted` from that tree entry. If no such branch exists but a
  `drift_open_prs` entry's title contains words from the slice title, use
  that PR with branch `—` and Memj `⚠`. Otherwise leave PR/Branch as `—`
  and Memj as `—`.
- Memj: `✓` when the chosen tree entry's `deleted` is false; `↻` when
  `deleted` is true; `⚠` for drift; `—` when no association exists.

Format invariants:

- Slug in title, no other adornment.
- Metadata table is exactly five rows in the order shown.
- No "Slices in flight" / "Remaining" subheaders — column 2 is the
  in-flight signal.
- No per-slice prose summary column.
- Print to stdout only. Do not write the digest to a file, do not stash
  it in brmem, do not commit it. The user redirects output if they want
  it saved.
