---
name: initiative-create
description: "Command: initiative-create"
---

# initiative-create

Create a new Initiative record under `.asdl/initiatives/<slug>/`.

## Read first

- Read `CONTEXT.md` for Initiative domain language and anti-precedents.
- Read `docs/initiative-system.md`, especially Canonical Location, Documentation Surfaces, Initiative Selection, and the `initiative-create` contract.
- V1 is markdown-only: read and edit Markdown directly; do not add or call Python CLI tooling.
- Treat those docs as authoritative; do not duplicate or extend the system here.

## Slug and path

- Require an explicit slug from the user, or propose a normalized slug and get explicit confirmation before writing files.
- Use only `.asdl/initiatives/<slug>/`. Do not create records under `docs/initiatives/` or any objective-system location.
- Do not add registries, YAML frontmatter, UUIDs, hidden attachment metadata, or state-machine behavior.
- If `.asdl/initiatives/<slug>/` already exists, stop and ask whether the user meant `initiative-current` or `initiative-update`; never overwrite an existing Initiative.

## Workflow

1. Gather enough context to write a useful title, thesis, scope, non-goals, completion criteria, open questions, and initial roadmap.
2. Create `.asdl/initiatives/<slug>/`, `.asdl/initiatives/<slug>/updates/`, `initiative.md`, and `roadmap.md`.
3. Write `initiative.md` with the standardized headings from `docs/initiative-system.md` and concise, human-readable narrative content.
4. Write `roadmap.md` with the standardized headings and lightweight checkbox roadmap items using only `[ ]`, `[~]`, and `[x]`.
5. Do not create an initial update file. Do not create `closed.md`.

## Stop / ask

- The slug is missing, unconfirmed, invalid-looking, or points outside `.asdl/initiatives/`.
- The target Initiative directory already exists.
- The user has not provided enough durable context to avoid inventing thesis, scope, or completion criteria.
- The request appears to need multiple Initiatives; create only one Initiative and ask the user to run the command again for others.

## Verify

- Confirm the directory contains `initiative.md`, `roadmap.md`, and an `updates/` directory.
- Confirm there is no initial file under `updates/` and no `closed.md`.
- Summarize the created slug and the first planned roadmap item.
