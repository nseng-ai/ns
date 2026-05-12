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
  - "Bash(test *)"
  - "Bash(date -u *)"
  - "Bash(mkdir -p *)"
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

## Template Paths

Resolve templates relative to this skill directory, not the initiative target:

- `skills/initiative-create/templates/initiative.md`
- `skills/initiative-create/templates/roadmap.md`
- `skills/initiative-create/templates/update.md`

Use the templates as starting points for files written under
`docs/initiatives/<slug>/`.

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

## Workflow

1. Gather only the missing intake context needed for a useful draft.
2. Run discovery, including the existing-initiative duplicate check.
3. Choose and validate the slug.
4. Read the relevant templates from `skills/initiative-create/templates/`.
5. Create the target directory:

   ```bash
   mkdir -p docs/initiatives/<slug>/updates
   ```

6. Write `initiative.md` and `roadmap.md` under `docs/initiatives/<slug>/`.
7. Write one initial update only when the session context warrants it.
8. Summarize the created initiative and immediate next step.

## Discovery

Before writing files:

1. Read relevant project instructions such as `AGENTS.md`.
2. Search `docs/initiatives/` for nearby existing initiatives.
3. Read titles and thesis/motivation sections for plausible matches, not just
   directory names. Duplicate scope under a different slug is the real risk.
4. If a close existing initiative exists, recommend continuing it instead of
   creating a duplicate.
5. Inspect likely packages, modules, docs, tests, and adjacent workflows.
6. Identify constraints, risks, validation surfaces, and open questions.

Scale discovery to the request. Broad architecture initiatives need more
inspection than narrowly scoped cleanup initiatives.

## Slug

Default to generating the slug from the initiative title or scope. Use a
user-provided slug only when the user explicitly asks to override it.

The slug must be kebab-case and match:
`^(?!.*--)[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$`. In practice: lowercase
ASCII letters and digits, single hyphens as separators, 1-50 characters,
and no leading, trailing, or consecutive hyphens.

Check for collisions before writing:

```bash
test -d docs/initiatives/<slug> && echo collision
```

Or list existing slugs:

```bash
find docs/initiatives -mindepth 1 -maxdepth 1 -type d
```

Also scan existing initiative prose for semantic overlap before writing. Start
with:

```bash
find docs/initiatives -maxdepth 2 -type f -name initiative.md
```

Read plausible matches and compare title, thesis, motivation, scope, and
non-goals against the proposed work. If the work belongs in an existing
initiative, continue it. If it is intentionally separate, record the boundary
in `Non-Goals` or `Open Questions`.

## `initiative.md`

Write durable context. This file should change only when the durable
understanding of the workstream changes.

Use `templates/initiative.md`. Delete placeholder prose and fill every section
with task-specific content. Keep unknowns honest in `Open Questions`.

## `roadmap.md`

Write the current ordered work checklist. Entries are fluid named work areas,
not stable tickets. They may be renamed, split, merged, reordered, or parked as
understanding changes.

Use the canonical top-level sections from `templates/roadmap.md`:

- `## Checklist` for active initiative work
- `## Parked` for intentionally deferred, rejected, canceled, or waiting work

Checklist item status markers:

- `[ ]` not started
- `[~]` in progress
- `[x]` complete

Parked items are plain bullets with no checkboxes. Large initiatives may add
subheadings under `## Checklist`, but keep the top-level section shape.

Do not use stable numbered IDs such as `R-001`. Point entries toward concrete
artifacts such as PRs, merged commits, docs, tests, migrations, reports,
deleted code, or released behavior.

Use `templates/roadmap.md`. Delete placeholder entries that do not apply.

## Initial Update File

Usually skip the initial update. The created `initiative.md` and `roadmap.md`
already capture the starting state.

When there is session context worth preserving separately, write exactly one
file under `updates/`:

```text
YYYY-MM-DDTHHMMSSZ-short-description.md
```

Generate the timestamp with:

```bash
date -u +%Y-%m-%dT%H%M%SZ
```

Use the command's output verbatim — do not hand-type the timestamp. Update
files do not need frontmatter.

Use `templates/update.md`. Delete placeholder prose and skip sections only when
they would be empty noise.

## Authoring Rules

- Prefer prose that will still make sense after branches are merged and PRs
  are closed.
- Keep roadmap entries outcome-oriented and artifact-backed.
- Use `[ ]`, `[~]`, and `[x]` for checklist status.
- Use plain bullets, not checkboxes, for parked work.
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
