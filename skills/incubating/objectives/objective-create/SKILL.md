---
name: objective-create
disable-model-invocation: true
description: "Create a new Objective record under .ns/objectives/<owner>/<slug>/. Use when starting to track a new unit of planned work: 'create an objective', 'turn this into a tracked objective', or scaffolding a new objective's thesis/scope/roadmap. To act on an Objective that already exists, use objective-next (recommend work), objective-update (record progress), or objective-close (finish it)."
---

# objective-create

Create exactly one new Objective record under `.ns/objectives/<owner>/<slug>/`. Use the `objective` umbrella skill first for shared vocabulary, selection rules, storage model, safety boundaries, and family policy.

The Objective pattern set — wayfinding/ideation, steelthread, standing, umbrella, autoobjective, and readme-driven-development — lives in `references/<pattern>-create.md`; each reference owns that pattern's creation procedure on top of this skill's record mechanics. The pattern is chosen in the interview (see the Pattern beat below). When the user names a pattern upfront, read the matching reference immediately and skip the menu. Recognition prose and composition facts stay in the `objective` skill's patterns catalog (`references/objective-patterns.md`).

## Required shape

New records live in the active root only, owner-nested at `.ns/objectives/<owner>/<slug>/`, with `objective.md`, `roadmap.md`, and `updates/` per the umbrella skill's storage model. Creation deltas: `orientation.md` is optional and orienting-only; there is no `closed.md` at creation.

`objective.md` uses the umbrella skill's required headings.

- `## Assumptions and Risks` must distinguish assumptions from risks, with enough context for a future `objective-update` to mark an assumption incorrect, a risk de-risked or not, or add newly discovered ones.
- When the record accepts a deliberate shortcut — a prototype-race sacrifice of security, scope, or quality — never record the shortcut alone: name its upgrade beside it, so the later swap is a slice rather than a redesign and a future `objective-update` can retire the pair together.
- Default to planning-only: execution-policy sections are never mandatory and appear only when the user explicitly asks for execution-friendly/runner/autonomous behavior. Never offer execution policy as an interview question on your own initiative — the Pattern beat settles this axis, and choosing a standard Objective (or any pattern other than autoobjective) without an explicit execution request means planning-only; execution policy can always be added later via `objective-update`. When the user does ask, read `references/execution-friendly-create.md` before asking policy questions.
- Independently of execution policy, any pattern may opt into an optional `## Prompt Guidance` section (semantics: the `objective` skill's `references/prompt-guidance.md`). Offer it only when the interview surfaces durable prompt-shaping facts — standing context, validation gates, executor preference, standing hazards — rather than as a mandatory question.

`roadmap.md` uses the umbrella skill's required headings, statuses, row sizing, validation-rows-as-evidence rule, and prose-guidance rules. Creation delta: when validation surfaces as a branch point in the interview, steer it into completion evidence under a semantic row — e.g. an indented `Evidence: targeted tests and relevant repo checks passed` — never a standalone final row.

## Owner

Every record has a required singular owner (its steward, not an access-control role). Resolve it deterministically before finalizing the target:

1. If the creation request carries an explicit `--owner <handle>`, that owner wins.
2. Run `ns objective exec resolve-owner [--owner <handle>] --format json`. It validates an explicit handle offline (never verifying it against GitHub) and otherwise resolves the authenticated GitHub login.
3. If no explicit owner was given and no authenticated login is available, stop per Stop / ask and require an explicit `--owner`; never prompt for an owner guess or derive one from Git identity.
4. The final creation confirmation must display the resolved owner and full locator `<owner>/<slug>` before any file is written.

## Locator and path

- Require an explicit slug, or propose a normalized slug and get explicit confirmation before writing any file. The durable identity is the full Objective Locator `<owner>/<slug>`; slugs are owner-local.
- Write only under `.ns/objectives/<owner>/<slug>/`; never a flat `.ns/objectives/<slug>/` directory, `docs/objectives/`, or anywhere else.
- Locator identity is the umbrella skill's rule: owner and slug are immutable, and renames use close-and-replace (Objective Replacement), never in-place moves. Before creating a locator that looks like a rename or replacement of existing work, run `ns objective list --status all --format md` (add `--all-owners` when other owners may hold it); if a likely existing Objective appears, stop per Stop / ask.
- Check existence by full locator before writing. `ns objective exec read-objective <owner>/<slug> --format md` returns a `not_found` envelope when the locator has no active record and otherwise emits it. If `.ns/objectives/<owner>/<slug>/` exists, stop per Stop / ask — never overwrite. If the locator was previously deleted, source control history is the only historical link; recreate it only when the user wants that identity again.
- Records are Markdown: write them directly, using `ns objective exec` only for deterministic reads; the only sanctioned YAML is Record Frontmatter below.

## Record Frontmatter: owner, initial edges, and Blocked Sentence

Record Frontmatter mechanics — the closed key set (required `owner`, optional `blocked`/`edges`), mirrored two-file edits, and `ns objective check` — are owned by the `objective` umbrella skill. Creation deltas:

- **Owner is always written.** Every new `objective.md` starts with a frontmatter block carrying `owner: <resolved-owner>`, even with no blocked sentence or edges.
- **Initial edges.** When the new Objective has a durable relationship to an existing record, declare the edge at creation using full locators (`objective: <owner>/<slug>`) — including the perspective-correct mirror entry in the counterpart's frontmatter, the one sanctioned edit outside the new record.
- **Blocked Sentence.** Set `blocked:` only when the new record is genuinely gated at creation; the value is a non-empty sentence saying why.

## Interview

Interview the user relentlessly before writing (inspired by [Matt Pocock's `grill-me` skill](https://github.com/mattpocock/skills/blob/main/skills/productivity/grill-me/SKILL.md)) until shared understanding covers title, thesis, scope, non-goals, completion criteria, assumptions, risks, open questions, and a semantic initial roadmap — or the user chooses to stop questioning and write.

- **Pattern.** Early — once the thesis and work shape are roughly understood but before deep branch-walking — progressively disclose Objective shapes. Skip these menus when the user already named a pattern or the shape is unambiguous.
  1. First present only two choices: **Create a standard Objective** (recommended; continue without a named pattern) and **Select an Objective template or pattern**. Do not name, summarize, or enumerate patterns in this first menu.
  2. Only when the user selects the second choice, present a second numbered menu containing the six patterns, each with a one-line recognition cue sourced from the patterns catalog entries (do not restate deep prose), plus a final choice to go back and create a standard Objective.
  3. Single-select the primary shaping; on pattern opt-in, read `references/<pattern>-create.md` before asking that pattern's questions. Ask layering/composition questions only when the catalog says the chosen pattern composes.
- Walk each branch of the design tree, resolving dependencies between decisions one by one; focus on branch points that affect scope, completion criteria, assumptions, risks, sequencing, closure evidence, or — only when the user explicitly requested execution behavior — execution policy.
- Explore the codebase or existing docs instead of asking questions whose answers are discoverable locally.
- Ask one unresolved question at a time, including your recommended answer so the user can confirm or correct it, as a compact numbered menu with domain-specific labels — never an open-ended continuation prompt. Tell the user they can answer with a number or a custom correction.
- Menu order: recommended path first, main alternative(s) next, and — only after the owner and slug are explicitly confirmed — a final stop option reading exactly `Stop and create Objective <owner>/<slug>`, confirmed locator verbatim. If the locator is unconfirmed, omit the stop option and resolve owner/slug confirmation first.
- Never write generic or invented durable content; keep interviewing until you don't have to.

## Workflow

1. Run the interview; resolve the owner per Owner, confirm the slug and clear the active root per Locator and path, loading any conditional reference — a pattern's `references/<pattern>-create.md` or `references/execution-friendly-create.md` — before its questions.
2. Create `.ns/objectives/<owner>/<slug>/` with `updates/`, `objective.md`, and `roadmap.md` per Required shape, in concise human-readable narrative. `objective.md` always starts with the owner frontmatter block.
3. If the interview surfaced initial edges or a genuine blocked gate, extend the Record Frontmatter per its section — including the counterpart mirrors — and run `ns objective check <owner>/<slug>`.
4. If the Objective is orienting — an agent doing unrelated work must obey its direction — write `orientation.md` (≈8 content lines, agent-facing) using the umbrella skill's format: `Direction`, `Getting to` (with ADR/CONTEXT pointers), `What you see now`, `Avoid`, and `Active slice: see this objective's roadmap.md`. Otherwise skip it; presence of the file is the opt-in flag. Lifecycle/graduation metadata stays in `roadmap.md`, never in `orientation.md`.
5. Create no initial file under `updates/` and no `closed.md`.

## Stop / ask

- The slug is missing, unconfirmed, invalid-looking, or points outside `.ns/objectives/`.
- No explicit `--owner` was given and `resolve-owner` reports no authenticated GitHub login — ask for an explicit `--owner <handle>`.
- The target Objective directory already exists for the resolved locator — ask whether the user meant `objective-update` or a direct read.
- The request looks like a rename/replacement of existing Objective work and the user has not explicitly chosen create vs update vs close-and-replace — ask whether they meant `objective-update`, a direct read, or an explicit Objective Replacement.
- Durable context is too thin to write thesis, scope, completion criteria, assumptions, risks, or requested execution policy without inventing them.
- The request needs multiple Objectives: create only one and ask the user to run the command again for the others.

## Verify

- The directory `.ns/objectives/<owner>/<slug>/` contains `objective.md`, `roadmap.md`, and `updates/`, and `objective.md` contains `## Assumptions and Risks`.
- `objective.md` starts with a Record Frontmatter block whose `owner` equals the owner path segment.
- If orienting, `orientation.md` exists and follows the format; otherwise it is absent. It is optional, never required.
- If execution-friendly, verify against `references/execution-friendly-create.md`; if planning-only, execution policy sections are absent unless explicitly requested.
- If a pattern was chosen, verify against that pattern reference's verification items.
- Record Frontmatter carries only `owner` plus optional `blocked`/`edges`, every declared edge endpoint is a full locator with its mirror entry in the counterpart record, and `ns objective check <owner>/<slug>` passes.
- No files outside the new Objective's directory changed, except counterpart `objective.md` frontmatter blocks touched by mirrored edge entries.
- There is no initial file under `updates/` and no `closed.md`.
- Summarize the created locator (owner plus slug), first planned roadmap item, most important assumption or risk captured, and whether the Objective is planning-only or execution-friendly.
