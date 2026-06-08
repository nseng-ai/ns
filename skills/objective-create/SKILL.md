---
name: objective-create
description: "Command: objective-create"
---

# objective-create

Create a new Objective record under `.asdl/objectives/<slug>/`.

Part of the Objective skill family. Use the `objective` umbrella skill first for shared vocabulary, selection rules, storage model, and safety boundaries; this step remains self-contained for its own happy path.

## Required shape

Active root only for newly created records:

```text
.asdl/objectives/<slug>/
  objective.md
  roadmap.md
  updates/
```

Also check the archive root before creating a slug:

```text
.asdl/objective-archive/<slug>/
```

`objective.md` required headings:

- `# <Title>`
- `## Thesis`
- `## Scope`
- `## Non-Goals`
- `## Completion Criteria`
- `## Assumptions and Risks`
- `## Open Questions`

Ordinary planning-only Objectives should omit execution policy sections unless explicitly requested. Do not make execution policy mandatory.

`## Assumptions and Risks` should distinguish assumptions from risks in prose or bullets, with enough context for future `objective-update` calls to mark an assumption incorrect, a risk de-risked/not de-risked, or add newly discovered assumptions and risks.

`roadmap.md` required headings:

- `# Roadmap`
- `## Work`
- `## Parked`

Use only `[ ]`, `[~]`, and `[x]` roadmap statuses.

Roadmap item quality:

- Initial roadmap items must be substantive semantic work: deliverables, decisions, de-risking, implementation slices, documentation/product changes, or meaningful follow-up.
- Size roadmap items by human-legible decision count and thesis clarity, not by diff size, file count, or line count. A broad mechanical change can be one simple item when it implements one clear decision; a small mixed change may need multiple items.
- Do not add a final routine validation-only row by default, such as `run just`, `run tests`, `wait for CI`, or `full repo validation`.
- During the creation interview, if validation appears as a possible branch point, steer it into completion evidence unless validation/test/CI behavior is itself in scope.
- The initial roadmap may include expected evidence under a semantic row, such as `Evidence: targeted tests and relevant repo checks passed`; do not make that evidence a standalone final row.
- Roadmap rows may include indented prose guidance only when needed; treat it as prose, not machine state.

## Conditional references

- If the user asks for a standing/ongoing/no-natural-finish-line Objective, load the `objective` skill's standing Objectives reference before drafting completion criteria and roadmap.
- If the user asks for execution-friendly behavior, `objective-next` execution, autonomous/runner behavior, or durable Runner Policy, read `references/execution-friendly-create.md` before interviewing about policy.

## Slug and path

- Require an explicit slug, or propose a normalized slug and get explicit confirmation before writing files.
- Use only `.asdl/objectives/<slug>/`. Do not create records under `docs/objectives/` or other locations.
- Treat the slug directory as durable identity. Command/product/prose renames should update an existing Objective's title and body, not create a new slug.
- Before creating a slug that appears to be a rename or replacement of existing work, run `objective list --minimal --status all --format md`; if it shows a likely existing Objective, stop and ask whether the user meant `objective-current`, `objective-update`, or an explicit slug migration.
- Do not add registries, YAML/frontmatter, UUIDs, hidden attachment metadata, or state-machine behavior.
- If `.asdl/objectives/<slug>/` exists, stop and ask whether the user meant `objective-current` or `objective-update`; never overwrite. Use `objective exec read-objective <slug> --format md` to check active records: it returns a `not_found` envelope when the slug has no active record, and otherwise emits the existing record.
- If `.asdl/objective-archive/<slug>/` exists, stop and ask whether the user wants to unarchive instead of creating a duplicate slug. Use `objective archive <slug> --unarchive` when unarchive is the right intent.
- Objective records are Markdown; read and edit Markdown directly. Use `objective exec` for deterministic read mechanics (candidate listing, file inventory, closed-marker detection). Mutation remains direct.

## Workflow

1. Gather enough context to write a useful title, thesis, scope, non-goals, completion criteria, assumptions, risks, open questions, and semantic initial roadmap.
2. Default to planning-only unless the user explicitly asks for execution-friendly/runner/autonomous behavior or the interview exposes execution policy as a real branch point. Load the relevant conditional reference before asking policy-specific questions.
3. Conduct a user interview before writing, inspired by [Matt Pocock's `grill-me` skill](https://github.com/mattpocock/skills/blob/main/skills/productivity/grill-me/SKILL.md):
   - Interview the user relentlessly about every aspect of the objective until shared understanding is reached.
   - Walk down each branch of the design tree, resolving dependencies between decisions one-by-one.
   - Explore the codebase or existing docs instead of asking questions whose answers can be discovered locally.
   - Ask only one unresolved question at a time.
   - For each question, include your recommended answer so the user can confirm or correct it, then present a compact numbered menu instead of an open-ended continuation prompt.
   - Numbered menus should include the recommended path first, the main alternative(s) next, and a final stop option only after the slug has been explicitly confirmed. The stop option must be exactly `Stop and create Objective <slug>`, including the confirmed slug verbatim. If the slug is not confirmed yet, omit the stop option and resolve slug confirmation first. Use domain-specific labels so the choices are concrete (for example: `1) Skill-only steelthread`, `2) Dedicated CLI commands`, `3) Stop and create Objective objective-create-stop-option-guidance`). Tell the user they can answer with a number or a custom correction.
   - Focus especially on branch points that affect scope, completion criteria, assumptions, risks, sequencing, closure evidence, or execution policy when relevant.
   - Continue until shared understanding is sufficient to avoid generic or invented durable content, or until the user chooses to stop questioning and write the Objective.
4. Create `.asdl/objectives/<slug>/`, `.asdl/objectives/<slug>/updates/`, `objective.md`, and `roadmap.md`.
5. Write concise, human-readable narrative content, including a concrete `## Assumptions and Risks` section and execution-friendly sections only when requested or made relevant by the interview.
6. Do not create an initial update file. Do not create `closed.md`.

## Stop / ask

- The slug is missing, unconfirmed, invalid-looking, or points outside `.asdl/objectives/`.
- The target Objective directory already exists.
- The requested Objective looks like a rename/replacement of existing Objective work and the user has not explicitly chosen create vs update vs slug migration.
- The user has not provided enough durable context to avoid inventing thesis, scope, completion criteria, assumptions, risks, or requested execution policy.
- The request appears to need multiple Objectives; create only one and ask the user to run the command again for others.

## Verify

- Confirm the directory contains `objective.md`, `roadmap.md`, and `updates/`.
- Confirm `objective.md` contains `## Assumptions and Risks`.
- If the Objective is execution-friendly, verify it against `references/execution-friendly-create.md`.
- If the Objective is planning-only, confirm execution policy sections are absent unless the user explicitly asked to include them.
- Confirm there is no initial file under `updates/` and no `closed.md`.
- Summarize the created slug, first planned roadmap item, most important assumption or risk captured, and whether the Objective is planning-only or execution-friendly.
