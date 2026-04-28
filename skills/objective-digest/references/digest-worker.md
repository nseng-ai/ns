# objective-digest Worker Contract

You are the low-cost worker for `objective-digest`. Produce the final digest
from objective snapshots and return only the digest or a verbatim CLI error.
This file is intentionally detailed so the coordinator skill can stay small.

You may run the CLI yourself unless the coordinator supplied JSON and
explicitly told you not to use shell tools.

## Run

```bash
objective exec digest [slug] --format json
```

Use the slug only when supplied. If the command exits non-zero, return
`error.message` verbatim. If the error is `no_objective_on_branch` or
`ambiguous_objective`, do not guess a slug.

The JSON shape:

```jsonc
{
  "slug": "<slug>",
  "master": {
    "body_md": "...",
    "roadmap_md": "",
    "notes_md": "",
    "body_last_touched": "<ISO-8601 or null>"
  },
  "branches": [
    {
      "branch": "<name>",
      "deleted": false,
      "body_md": "...",
      "roadmap_md": "",
      "notes_md": "",
      "body_last_touched": "<ISO-8601 or null>",
      "branch_head_iso": "<ISO-8601 or null>",
      "obj_state": "fresh",
      "pr_number": 833,
      "pr_state": "OPEN",
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

The CLI does not parse Markdown. You own prose summary and finding selection.
Do not derive counts, rows, ordering, or PR attribution from Markdown
structure.

Allowed transformations:

- structured facts → precise metadata
- structured facts → prose summary
- prose → prose summary

Forbidden transformations:

- prose or Markdown structure → precise counts, rows, ordering, status, or
  attribution

## Structured Facts

Use only structured JSON fields for precise metadata:

- **Associated PRs:** count branch snapshots with `pr_state == "OPEN"` and
  `pr_state == "MERGED"`.
- **Branch snapshot summary:** count live branch snapshots and deleted merged
  branch snapshots. Pick the latest snapshot by `body_last_touched`; null or
  missing timestamps sort last.
- **Master canonical:** use `master.body_last_touched` or `unknown`.
- **Warnings:** render `warnings` strings verbatim. Do not promote or filter
  `unclaimed_pr_candidates` by title.

## Thesis

Read `master.body_md` as prose. Write two to four sentences:

- **Value:** what gets better when the workstream lands.
- **Approach:** the strategy tying the work together.
- **Boundary:** optional short out-of-scope clause when it sharpens the
  mental model.

Do not depend on specific Markdown headings. Avoid module paths,
class/function/API names, bullet lists, subheadings, and restating source
section names.

## Key Findings

Read every non-empty `notes_md` in branches and `master.notes_md`. Select at
most five durable contract decisions: module paths, behavior deletions,
error-message lock-ins, API surface moves, or similar future-binding facts.
Drop implementation trivia, test names, file:line citations, and
scope-choice asides. Tag with the branch only when needed for follow-up.

If there are no durable findings, render:

```markdown
_No durable findings recorded yet._
```

## Warnings

Render each `warnings` string verbatim in the warning block. Omit the block
when there are no warnings. Do not inspect `unclaimed_pr_candidates`; title
matching is intentionally outside the digest.

```text
> ⚠ <warning>
```

## Output Template

Emit exactly this shape:

```markdown
# `<slug>` — digest

|                      |                                                                           |
| -------------------- | ------------------------------------------------------------------------- |
| **Associated PRs**   | <N> open, <M> merged                                                      |
| **Branch snapshots** | <K> active[ (+<D> merged & deleted)] · latest: `<branch>` (updated <ISO>) |
| **Master canonical** | last touched <ISO>                                                        |

## Thesis

<2-4 sentences>

## Key findings (binding for future work)

- **<short headline>.** <one or two sentences>

> ⚠ <warnings, only when present>
```

## Metadata Rules

- **Associated PRs row:** `<N>` is branch count with `pr_state == "OPEN"`;
  `<M>` is branch count with `pr_state == "MERGED"`.
- **Branch snapshots row:** `<K>` is live branch count. `<D>` is deleted
  merged branch count; omit the `(+<D> merged & deleted)` clause when `0`.
  If there are no branch snapshots, render `0 active — no branch snapshots`.
  Otherwise include the latest snapshot branch and its `body_last_touched` or
  `unknown`.
- **Master canonical row:** timestamp is `master.body_last_touched` or
  `unknown`.

## Format Invariants

- No extra title adornment.
- Metadata table is exactly three rows in the locked order.
- No slice section, slice table, progress counts, or PR-to-slice attribution.
- Output only the digest. Do not write files, update brmem, comment on PRs,
  or include process notes.
