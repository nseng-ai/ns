# Objective Patterns

Load this reference when the user says objective pattern, umbrella Objective, synthesis
Objective, child Objective, autoobjective, ideation Objective, orienting Objective
(formerly cross-cutting), or asks which shape an Objective should take. (For standing / no-natural-finish-line
Objectives, `references/standing-objectives.md` remains the deeper reference.)

## What a pattern is

- A pattern is a **prose-only recognizable shape** for an Objective record — never a
  machine category, type field, lifecycle state, registry, or frontmatter key (Record
  Frontmatter stays exactly `blocked` + `edges`, ADR 0025).
- **Patterns compose.** One Objective can be standing + orienting + autoobjective at
  once. Patterns are not mutually exclusive types; pattern names are attributive
  adjectives ("a standing, orienting objective"), not exclusive kinds.
- **Recognition is by reading; enforcement is at the product boundary.** Skills and
  humans recognize a pattern from the record's prose. A product surface that needs a
  property verifies it at dispatch time and refuses when unsatisfied (the Objective
  Runner already works this way). Decided 2026-07-05: no pattern marker files or tags
  for now. The named promotion path, if prose recognition ever proves insufficient, is a
  tag-plus-checkers system — a declared tag whose deterministic checkers verify the
  tagged properties (e.g. an `auto` tag confirming a record is a valid autorun target) —
  not a parallel registry or new status.
- **Two orthogonal axes underlie several patterns** (design brief:
  `docs/pi/standing-objectives-and-runners.md`): **Horizon** (bounded ↔ standing) is a
  property of the Objective; **Drive** (human ↔ autonomous) is a property of the Runner.
  Standing does not imply autonomous; autonomous does not imply standing.

## The catalog

### Umbrella Objective

A parent that coordinates a family of narrower **Child Objectives** via Objective Edges
while remaining the durable home for cross-child lessons, migration guides, and
synthesized closure evidence. The synthesis duty is part of the pattern (renamed from
Synthesis Objective; ADR 0001 substance, ADR 0030 name). Parent roadmap may use `[~]` to
show a child exists and is in progress; the parent closes only after children are closed
or explicitly parked and synthesized.

- Use when: a thread is too big for one record and children should own their slices.
- Failure mode: the **fire-and-forget umbrella** — a parent that only spawns children
  and stops tracking. That is not this pattern.

### Standing Objective

An Objective whose horizon has no natural goal-met finish line; `## Completion Criteria`
describes retirement/closure criteria instead. Standing is the horizon-axis value, not a
status — `active`/`closed` remains enough. Deep guidance:
`references/standing-objectives.md`.

### Autoobjective

An Objective whose roadmap and runner policy are intentionally shaped for repeated
Objective Runner steps with parent-LM checkpoints between committed slices (ADR 0022).
Colloquial shorthand for autonomous-pursuit design — do not formalize as schema, type,
or required wording. Product hook: `ns objective exec runner-step <slug>`, which refuses
records that do not satisfy its preconditions.

### Orienting Objective

An Objective whose direction every unrelated agent must respect while it is in flight —
it orients agents. The defining trait is the presence of `orientation.md` in the record
(a marker file that predates and is unaffected by the no-new-markers decision). Product
hook: `ns objective exec load-orientations` includes it in the always-load set until
`closed.md` appears. Renamed from "cross-cutting Objective" (2026-07-05); cross-cutting
remains fine as plain description of *why* a record is orienting.

### Ideation Objective

An Objective deliberately held in the formation phase: the **Destination** (thesis,
completion criteria) is settled first, but the way there is not yet known, so the
roadmap is a **Frontier** of open questions rather than executable slices. The
vocabulary below (Destination, Question Row, Frontier, Fog, Crystallization) is
canonical in the root `CONTEXT.md`. The pattern is an ns-native adaptation of the
vendored `wayfinder` skill; lineage, deliberate drops, and the upstream-sync process
live in `docs/agents/wayfinder-objective-adaptation.md`.

- Roadmap rows are typed **Question Rows** — grilling / research / prototype / task —
  with explicit blocked-by references to other rows; beyond blocking, they are
  unordered. The Frontier is the open, unblocked Question Rows.
- Name the Destination first — it shapes what every question asks. Then chart
  breadth-first: fan out across the whole space to surface the open questions, rather
  than going deep on any one thread.
- Questions too coarse to state precisely stay as **Fog** (a marked cluster under
  `## Open Questions`), not pre-sliced into rows. The test: can you state the question
  precisely now — not answer it? Precisely stateable → Question Row; otherwise → Fog.
- Resolving a Question Row produces a resolved decision (Semantic Update and/or a
  Resolved Decisions entry) and graduates Fog the answer made specifiable into new
  rows; it may invalidate other rows.
- **Crystallization** is the phase exit: the Frontier empties of Question Rows and what
  remains is ordinary PR-shaped execution work. Ideation is a phase every Objective
  passes through; this pattern names deliberately staying there while the way is found.
- Size Question Rows to one agent session, and resolve one per session.

Skill support: `objective-create` charts ideation records Destination-first with typed
Question Rows and Fog; `objective-next` recommends from the Frontier and recognizes
Crystallization; `objective-update` resolves Question Rows and graduates Fog.
