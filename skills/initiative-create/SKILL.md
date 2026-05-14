---
name: initiative-create
description: "Command: initiative-create"
---

# initiative-create

Create a new Initiative record under `.asdl/initiatives/<slug>/`.

For shared vocabulary and system-wide rules, use the `initiative` skill when available; this command remains self-contained.

## Required shape

Canonical root only:

```text
.asdl/initiatives/<slug>/
  initiative.md
  roadmap.md
  updates/
```

`initiative.md` required headings:

- `# <Title>`
- `## Thesis`
- `## Scope`
- `## Non-Goals`
- `## Completion Criteria`
- `## Open Questions`

`roadmap.md` required headings:

- `# Roadmap`
- `## Work`
- `## Parked`

Use only `[ ]`, `[~]`, and `[x]` roadmap statuses.

## Slug and path

- Require an explicit slug, or propose a normalized slug and get explicit confirmation before writing files.
- Use only `.asdl/initiatives/<slug>/`. Do not create records under `docs/initiatives/` or objective-system locations.
- Do not add registries, YAML/frontmatter, UUIDs, hidden attachment metadata, or state-machine behavior.
- If `.asdl/initiatives/<slug>/` exists, stop and ask whether the user meant `initiative-current` or `initiative-update`; never overwrite.
- V1 is markdown-only: read and edit Markdown directly; do not add or call Python CLI tooling.

## Workflow

1. Gather enough context to write a useful title, thesis, scope, non-goals, completion criteria, open questions, and initial roadmap.
2. Create `.asdl/initiatives/<slug>/`, `.asdl/initiatives/<slug>/updates/`, `initiative.md`, and `roadmap.md`.
3. Write concise, human-readable narrative content.
4. Do not create an initial update file. Do not create `closed.md`.

## Stop / ask

- The slug is missing, unconfirmed, invalid-looking, or points outside `.asdl/initiatives/`.
- The target Initiative directory already exists.
- The user has not provided enough durable context to avoid inventing thesis, scope, or completion criteria.
- The request appears to need multiple Initiatives; create only one and ask the user to run the command again for others.

## Verify

- Confirm the directory contains `initiative.md`, `roadmap.md`, and `updates/`.
- Confirm there is no initial file under `updates/` and no `closed.md`.
- Summarize the created slug and first planned roadmap item.
