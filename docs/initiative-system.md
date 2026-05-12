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

The roadmap is intentionally state-shaped so users and agents can see what has
been done, what is underway, what remains, and what has been deferred without
reconstructing the plan from the update log.

Canonical top-level sections:

```markdown
# Roadmap

## Completed

- Completed work area.
  - Evidence: PR, docs change, tests, migration, deletion, report, release, or
    explicit decision.

## In Progress

- [ ] Partially completed work area.
  - Artifact: Expected reviewable or verifiable output.
  - Status: What is done and what remains.

## Remaining

- [ ] Not-started work area.
  - Artifact: Expected reviewable or verifiable output.

## Parked

- Work intentionally deferred, blocked, rejected for now, canceled, or waiting on
  external facts.
```

Section meanings:

- `Completed`: work areas with durable evidence of completion, such as merged
  PRs, checked-in docs, tests, migrations, deletions, reports, released behavior,
  or an explicit user decision.
- `In Progress`: work areas that are partially complete and have clear remaining
  work.
- `Remaining`: the ordered queue of incomplete roadmap areas.
- `Parked`: work intentionally deferred, blocked, rejected for now, canceled, or
  waiting on external facts.

Use plain bullets for `Completed` and `Parked`. Use checkboxes for active
incomplete work in `In Progress` and `Remaining` when useful. The section, not a
stable ID, carries the item's state.

Roadmap entries should point toward concrete artifacts such as PRs, merged
commits, docs, tests, migrations, reports, deleted code, or released behavior.

The roadmap should avoid stable item numbers such as `R-001`. If an update needs
to refer to roadmap context, it should name the relevant work area in prose.

Readers should tolerate older roadmaps that use `Now`, `Next`, and `Later`.
Read-only skills should normalize those legacy sections into the current
ontology for presentation and planning. `initiative-record-progress` may migrate
a legacy or stale roadmap into the canonical sections as part of its refresh
when the initiative history or current repository state justifies editing it.

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
item, `initiative-current` should present the item under `Completed` and note
that `initiative-record-progress` can record the stale-state finding and refresh
durable files.

### `initiative-next`

Chooses the next useful piece of work.

It should read the initiative state, identify the highest-value unblocked roadmap
area, and recommend a concrete implementation shape. It should prefer unblocked
`In Progress` work first, then the top useful `Remaining` work. It may suggest
branch names, PR shape, validation work, or documentation work, but it does not
mutate initiative files.

If recent updates or repository facts show durable files are stale enough to
obscure the next step, it should recommend `initiative-record-progress` before
implementation so the stale-state finding can be recorded and durable files can
be refreshed.

### `initiative-record-progress`

Records progress, findings, decisions, blockers, or repo drift from the current
session or branch.

Always writes exactly one new file under `updates/`.

Also refreshes:

- `initiative.md`
- `roadmap.md`

The refresh may make no durable-file edits. When it does edit durable files, it
should be proactive but evidence-bound: move roadmap items among `Completed`,
`In Progress`, `Remaining`, and `Parked`; revise completion criteria; park
obsolete work; adjust sequencing; and update durable scope, constraints,
invariants, risks, or open questions when the initiative history and current
repository state justify it.

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

## Completed

- Completed work area.
  - Evidence: PR, docs change, tests, migration, deletion, report, release, or
    explicit decision.

## In Progress

- [ ] Partially completed work area.
  - Artifact: Expected reviewable or verifiable output.
  - Status: What is done and what remains.

## Remaining

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
- Use `Completed`, `In Progress`, `Remaining`, and `Parked` for new roadmaps and
  for refreshes that edit stale roadmaps.
- Use plain bullets, not checkboxes, for completed and parked work.
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
