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
- `## Assumptions and Risks`
- `## Open Questions`

`## Assumptions and Risks` should distinguish assumptions from risks in prose or bullets, with enough context for future `initiative-update` calls to mark an assumption incorrect, a risk de-risked/not de-risked, or add newly discovered assumptions and risks.

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

1. Gather enough context to write a useful title, thesis, scope, non-goals, completion criteria, assumptions, risks, open questions, and initial roadmap.
2. Use a `grill-me` style discovery loop before writing:
   - Interview the user relentlessly about every aspect of the initiative until shared understanding is reached.
   - Walk down each branch of the design tree, resolving dependencies between decisions one-by-one.
   - Explore the codebase or existing docs instead of asking questions whose answers can be discovered locally.
   - Ask only one unresolved question at a time.
   - For each question, include your recommended answer so the user can confirm or correct it, then ask whether they want to continue to the next question or stop and create the Initiative with the context gathered so far.
   - Focus especially on branch points that affect scope, completion criteria, assumptions, risks, sequencing, or closure evidence.
   - Continue until shared understanding is sufficient to avoid generic or invented durable content, or until the user chooses to stop questioning and write the Initiative.
3. Create `.asdl/initiatives/<slug>/`, `.asdl/initiatives/<slug>/updates/`, `initiative.md`, and `roadmap.md`.
4. Write concise, human-readable narrative content, including a concrete `## Assumptions and Risks` section.
5. Do not create an initial update file. Do not create `closed.md`.

## Stop / ask

- The slug is missing, unconfirmed, invalid-looking, or points outside `.asdl/initiatives/`.
- The target Initiative directory already exists.
- The user has not provided enough durable context to avoid inventing thesis, scope, completion criteria, assumptions, or risks.
- The request appears to need multiple Initiatives; create only one and ask the user to run the command again for others.

## Verify

- Confirm the directory contains `initiative.md`, `roadmap.md`, and `updates/`.
- Confirm `initiative.md` contains `## Assumptions and Risks`.
- Confirm there is no initial file under `updates/` and no `closed.md`.
- Summarize the created slug, first planned roadmap item, and the most important assumption or risk captured.
