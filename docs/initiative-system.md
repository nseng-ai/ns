# Initiative System

## Status

Design draft. This document describes the checked-in initiative system and is
intended to be the basis for implementing initiative-related skills.

## Summary

Initiatives are checked-in markdown documents for work that spans multiple
sessions, branches, or pull requests.

They are driven by skills and prompts, not by a CLI. The repository is the
source of truth. Git provides history, review, sharing, and conflict handling.
Skills provide the workflow for creating, reading, updating, and using
initiative documents.

The system should stay simple:

- No brmem storage.
- No hidden agent state.
- No CLI requirement.
- No required frontmatter.
- No stable numbered roadmap item IDs.
- No external service audit requirement.
- The checked-out git repository is the ground truth at the time a skill runs.
- `initiative-next` is the ordinary continue-work trigger. It runs a cheap
  freshness gate before choosing next work and may invoke progress recording
  when branch or worktree evidence is newer than initiative progress.
- `initiative-record-progress` assumes durable initiative files may be stale and
  refreshes them every time it records progress.

## When To Use An Initiative

Use an initiative when the work needs durable context across sessions:

- Multi-PR refactors.
- Staged migrations.
- Broad feature work.
- Architecture changes.
- Cleanup efforts with sequencing or risk.
- Work where future agents need rationale, not just a task list.

Do not use an initiative for a small bug fix, a single obvious PR, a one-off
operational request, or a short investigation whose findings fit naturally in
chat or a PR description.

## Directory Layout

Initiatives live under `docs/initiatives/`.

```text
docs/initiatives/
  <slug>/
    initiative.md
    roadmap.md
    updates/
      2026-05-11T143217Z-short-description.md
      2026-05-12T091044Z-another-update.md
```

Each initiative is a directory. The directory name is the initiative slug. The
slug must be kebab-case and match
`^(?!.*--)[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$` — lowercase ASCII letters and
digits, single hyphens as separators, 1-50 characters, and no leading, trailing,
or consecutive hyphens.

## Core Files

### `initiative.md`

The durable explanation of the workstream.

It should answer:

- What are we trying to accomplish?
- Why does it matter?
- What is in scope?
- What is out of scope?
- What constraints matter?
- What invariants should future work preserve?
- What does done look like?
- What open questions still affect the plan?

This file should not be a progress log. It should change when the durable
understanding of the initiative changes: scope, constraints, invariants,
completion criteria, risks, or open questions.

`initiative-record-progress` treats this file as a set of current claims, not as
unquestionable truth. On every progress record, the skill checks those claims
against the update history and current checked-out repository state and edits the
file only when durable understanding has changed.

### `roadmap.md`

The current ordered work state.

Roadmap entries are fluid named work areas, not stable tickets. They can be
renamed, split, merged, reordered, or parked as understanding changes.

The roadmap is intentionally queue-shaped so users and agents can see the work
in useful sequence, with completed work checked off in place instead of moved to
a separate completion section.

Canonical top-level sections:

```markdown
# Roadmap

## Work

- [x] Completed work area.
  - Evidence: PR, docs change, tests, migration, deletion, report, release, or
    explicit decision.

- [~] Partially completed work area.
  - Artifact: Expected reviewable or verifiable output.
  - Status: What is done and what remains.

- [ ] Not-started work area.
  - Artifact: Expected reviewable or verifiable output.

## Parked

- Work intentionally deferred, blocked, rejected for now, canceled, or waiting on
  external facts.
```

Section meanings:

- `Work`: the ordered roadmap. Use checkbox markers for every work entry. `[x]`
  means durable completion evidence exists, such as merged PRs, checked-in docs,
  tests, migrations, deletions, reports, released behavior, or an explicit user
  decision. `[~]` means partially completed and carries a `Status:` sub-bullet.
  `[ ]` means not started or no durable partial-completion evidence yet.
- `Parked`: work intentionally deferred, blocked, rejected for now, canceled, or
  waiting on external facts.

The checkbox marker, not a stable ID or separate section, carries completion
state. Keep completed work in its useful roadmap position unless the sequence
itself has become misleading.

Roadmap entries should point toward concrete artifacts such as PRs, merged
commits, docs, tests, migrations, reports, deleted code, or released behavior.

The roadmap should avoid stable item numbers such as `R-001`. If an update needs
to refer to roadmap context, it should name the relevant work area in prose.

Readers should tolerate older roadmaps that use `Completed`, `In Progress`, and
`Remaining`, or legacy `Now`, `Next`, and `Later`. Read-only skills should
normalize those legacy sections into the current `Work` / `Parked` shape for
presentation and planning. `initiative-record-progress` may migrate a legacy or
stale roadmap into the canonical sections as part of its refresh when the
initiative history or current repository state justifies editing it.

### `updates/`

A chronological evidence record of progress, findings, and changes in
understanding.

Each update is a new markdown file. Existing update files should not be edited
except to correct an immediate mistake shortly after creation.

Update files do not need frontmatter. Metadata already exists in the path,
filename, Git history, commits, branches, and PRs.

The filename should begin with a UTC timestamp and include a short slug:

```text
YYYY-MM-DDTHHMMSSZ-short-description.md
```

Example:

```text
2026-05-11T143217Z-create-skill-shape.md
```

Updates are the detailed audit trail. `initiative.md` and `roadmap.md` are the
current distilled state.

## Refresh Model

Every call to `initiative-record-progress` performs two linked operations:

1. Write exactly one new update file under `updates/`.
2. Skeptically refresh `initiative.md` and `roadmap.md` from the full checked-in
   initiative history and current repository state.

The refresh is mandatory, but edits are not. If durable files are already
current, the skill should leave them unchanged and report that no durable-file
edits were needed.

The refresh source of truth is repository state, not hidden memory:

- current `initiative.md`
- current `roadmap.md`
- every existing update file
- the drafted new update
- current checked-out git repository state and relevant git history

The current durable files are useful distilled state, but they are not blindly
trusted. They are hypotheses to verify against the full update history and the
repo as currently checked out.

Repo drift is recordable progress. If a rebase, restack, trunk merge, or other
change to the checked-out repository invalidates initiative assumptions or
changes the plan, `initiative-record-progress` should record that finding and
refresh durable files even when the agent did not author new implementation
commits.

The v1 system does not require a full external-world audit on every update. It
also does not add baseline commits or hidden state to initiative files. Use Git
history and targeted repository inspection when needed to understand changed
files, recover prior versions, or explain drift.

## Progress Freshness Gate

`initiative-next` is the normal command users run when continuing an initiative.
Before selecting the next work item, it cheaply checks whether non-initiative
repository evidence is newer than the latest initiative progress evidence.

For `docs/initiatives/<slug>/`, the gate:

1. Finds the latest committed progress anchor, preferring the latest commit that
   touched `updates/` and falling back to the latest commit that touched
   `initiative.md` or `roadmap.md`.
2. Blocks automatic recording when initiative docs are dirty, because
   progress-state work is already in flight.
3. Checks for dirty worktree changes outside `docs/initiatives/**`.
4. Checks for commits in `<anchor>..HEAD` outside `docs/initiatives/**`.
5. Runs `initiative-record-progress` before next-work selection when newer
   non-initiative evidence exists, then re-reads initiative state and chooses the
   next step.

If no committed anchor exists, the gate skips automatic recording unless the
user supplied clear progress to preserve. If only initiative docs are dirty, the
gate reports that progress recording is blocked rather than creating a second
in-flight update. If the deeper initiative read later discovers stale durable
docs, `initiative-next` may run one progress-recording refresh pass and restart
selection.

The gate uses Git ancestry/topology, not wall-clock timestamps, hidden state,
frontmatter, baseline files, or Graphite metadata. Graphite-style stacks need no
special runtime dependency: on a child branch, an inherited parent-branch update
is the progress anchor, and child commits after that anchor appear in
`<anchor>..HEAD` through ordinary Git history.

## Skill Suite

The initiative system is operated through skills. The skills may share templates
and references, but the checked-in files remain the durable state.

### `initiative-create`

Creates a new initiative directory after enough discovery to avoid inventing
context.

Writes:

- `initiative.md`
- `roadmap.md`
- `updates/`

It should not create an initial update file unless there is specific session
context worth preserving separately from the created documents.

### `initiative-current`

Reads an existing initiative and summarizes current state.

Inputs:

- `initiative.md`
- `roadmap.md`
- recent or relevant files in `updates/`
- current branch state
- relevant git history when useful

This skill is read-only. It presents an effective roadmap state by combining the
durable roadmap with progress updates. For example, if `roadmap.md` still lists
an item as incomplete but a later update records a completed artifact for that
item, `initiative-current` should show the item checked off in the ordered work
list and note that `initiative-record-progress` can record the stale-state
finding and refresh durable files.

### `initiative-next`

Chooses the next useful piece of work and is the ordinary trigger for progress
recording before continuation.

It should resolve the initiative, run the cheap freshness gate, and invoke
`initiative-record-progress` first when newer non-initiative branch or worktree
evidence exists. After any recording or refresh, it should re-read initiative
state, identify the highest-value unblocked roadmap area, and recommend a
concrete implementation shape. It should prefer `[~]` partially completed work,
then the top useful `[ ]` work in the ordered roadmap.

Default behavior is read-only. It may mutate initiative files only through the
bounded `initiative-record-progress` workflow when the freshness gate triggers or
when the normal read finds durable files stale enough to obscure the next step.
It may suggest branch names, PR shape, validation work, or documentation work,
but it should not create branches, commit changes, or implement source changes.

If automatic recording is blocked or evidence is too vague to preserve durably,
it should report the gate status and continue only when the next step remains
safe to recommend.

### `initiative-record-progress`

Records progress, findings, decisions, blockers, or repo drift from the current
session or branch. It may be invoked explicitly by the user or automatically by
`initiative-next` after the freshness gate finds newer branch/worktree evidence.

When progress recording is warranted, it writes exactly one new file under
`updates/`.

Also refreshes:

- `initiative.md`
- `roadmap.md`

The refresh may make no durable-file edits. When it does edit durable files, it
should be proactive but evidence-bound: check completed roadmap items in place,
mark partially completed items with `[~]` and `Status:` when useful, mark
not-started items with `[ ]`, park obsolete work, adjust sequencing, revise
completion criteria, and update durable scope, constraints, invariants, risks, or
open questions when the initiative history and current repository state justify
it.

It should not rewrite existing update files.

### `initiative-close`

Marks an initiative as complete or intentionally abandoned.

The preferred v1 behavior is to update `initiative.md` with closure context and
leave the directory in place. Deleting the initiative directory is discouraged
because checked-in initiative history is useful.

## Create Skill Intake

`initiative-create` should ask only for information that cannot be safely
inferred from the repo or the user's initial request.

If the initial request already answers most of these questions, ask only the
missing blocker questions. If there is enough context to proceed, create a draft
and record assumptions explicitly.

Recommended intake:

1. What should this initiative accomplish?
2. Why does it matter?
3. What is definitely in scope?
4. What is definitely out of scope?
5. What does done look like?
6. Are there known constraints or preferences?
7. Where should I look first?

The skill should keep interrogation short. The goal is not to make the user
author the initiative. The goal is to get enough grounding for the agent to
inspect the repo and draft useful checked-in documents.

## Create Skill Discovery

Before writing files, `initiative-create` should do targeted discovery:

- Read relevant project instructions such as `AGENTS.md`.
- Search for existing initiatives under `docs/initiatives/`.
- Check whether a close existing initiative should be continued instead of
  creating a duplicate.
- Inspect likely packages, modules, docs, tests, and adjacent workflows.
- Identify constraints, risk boundaries, and validation surfaces.
- Capture unknowns honestly instead of pretending the roadmap is complete.

Discovery should be proportional to the request. A broad architecture initiative
needs more discovery than a narrowly scoped cleanup effort.

## `initiative.md` Template

```markdown
# Initiative Title

## Thesis

One paragraph explaining the durable purpose of the initiative. This should
remain useful even if the roadmap changes.

## Motivation

Why this work matters. Describe the pain, risk, opportunity, or capability that
justifies tracking this as an initiative.

## Scope

- What is included.
- Systems, packages, workflows, behaviors, or docs involved.

## Non-Goals

- What is explicitly excluded.
- Adjacent tempting work that should not be pulled in.

## Constraints

- Compatibility, architecture, sequencing, performance, ownership, review, or
  rollout constraints.

## Invariants

- Things future work must preserve.
- Design rules that should remain true across implementation changes.

## Completion Criteria

- [ ] Observable end state.
- [ ] Validation, docs, tests, migration, or cleanup requirement.
- [ ] Anything that must be true before closing the initiative.

## Open Questions

- Unknowns discovered during creation or refresh.
```

## `roadmap.md` Template

```markdown
# Roadmap

## Work

- [x] Completed work area.
  - Evidence: PR, docs change, tests, migration, deletion, report, release, or
    explicit decision.

- [~] Partially completed work area.
  - Artifact: Expected reviewable or verifiable output.
  - Status: What is done and what remains.

- [ ] Named work area.
  - Artifact: PR, docs change, tests, migration, deletion, report, or other
    reviewable output.
  - Notes: Optional context.

- [ ] Named work area.
  - Artifact: Expected reviewable or verifiable output.

## Parked

- Work intentionally deferred, blocked, rejected for now, canceled, or waiting on
  external facts.
```

## Update File Template

```markdown
# Short Update Title

## Summary

What changed, what was learned, what decision was made, or what repo drift was
observed.

## Roadmap Context

Name the roadmap area this relates to, if any. When relevant, state whether the
update completes it, partially advances it, blocks it, or discovers new follow-up
work. Do not use stable numbered IDs.

## Initiative Impact

Explain how this affects scope, constraints, invariants, completion criteria,
risks, or future work.

## Follow-Ups

- Concrete follow-up, if any.
```

## Authoring Rules

- Prefer prose that will still make sense after branches are merged and PRs are
  closed.
- Keep roadmap entries outcome-oriented and artifact-backed.
- Use `Work` and `Parked` for new roadmaps and for refreshes that edit stale
  roadmaps.
- Use checkbox markers for every `Work` entry: `[x]` for completed work, `[~]`
  for partially completed work, and `[ ]` for not-started work. Use plain bullets
  for parked work.
- Do not add metadata fields that duplicate Git metadata.
- Do not use frontmatter unless a later skill has a concrete need for it.
- Do not rewrite update files during refresh.
- Do not treat durable files as blindly authoritative; refresh them from the
  initiative history and current repository state.
- Do not treat updates as canonical truth by themselves. They are evidence to be
  read and distilled.
- Preserve rationale and invariants even when implementation details change.
- Record uncertainty as open questions or parked work.

## Open Design Questions

- Whether closed initiatives should stay in place with closure context or move
  under `docs/initiatives/closed/`.
- Whether update filenames should include the current branch slug.
- Whether initiative skills should share one combined `initiative` skill or
  separate operation-specific skills.
- Whether a dedicated readability compaction workflow becomes necessary after the
  refresh model has real usage.
- Whether a future refresh should compare against external systems beyond the
  checked-out repository.
