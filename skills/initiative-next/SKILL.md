---
name: initiative-next
description: Choose the next useful piece of work for an existing checked-in initiative under docs/initiatives, using a cheap freshness gate to record newer branch/worktree evidence first when needed.
allowed-tools:
  - "Read"
  - "Write"
  - "Edit"
  - "Bash(find *)"
  - "Bash(rg *)"
  - "Bash(git *)"
  - "Bash(test *)"
  - "Bash(date -u *)"
  - "Bash(mkdir -p *)"
---

# initiative-next

Recommend the next concrete, reviewable piece of work for an existing
initiative.

Initiatives are checked-in markdown workstreams under `docs/initiatives/`.
This skill normally reads initiative state and returns a plan. Before choosing,
it checks whether non-initiative repository evidence is newer than the latest
initiative progress anchor. It mutates only when that freshness gate, or a later
stale-state check, requires the bounded `initiative-record-progress` workflow.

## When To Use

Use this skill when the user asks to:

- choose the next step for an initiative
- continue an initiative
- plan the next PR, branch, stack, investigation, or docs change
- decide what roadmap area is highest-value and unblocked

Do not use this skill to create a new initiative, close an initiative, or
perform the implementation itself. If the user's primary request is to record a
known update rather than choose next work, use `initiative-record-progress`
directly. This skill may invoke progress recording automatically before
selection when repository evidence is fresher than initiative progress.

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

Default behavior is read-only.

This skill may mutate only when the freshness gate triggers or when the normal
initiative read finds durable files stale enough to require one refresh before
safe next-work selection. In that case, run the same bounded mutations as
`initiative-record-progress`:

- create `docs/initiatives/<slug>/updates/` if needed
- write exactly one new markdown update file when concrete durable evidence
  exists
- edit `docs/initiatives/<slug>/initiative.md`
- edit `docs/initiatives/<slug>/roadmap.md`

This skill must not:

- mutate initiative files when the gate is clean, skipped, or blocked
- edit existing update files, except for an immediate correction during the same
  response before final reporting
- create a branch
- commit changes
- implement source, test, or docs changes
- use brmem or hidden agent state
- add frontmatter, hidden baseline files, stable roadmap item IDs, or a Graphite
  dependency

If durable files are factually current but hard to read, note the readability
issue without naming a separate workflow.

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

When no slug is supplied and multiple initiatives exist, ask the user to choose
before running the freshness gate or doing any mutation.

### 2. Run the cheap freshness gate

Run this before deep source inspection and before selecting work. Use git
ancestry/topology, not wall-clock timestamps. Do not add hidden state,
frontmatter, baseline files, or a Graphite dependency.

First check whether initiative docs are already dirty:

```bash
git status --short -- docs/initiatives/<slug>
```

If output is non-empty, set progress gate status to `blocked`. Do not
auto-record; progress-state work is already in flight. Continue read-only next
selection only if the dirty initiative docs are coherent enough to use.

Find the latest committed initiative progress anchor:

```bash
git log -1 --format=%H -- docs/initiatives/<slug>/updates
git log -1 --format=%H -- \
  docs/initiatives/<slug>/initiative.md \
  docs/initiatives/<slug>/roadmap.md
```

Prefer the latest commit touching `updates/`. Fall back to the latest commit
touching `initiative.md` or `roadmap.md`. If no committed anchor exists, set
progress gate status to `skipped` and do not auto-record unless the user supplied
clear concrete progress to preserve.

Check for newer non-initiative evidence:

```bash
git status --short -- . ':(exclude)docs/initiatives/**'
git log --oneline <anchor>..HEAD -- . ':(exclude)docs/initiatives/**'
```

If either command reports evidence, the gate triggers. If neither reports
evidence, set progress gate status to `clean` and continue read-only.

Use these statuses:

- `clean`: anchor exists and no newer non-initiative evidence was found
- `recorded`: progress workflow wrote an update, and possibly refreshed durable
  files
- `skipped`: no committed anchor exists, or the progress workflow found no
  concrete durable update to write
- `blocked`: initiative selection is unresolved, initiative docs are dirty, or a
  safe automatic recording decision cannot be made

### 3. Record progress when the gate triggers

When the gate triggers, run the `initiative-record-progress` workflow for this
initiative before choosing next work. Use the same evidence standards and
mutation boundary as that skill.

Automatic recording is conservative:

- Write only when branch/worktree evidence contains concrete durable progress,
  findings, decisions, blockers, repo drift, or follow-ups.
- Skip writing when evidence is vague, ceremonial, too in-progress to preserve,
  or cannot be confidently assigned to this initiative.
- If skipped, report why and continue read-only only when the next action is
  still clear.

After any write, re-read `initiative.md`, `roadmap.md`, and recent updates before
summarizing state or choosing next work.

### 4. Load initiative state

Read `initiative.md` and `roadmap.md`, if present.

List update files newest-first and read the most recent few:

```bash
find docs/initiatives/<slug>/updates -maxdepth 1 -type f -name '*.md' | sort -r
```

Default to the most recent 3-5 updates. Read more only when the roadmap is
ambiguous, recent updates appear to supersede each other, or the user asks for a
fuller review.

### 5. Summarize current state

Extract:

- initiative title and thesis
- scope and non-goals that constrain next work
- completion criteria
- open questions and constraints
- effective roadmap state: ordered `Work` entries with `[x]`, `[~]`, and `[ ]`
  boxes, plus `Parked`
- recent progress, findings, blockers, or decisions from updates

If this normal read finds that durable files conflict with recent updates or
repo facts, and no progress workflow has already run this turn, run one
`initiative-record-progress` refresh pass, then restart at step 4. If the refresh
is skipped or blocked, report why and continue only when the next action remains
safe to recommend.

### 6. Select the next roadmap area

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

### 7. Recommend implementation shape

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

### 8. Make the next action concrete

For the selected work area, identify:

- first files or directories to inspect
- likely implementation or documentation surface
- expected artifact: PR, docs change, tests, migration, deletion, report, or
  released behavior
- validation plan: tests, checks, manual review, or evidence to gather
- risks, blockers, or open questions

Do not start implementing. Stop at an actionable recommendation.

## Staleness Handling

Run one `initiative-record-progress` refresh pass before implementation when:

- recent updates or repo facts clearly contradict `initiative.md` or `roadmap.md`
- several completed items are still marked `[~]` or `[ ]` in the roadmap
- roadmap areas are too stale or vague to select from
- completion criteria no longer match the initiative's current direction
- repo drift after a rebase, restack, or trunk update changes the plan

If the refresh pass already ran, was skipped, or is blocked, do not loop. Report
the status and either recommend from the best reliable state or ask for the
missing clarification.

If durable files are factually current but verbose, note the readability issue;
still recommend the next action when it is clear.

## Final Response

Return:

- initiative slug and title
- progress gate status: `clean`, `recorded`, `skipped`, or `blocked`, with the
  reason
- if `recorded`, the update path and which durable files changed
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
- when relevant, a soft post-work note that rerunning `initiative-next` will
  perform the freshness gate again
