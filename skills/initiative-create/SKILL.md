---
name: initiative-create
description: Create a checked-in initiative under docs/initiatives for durable multi-session, multi-branch, or multi-PR work. Use when the user asks to create, start, initialize, or draft an initiative.
allowed-tools:
  - "Read"
  - "Write"
  - "Edit"
  - "Bash(find *)"
  - "Bash(rg *)"
  - "Bash(git *)"
---

# initiative-create

Create a new checked-in initiative directory after enough discovery to avoid
inventing context.

Initiatives are for durable workstreams that span sessions, branches, or pull
requests. They live in the repository, not brmem or hidden agent state.

## When To Use

Use this skill for:

- multi-PR refactors
- staged migrations
- broad feature work
- architecture changes
- cleanup efforts with sequencing or risk
- work where future agents need rationale, not just a task list

Do not create an initiative for a small bug fix, a single obvious PR, a one-off
operational request, or an investigation whose findings fit naturally in chat
or a PR description.

## Output

Create:

```text
docs/initiatives/<slug>/
  initiative.md
  roadmap.md
  updates/
```

Create an initial update file only when the session has specific findings or
decisions worth preserving separately from the created documents.

## Intake

Use the conversation first. Ask only for missing information that blocks a
useful draft.

Useful questions, when not already answered:

1. What should this initiative accomplish?
2. Why does it matter?
3. What is definitely in scope?
4. What is definitely out of scope?
5. What does done look like?
6. Are there known constraints or preferences?
7. Where should I look first?

Keep intake short. The user should not have to author the initiative for you.
When enough context exists, proceed and record assumptions explicitly.

## Discovery

Before writing files:

1. Read relevant project instructions such as `AGENTS.md`.
2. Search `docs/initiatives/` for nearby existing initiatives.
3. If a close existing initiative exists, recommend continuing it instead of
   creating a duplicate.
4. Inspect likely packages, modules, docs, tests, and adjacent workflows.
5. Identify constraints, risks, validation surfaces, and open questions.

Scale discovery to the request. Broad architecture initiatives need more
inspection than narrowly scoped cleanup initiatives.

## Slug

Default to generating the slug from the initiative title or scope. Use a
user-provided slug only when the user explicitly asks to override it.

The slug must be kebab-case and match the current objective slug contract:
`^(?!objective-)(?!.*--)[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$`. In practice:
lowercase ASCII letters and digits, single hyphens as separators, 1-50
characters, no leading/trailing/consecutive hyphens, and no `objective-`
prefix.

Check for collisions before writing:

```bash
find docs/initiatives -maxdepth 2 -type f -name initiative.md
```

If the slug collides, continue the existing initiative or pick a distinct
slug after explaining the choice.

## `initiative.md`

Write durable context. This file should change only when the durable
understanding of the workstream changes.

Template:

```markdown
# Initiative Title

## Thesis

One paragraph explaining the durable purpose of the initiative. This should
remain useful even if the roadmap changes.

## Motivation

Why this work matters. Describe the pain, risk, opportunity, or capability
that justifies tracking this as an initiative.

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

- Unknowns discovered during creation.
```

## `roadmap.md`

Write the current working roadmap. Entries are fluid named work areas, not
stable tickets. They may be renamed, split, merged, moved, or deleted as
understanding changes.

Do not use stable numbered IDs such as `R-001`. Point entries toward concrete
artifacts such as PRs, merged commits, docs, tests, migrations, reports,
deleted code, or released behavior.

Template:

```markdown
# Roadmap

## Now

- [ ] Named work area.
  - Artifact: PR, docs change, tests, migration, deletion, report, or other
    reviewable output.
  - Notes: Optional context.

## Next

- [ ] Named work area.
  - Artifact: Expected reviewable or verifiable output.

## Later

- [ ] Named work area.
  - Artifact: Expected reviewable or verifiable output.

## Parked

- Work intentionally deferred, rejected, or waiting on external facts.
```

## Initial Update File

Usually skip the initial update. The created `initiative.md` and `roadmap.md`
already capture the starting state.

When there is session context worth preserving separately, write exactly one
file under `updates/`:

```text
YYYY-MM-DDTHHMMSSZ-short-description.md
```

Use UTC. Update files do not need frontmatter.

Template:

```markdown
# Short Update Title

## Summary

What changed, what was learned, or what decision was made.

## Roadmap Context

Name the roadmap area this relates to, if any. Do not use stable numbered IDs.

## Initiative Impact

Explain how this affects scope, constraints, invariants, completion criteria,
risks, or future work.

## Follow-Ups

- Concrete follow-up, if any.
```

## Authoring Rules

- Prefer prose that will still make sense after branches are merged and PRs
  are closed.
- Keep roadmap entries outcome-oriented and artifact-backed.
- Do not add metadata fields that duplicate Git metadata.
- Do not use frontmatter.
- Do not use brmem.
- Do not create a CLI dependency.
- Do not invent stable roadmap item IDs.
- Record uncertainty as open questions or parked work.
- Preserve rationale and invariants even when implementation details change.

## Final Response

After creating the files, summarize:

- initiative slug
- files created
- any assumptions recorded
- highest-value next step or validation surface
