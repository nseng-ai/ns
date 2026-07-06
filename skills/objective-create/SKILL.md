---
name: objective-create
disable-model-invocation: true
description: "Create a new Objective record under .ns/objectives/<slug>/. Use when starting to track a new unit of planned work: 'create an objective', 'start an objective for X', 'turn this into a tracked objective', or scaffolding a new objective's thesis/scope/roadmap. To act on an Objective that already exists, use objective-next (recommend work), objective-update (record progress), or objective-close (finish it)."
---

# objective-create

Create exactly one new Objective record under `.ns/objectives/<slug>/`. Use the `objective` umbrella skill first for shared vocabulary, selection rules, storage model, and safety boundaries; this skill stays self-contained for its own happy path.

## Required shape

New records live in the active root only:

```text
.ns/objectives/<slug>/
  objective.md
  roadmap.md
  orientation.md  # optional; orienting Objectives only
  updates/
```

`objective.md` uses the umbrella skill's required headings.

- `## Assumptions and Risks` must distinguish assumptions from risks, with enough context for a future `objective-update` to mark an assumption incorrect, a risk de-risked or not, or add newly discovered ones.
- Default to planning-only: execution-policy sections are never mandatory and appear only when the user explicitly asks for execution-friendly/runner/autonomous behavior or the interview exposes execution policy as a real branch point. When they apply, read `references/execution-friendly-create.md` before asking policy questions.
- For a standing / ongoing / no-natural-finish-line Objective, load the `objective` skill's standing Objectives reference before drafting completion criteria and roadmap.
- When the user names an Objective pattern (umbrella, ideation, orienting, autoobjective) or the record's shape is ambiguous, load the `objective` skill's Objective patterns reference (`references/objective-patterns.md`) before drafting.

`roadmap.md` uses the umbrella skill's required headings and statuses.

- Every initial row is substantive semantic work, sized per the umbrella skill's roadmap rules — a broad mechanical change can be one row when it implements one clear decision; a small mixed change may need several.
- **Ideation Objectives invert the row rule**: settle the **Destination** first, then chart the initial roadmap as a **Frontier** of typed **Question Rows** with **Fog** held back. Load the `objective` skill's Objective patterns reference (`references/objective-patterns.md`) before drafting the roadmap; it owns the charting rules.
- No routine validation-only row (`run just`, `run tests`, `wait for CI`, `full repo validation`) unless validation/test/CI behavior is itself in scope. When validation surfaces as a branch point in the interview, steer it into completion evidence under a semantic row — e.g. an indented `Evidence: targeted tests and relevant repo checks passed` — never a standalone final row.
- Rows may carry indented prose guidance when needed; it is prose, not machine state.

## Slug and path

- Require an explicit slug, or propose a normalized slug and get explicit confirmation before writing any file.
- Write only under `.ns/objectives/<slug>/`; never `docs/objectives/` or anywhere else.
- Slug identity is the umbrella skill's rule: renames never mint a new slug. Before creating a slug that looks like a rename or replacement of existing work, run `ns objective list --status all --format md`; if a likely existing Objective appears, stop and ask whether the user meant `objective-update`, a direct read, or an explicit slug migration.
- Check both roots before writing. `ns objective exec read-objective <slug> --format md` returns a `not_found` envelope when the slug has no active record and otherwise emits it. If `.ns/objectives/<slug>/` exists, stop and ask whether the user meant `objective-update` or a direct read — never overwrite. If `.ns/objective-archive/<slug>/` exists, stop and ask whether to unarchive (`ns objective archive <slug> --unarchive`) instead of creating a duplicate slug.
- Records are Markdown: write them directly, using `ns objective exec` only for deterministic reads; the only sanctioned YAML is Record Frontmatter below.

## Record Frontmatter: initial edges and Blocked Sentence

Record Frontmatter (defined in the `objective` umbrella skill) carries exactly `blocked` and `edges` — never any other key. It is usually absent at creation: omit the block entirely unless the interview surfaces a real fact.

- **Initial edges.** When the new Objective has a durable relationship to an existing record (for example, it consumes another Objective as a hard dependency), declare the edge at creation as the umbrella skill's mirrored two-file edit: the entry in the new record's frontmatter **and** the perspective-correct mirror entry in the counterpart's — editing that counterpart block is the one sanctioned edit outside the new record.
- **Blocked Sentence.** Set `blocked:` only when the new record is genuinely gated at creation (by another objective, an external dependency, anything); the value is a non-empty sentence saying why.
- After writing any frontmatter, run `ns objective check <new-slug>` (validates the record's edges including counterpart mirrors) or `ns objective check --all`.

## Interview

Interview the user relentlessly before writing (inspired by [Matt Pocock's `grill-me` skill](https://github.com/mattpocock/skills/blob/main/skills/productivity/grill-me/SKILL.md)) until shared understanding covers title, thesis, scope, non-goals, completion criteria, assumptions, risks, open questions, and a semantic initial roadmap — or the user chooses to stop questioning and write.

- Walk each branch of the design tree, resolving dependencies between decisions one by one; focus on branch points that affect scope, completion criteria, assumptions, risks, sequencing, closure evidence, or — when relevant — execution policy.
- Explore the codebase or existing docs instead of asking questions whose answers are discoverable locally.
- Ask one unresolved question at a time, including your recommended answer so the user can confirm or correct it, as a compact numbered menu with domain-specific labels — never an open-ended continuation prompt. Tell the user they can answer with a number or a custom correction.
- Menu order: recommended path first, main alternative(s) next, and — only after the slug is explicitly confirmed — a final stop option reading exactly `Stop and create Objective <slug>`, confirmed slug verbatim. If the slug is unconfirmed, omit the stop option and resolve slug confirmation first.
- Never write generic or invented durable content; keep interviewing until you don't have to.

## Workflow

1. Run the interview; confirm the slug and clear both roots per Slug and path, loading any conditional reference before its questions.
2. Create `.ns/objectives/<slug>/` with `updates/`, `objective.md`, and `roadmap.md` per Required shape, in concise human-readable narrative.
3. If the interview surfaced initial edges or a genuine blocked gate, write Record Frontmatter per its section — including the counterpart mirrors — and run `ns objective check <slug>`; otherwise write no frontmatter.
4. If the Objective is orienting — an agent doing unrelated work must obey its direction — write `orientation.md` (≈8 content lines, agent-facing) using the umbrella skill's format: `Direction`, `Getting to` (with ADR/CONTEXT pointers), `What you see now`, `Avoid`, and `Active slice: see this objective's roadmap.md`. Otherwise skip it; presence of the file is the opt-in flag. Lifecycle/graduation metadata stays in `roadmap.md`, never in `orientation.md`.
5. Create no initial file under `updates/` and no `closed.md`.

## Stop / ask

- The slug is missing, unconfirmed, invalid-looking, or points outside `.ns/objectives/`.
- The target Objective directory already exists (active or archived).
- The request looks like a rename/replacement of existing Objective work and the user has not explicitly chosen create vs update vs slug migration.
- Durable context is too thin to write thesis, scope, completion criteria, assumptions, risks, or requested execution policy without inventing them.
- The request needs multiple Objectives: create only one and ask the user to run the command again for the others.

## Verify

- The directory contains `objective.md`, `roadmap.md`, and `updates/`, and `objective.md` contains `## Assumptions and Risks`.
- If orienting, `orientation.md` exists and follows the format; otherwise it is absent. It is optional, never required.
- If execution-friendly, verify against `references/execution-friendly-create.md`; if planning-only, execution policy sections are absent unless explicitly requested.
- If Record Frontmatter was written, it carries only `blocked` and/or `edges`, every declared edge has its mirror entry in the counterpart record, and `ns objective check <slug>` passes; if not written, `objective.md` starts with `# <Title>` and no frontmatter fence.
- No files outside the new Objective's directory changed, except counterpart `objective.md` frontmatter blocks touched by mirrored edge entries.
- There is no initial file under `updates/` and no `closed.md`.
- Summarize the created slug, first planned roadmap item, most important assumption or risk captured, and whether the Objective is planning-only or execution-friendly.
