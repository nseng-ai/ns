---
name: initiative-next
description: Choose the next useful piece of work for an existing checked-in initiative under docs/initiatives. Use when the user asks what to do next, to continue an initiative, to plan the next PR/branch, or to turn initiative roadmap state into a concrete next action.
allowed-tools:
  - "Read"
  - "Bash(find *)"
  - "Bash(rg *)"
  - "Bash(git *)"
  - "Bash(test *)"
---

# initiative-next

Recommend the next concrete, reviewable piece of work for an existing
initiative.

Initiatives are checked-in markdown workstreams under `docs/initiatives/`.
This skill reads initiative state and returns a plan. It does not edit files,
create branches, commit changes, or implement the work.

## When To Use

Use this skill when the user asks to:

- choose the next step for an initiative
- continue an initiative
- plan the next PR, branch, stack, investigation, or docs change
- decide what roadmap area is highest-value and unblocked

Do not use this skill to create a new initiative, record progress, refresh
durable files, close an initiative, or perform the implementation itself.

## Inputs

Accept an optional initiative slug or path from the prompt.

If no initiative is named:

1. Inspect `docs/initiatives/`.
2. If exactly one initiative exists, use it.
3. If multiple initiatives exist, list the options and ask the user to choose.

Never invent an initiative slug. Do not infer hidden state from brmem or other
agent memory.

## Reads

Always read:

- `docs/initiatives/<slug>/initiative.md`
- `docs/initiatives/<slug>/roadmap.md`, if present
- recent files in `docs/initiatives/<slug>/updates/`, if present

Also read when useful:

- current git branch and worktree status
- recent git history for the current branch
- targeted source, docs, or tests needed to make the recommendation concrete

Keep source inspection proportional. This skill should select and shape the
next action, not audit the whole repository.

## Mutation Boundary

This skill is read-only.

Do not:

- edit `initiative.md`
- edit `roadmap.md`
- create or edit files under `updates/`
- create a branch
- commit changes
- implement source, test, or docs changes
- use brmem or hidden agent state

If progress needs to be recorded, recommend `initiative-record-progress`. If
durable initiative state is stale, recommend `initiative-record-progress` so the
stale-state finding can be recorded and durable files can be refreshed. If
durable files are factually current but hard to read, note the readability issue
without naming a separate workflow.

## Workflow

### 1. Resolve the initiative

Find the initiative directory.

Useful commands:

```bash
find docs/initiatives -mindepth 1 -maxdepth 1 -type d | sort
git branch --show-current
```

When a slug or path is supplied, verify that the directory exists and contains
`initiative.md`. If it does not, stop and report the mismatch.

### 2. Load initiative state

Read `initiative.md` and `roadmap.md`, if present.

List update files newest-first and read the most recent few:

```bash
find docs/initiatives/<slug>/updates -maxdepth 1 -type f -name '*.md' | sort -r
```

Default to the most recent 3-5 updates. Read more only when the roadmap is
ambiguous, recent updates appear to supersede each other, or the user asks for a
fuller review.

### 3. Summarize current state

Extract:

- initiative title and thesis
- scope and non-goals that constrain next work
- completion criteria
- open questions and constraints
- effective roadmap state: ordered `Work` entries with `[x]`, `[~]`, and `[ ]`
  boxes, plus `Parked`
- recent progress, findings, blockers, or decisions from updates

If the durable files conflict with recent updates, treat the updates as
evidence and report that `initiative-record-progress` may be needed to record the
finding and refresh durable files. Do not rewrite the initiative from this skill.

### 4. Select the next roadmap area

Build the effective roadmap state before selecting work.

Use the current ontology:

- `Work`: the ordered roadmap. `[x]` entries are already done and should not be
  selected. `[~]` entries are partially complete. `[ ]` entries are not started
  or have no durable partial-completion evidence yet.
- `Parked`: deferred, blocked, rejected-for-now, canceled, or
  waiting-on-external-facts work.

Backward compatibility:

- If `roadmap.md` uses legacy `Completed`, `In Progress`, `Remaining`, `Now`,
  `Next`, or `Later` sections, normalize entries into ordered `Work` candidates
  plus `Parked`, preserving the best available order.
- Keep `Parked` entries parked.
- Use recent updates as evidence to skip completed work or treat partial work as
  partially complete.

Prefer the highest-value unblocked item in this order:

1. `[~]` work, because finishing partial work reduces drift
2. top useful `[ ]` work in the ordered roadmap
3. `Parked` work only when the user asks or a blocker has clearly cleared

Within the relevant section, prefer work that is:

- unblocked
- outcome-oriented
- tied to a concrete artifact
- small enough for a single reviewable change
- risk-reducing or sequence-enabling
- aligned with completion criteria
- not invalidated by recent updates

Roadmap entries are fluid named work areas, not stable numbered IDs. Refer to
entries by their prose title or short descriptive label. Do not invent IDs like
`R-001`.

If no single next step is clearly best, present 2-3 candidates with short
rationales and ask the user to choose.

### 5. Recommend implementation shape

Choose the smallest safe shape:

- **single PR** — cohesive, testable implementation or cleanup
- **short stack** — ordered changes that should be reviewed separately but land
  together
- **docs-only** — documentation, skill text, README/help text, or planning docs
- **investigation** — unknowns must be resolved before implementation
- **split first** — roadmap area is too broad, mixed, or lacks acceptance
  criteria
- **ask** — genuinely ambiguous tradeoff requiring human preference

When useful, suggest a branch slug. Keep it lowercase, hyphenated, and short.
Before presenting it as available, check for a local branch collision:

```bash
git branch --list <candidate-branch-slug>
```

If a collision exists, say so and ask for a human choice. Do not auto-resolve by
silently appending a suffix.

### 6. Make the next action concrete

For the selected work area, identify:

- first files or directories to inspect
- likely implementation or documentation surface
- expected artifact: PR, docs change, tests, migration, deletion, report, or
  released behavior
- validation plan: tests, checks, manual review, or evidence to gather
- risks, blockers, or open questions

Do not start implementing. Stop at an actionable recommendation.

## Staleness Handling

Recommend `initiative-record-progress` before implementation when:

- recent updates or repo facts clearly contradict `initiative.md` or `roadmap.md`
- several completed items are still marked `[~]` or `[ ]` in the roadmap
- roadmap areas are too stale or vague to select from
- completion criteria no longer match the initiative's current direction
- repo drift after a rebase, restack, or trunk update changes the plan

If durable files are factually current but verbose, note the readability issue;
still recommend the next action when it is clear.

## Final Response

Return:

- initiative slug and title
- concise current-state summary
- selected roadmap work area
- why it is the best next step
- recommended shape: `single PR`, `short stack`, `docs-only`, `investigation`,
  `split first`, or `ask`
- suggested branch slug and collision result, when useful
- first files or areas to inspect
- expected artifact
- validation plan
- risks or blockers
- after-work reminder: record progress with `initiative-record-progress`; it
  will also refresh `initiative.md` and `roadmap.md` when evidence shows they are
  stale
