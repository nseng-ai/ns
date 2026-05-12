---
name: initiative-next
description: Choose the next useful piece of work for an existing checked-in initiative under docs/initiatives. Use when the user asks what to do next, to continue an initiative, to plan the next PR/branch, or to turn initiative roadmap state into a concrete next action.
allowed-tools:
  - "Read"
  - "Bash(find *)"
  - "Bash(rg *)"
  - "Bash(git *)"
  - "Bash(ls *)"
  - "Bash(test *)"
---

Initiatives are checked-in markdown workstreams under `docs/initiatives/`. This
skill reads initiative state and recommends the next concrete, reviewable step.
Read-only: no edits, branches, commits, or implementation. If progress or drift
needs recording, recommend `initiative-record-progress`.

## When To Use

Use when the user asks to choose the next step, continue an initiative, plan
the next PR/branch/stack/investigation/docs change, or pick the highest-value
unblocked roadmap area.

Skip for: creating a new initiative, recording progress, refreshing stale docs,
closing an initiative, or implementation itself.

## Inputs

Accept an optional initiative slug or path.

If none provided: inspect `docs/initiatives/`. Use the only initiative if
exactly one exists; otherwise prefer the one matching the current branch name.
If still ambiguous, list options and ask.

Never invent slugs. Never infer hidden state from brmem or other agent memory.

## Workflow

### 1. Resolve the initiative

```bash
find docs/initiatives -mindepth 1 -maxdepth 1 -type d | sort
git branch --show-current
```

When a slug or path is supplied, verify the directory exists and contains
`initiative.md`. If not, stop and report the mismatch.

### 2. Load initiative state

Always read `initiative.md` and `roadmap.md` (if present). List update files
newest-first and read the most recent 3–5:

```bash
find docs/initiatives/<slug>/updates -maxdepth 1 -type f -name '*.md' | sort -r
```

Read more updates only when the roadmap is ambiguous, recent updates supersede
each other, durable files appear stale, or the user asks for fuller review.

Also read when useful: current git branch and worktree status, recent git
history, targeted source/docs/tests needed to make the recommendation concrete.
Keep source inspection proportional — select and shape the next action, do not
audit the repo.

### 3. Summarize current state

Extract:

- initiative title and thesis
- scope and non-goals that constrain next work
- completion criteria and their `[ ]` / `[~]` / `[x]` status
- open questions and constraints
- roadmap checklist items and parked work
- recent progress, findings, blockers, or decisions from updates

### 4. Select the next roadmap area

Use `roadmap.md` as an ordered checklist. Prefer the highest-value unblocked
item in this order:

1. an in-progress `[~]` item that should be completed or unblocked
2. the first unblocked `[ ]` item in checklist order
3. another unblocked `[ ]` item when the earlier item is blocked, too broad, or
   lower-value given current constraints
4. `Parked` work only when the user asks or a blocker has clearly cleared

Skip `[x]` items unless the user asks to revisit. Within these rules, prefer
work that is outcome-oriented, tied to a concrete artifact, small enough for a
single reviewable change, risk-reducing or sequence-enabling, aligned with
completion criteria, and not invalidated by recent updates or repo drift.

Roadmap entries are fluid named work areas, not stable numbered IDs. Refer to
them by prose title or short label. Do not invent IDs like `R-001`.

If no single next step is clearly best, present 2–3 candidates with short
rationales and ask the user to choose.

### 5. Recommend implementation shape

Pick the smallest safe shape:

- **single PR** — cohesive, testable
- **short stack** — ordered, separately reviewable, lands together
- **docs-only** — documentation, skill text, README/help, planning
- **investigation** — resolve unknowns first
- **split first** — too broad, mixed, or lacks acceptance criteria
- **ask** — genuinely ambiguous tradeoff requiring human preference

When useful, suggest a short lowercase hyphenated branch slug. Check for local
collision before presenting:

```bash
git branch --list <candidate-branch-slug>
```

If collision exists, say so and ask. Do not auto-resolve with a suffix.

### 6. Synthesize

Gather files to inspect, expected artifact, validation plan, and risks. See
**Final Response** below for the full output spec. Stop at recommendation; do
not implement.

## Staleness Handling

Recommend `initiative-record-progress` before implementation when recent
updates or repo facts contradict `initiative.md`/`roadmap.md`, statuses are
stale enough to obscure what's next, completion criteria no longer match
direction, or repo drift after rebase/restack changes the plan.

If durable files are current but verbose, recommend curation/compaction —
non-blocking; still recommend the next action.

## Final Response

Return:

- initiative slug and title
- concise current-state summary
- selected roadmap work area + why it's the best next step
- recommended shape (`single PR`, `short stack`, `docs-only`, `investigation`,
  `split first`, or `ask`)
- suggested branch slug + collision result, when useful
- first files or areas to inspect
- expected artifact (PR, docs, tests, migration, deletion, report, behavior)
- validation plan (tests, checks, manual review, evidence)
- risks, blockers, or open questions
- after-work reminder: record progress with `initiative-record-progress`; it
  will also refresh `initiative.md` and `roadmap.md`
