# Initiative System

## Status

Design draft. This document describes the proposed checked-in initiative system and is intended to be the basis for implementing initiative-related skills.

## Summary

Initiatives are checked-in markdown documents for work that spans multiple sessions, branches, or pull requests.

They are driven by skills and prompts, not by a CLI. The repository is the source of truth. Git provides history, review, sharing, and conflict handling. Skills provide the workflow for creating, reading, updating, and curating initiative documents.

The system should stay simple:

- No brmem storage.
- No hidden agent state.
- No CLI requirement.
- No required frontmatter.
- No stable numbered roadmap item IDs.
- No automatic rewrite after every task.

## When To Use An Initiative

Use an initiative when the work needs durable context across sessions:

- Multi-PR refactors.
- Staged migrations.
- Broad feature work.
- Architecture changes.
- Cleanup efforts with sequencing or risk.
- Work where future agents need rationale, not just a task list.

Do not use an initiative for a small bug fix, a single obvious PR, a one-off operational request, or a short investigation whose findings fit naturally in chat or a PR description.

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

Each initiative is a directory. The directory name is the initiative slug. The slug must be kebab-case and match `^(?!.*--)[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$` — lowercase ASCII letters and digits, single hyphens as separators, 1-50 characters, and no leading, trailing, or consecutive hyphens.

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

This file should change only when the durable understanding of the initiative changes.

### `roadmap.md`

The current working roadmap.

Roadmap entries are fluid named work areas, not stable tickets. They can be renamed, split, merged, moved, or deleted as understanding changes.

Roadmap entries should point toward concrete artifacts such as PRs, merged commits, docs, tests, migrations, reports, deleted code, or released behavior.

The roadmap should avoid stable item numbers such as `R-001`. If an update needs to refer to roadmap context, it should name the relevant work area in prose.

### `updates/`

A chronological record of progress, findings, and changes in understanding.

Each update is a new markdown file. Existing update files should not be edited except to correct an immediate mistake shortly after creation.

Update files do not need frontmatter. Metadata already exists in the path, filename, Git history, commits, branches, and PRs.

The filename should begin with a UTC timestamp and include a short slug:

```text
YYYY-MM-DDTHHMMSSZ-short-description.md
```

Example:

```text
2026-05-11T143217Z-create-skill-shape.md
```

## Skill Suite

The initiative system is operated through skills. The skills may share templates and references, but the checked-in files remain the durable state.

### `initiative-create`

Creates a new initiative directory after enough discovery to avoid inventing context.

Writes:

- `initiative.md`
- `roadmap.md`
- `updates/`

It should not create an initial update file unless there is specific session context worth preserving separately from the created documents.

### `initiative-current`

Reads an existing initiative and summarizes current state.

Inputs:

- `initiative.md`
- `roadmap.md`
- recent files in `updates/`
- current branch state
- relevant git history when useful

This skill is read-only.

### `initiative-next`

Chooses the next useful piece of work.

It should read the initiative state, identify the highest-value unblocked roadmap area, and recommend a concrete implementation shape. It may suggest branch names, PR shape, validation work, or documentation work, but it does not mutate initiative files.

### `initiative-update`

Records progress from the current session or branch.

Writes exactly one new file under `updates/`. It should not rewrite `initiative.md`, `roadmap.md`, or existing updates.

### `initiative-curate`

Folds accumulated learning back into durable files.

May edit:

- `initiative.md`
- `roadmap.md`

Should not rewrite files in `updates/`.

Use this skill when enough update files have accumulated that the durable initiative description or roadmap is stale.

### `initiative-close`

Marks an initiative as complete or intentionally abandoned.

The preferred v1 behavior is to update `initiative.md` with closure context and leave the directory in place. Deleting the initiative directory is discouraged because checked-in initiative history is useful.

## Create Skill Intake

`initiative-create` should ask only for information that cannot be safely inferred from the repo or the user's initial request.

If the initial request already answers most of these questions, ask only the missing blocker questions. If there is enough context to proceed, create a draft and record assumptions explicitly.

Recommended intake:

1. What should this initiative accomplish?
2. Why does it matter?
3. What is definitely in scope?
4. What is definitely out of scope?
5. What does done look like?
6. Are there known constraints or preferences?
7. Where should I look first?

The skill should keep interrogation short. The goal is not to make the user author the initiative. The goal is to get enough grounding for the agent to inspect the repo and draft useful checked-in documents.

## Create Skill Discovery

Before writing files, `initiative-create` should do targeted discovery:

- Read relevant project instructions such as `AGENTS.md`.
- Search for existing initiatives under `docs/initiatives/`.
- Check whether a close existing initiative should be continued instead of creating a duplicate.
- Inspect likely packages, modules, docs, tests, and adjacent workflows.
- Identify constraints, risk boundaries, and validation surfaces.
- Capture unknowns honestly instead of pretending the roadmap is complete.

Discovery should be proportional to the request. A broad architecture initiative needs more discovery than a narrowly scoped cleanup effort.

## `initiative.md` Template

```markdown
# Initiative Title

## Thesis

One paragraph explaining the durable purpose of the initiative. This should remain useful even if the roadmap changes.

## Motivation

Why this work matters. Describe the pain, risk, opportunity, or capability that justifies tracking this as an initiative.

## Scope

- What is included.
- Systems, packages, workflows, behaviors, or docs involved.

## Non-Goals

- What is explicitly excluded.
- Adjacent tempting work that should not be pulled in.

## Constraints

- Compatibility, architecture, sequencing, performance, ownership, review, or rollout constraints.

## Invariants

- Things future work must preserve.
- Design rules that should remain true across implementation changes.

## Completion Criteria

- [ ] Observable end state.
- [ ] Validation, docs, tests, migration, or cleanup requirement.
- [ ] Anything that must be true before closing the initiative.

## Open Questions

- Unknowns discovered during creation.
```

## `roadmap.md` Template

```markdown
# Roadmap

## Now

- [ ] Named work area.
  - Artifact: PR, docs change, tests, migration, deletion, report, or other reviewable output.
  - Notes: Optional context.

- [ ] Named work area.
  - Artifact: Expected reviewable or verifiable output.

## Next

- [ ] Named work area.
  - Artifact: Expected reviewable or verifiable output.

## Later

- [ ] Named work area.
  - Artifact: Expected reviewable or verifiable output.

## Parked

- Work intentionally deferred, rejected, or waiting on external facts.
```

## Update File Template

```markdown
# Short Update Title

## Summary

What changed, what was learned, or what decision was made.

## Roadmap Context

Name the roadmap area this relates to, if any. Do not use stable numbered IDs.

## Initiative Impact

Explain how this affects scope, constraints, invariants, completion criteria, risks, or future work.

## Follow-Ups

- Concrete follow-up, if any.
```

## Authoring Rules

- Prefer prose that will still make sense after branches are merged and PRs are closed.
- Keep roadmap entries outcome-oriented and artifact-backed.
- Do not add metadata fields that duplicate Git metadata.
- Do not use frontmatter unless a later skill has a concrete need for it.
- Do not rewrite update files during curation.
- Do not treat updates as canonical truth. They are evidence to be read and curated.
- Preserve rationale and invariants even when implementation details change.
- Record uncertainty as open questions or parked work.

## Open Design Questions

- Whether closed initiatives should stay in place with closure context or move under `docs/initiatives/closed/`.
- Whether update filenames should include the current branch slug.
- Whether initiative skills should share one combined `initiative` skill or separate operation-specific skills.
- Whether curation should be triggered manually only or recommended after a threshold number of updates.
