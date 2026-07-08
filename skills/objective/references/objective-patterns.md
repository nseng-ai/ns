# Objective Patterns

Load this reference when the user says objective pattern, umbrella Objective, synthesis
Objective, subobjective, child Objective, autoobjective, ideation Objective, wayfinding
Objective, orienting Objective (formerly cross-cutting), steelthread Objective,
readme-driven-development Objective, or asks which shape an Objective should take. (For
standing / no-natural-finish-line Objectives, `references/standing-objectives.md`
remains the deeper reference.)

This catalog is recognition-level. Each pattern's creation procedure lives in its
`objective-create-<pattern>` facade skill, named per entry below — orienting is the one
exception: a layerable property with no facade, owned by `objective-create` itself.

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

A parent that coordinates a family of narrower **Subobjectives** (renamed from Child
Objective, 2026-07-06; Child Objective remains a valid synonym) via Objective Edges
while remaining the durable home for cross-child lessons, migration guides, and
synthesized closure evidence. The synthesis duty is part of the pattern (renamed from
Synthesis Objective; ADR 0001 substance, ADR 0030 name). Recognize it by: a thread too
big for one record, children owning their slices, and completion criteria that include
synthesizing child outcomes. Composes with orienting and standing; a steelthread child
split is a natural first Subobjective. Creation: `objective-create-umbrella`.

### Standing Objective

An Objective whose horizon has no natural goal-met finish line; `## Completion Criteria`
describes retirement/closure criteria instead. Standing is the horizon-axis value, not a
status — `active`/`closed` remains enough. Composes with orienting and autoobjective;
never with steelthread. Deep guidance: `references/standing-objectives.md`. Creation:
`objective-create-standing`.

### Autoobjective

An Objective whose roadmap and runner policy are intentionally shaped for repeated
Objective Runner steps with parent-LM checkpoints between committed slices (ADR 0022).
Colloquial shorthand for autonomous-pursuit design — do not formalize as schema, type,
or required wording. Product hook: `ns objective exec runner-step <slug>`, which refuses
records that do not satisfy its preconditions. Composes with either horizon; a
steelthread autoobjective is a common combination. Creation:
`objective-create-autoobjective`.

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
roadmap is a **Frontier** of open, unblocked, typed **Question Rows** (grilling /
research / prototype / task, with explicit blocked-by references, unordered beyond
blocking) rather than executable slices. Questions too coarse to state precisely stay as
**Fog** — a marked cluster under `## Open Questions`, never pre-sliced into rows. Fog
gathers only toward the Destination: work ruled beyond it is not Fog and never
graduates — it belongs in the record's non-goals prose, and a Question Row exposed as
out of scope is dropped with a recorded decision rather than resolved. The pattern is
planning by default — a Question Row resolves a decision, not a deliverable; only
`task` rows do rather than decide, and they earn their place by unblocking a decision.
Rows are worked human-in-the-loop or agent-alone as prose guidance, not machine state:
grilling and prototype rows resolve only through live exchange with the user (an agent
that answers its own grill questions has broken the row), research rows are agent-only,
and task rows may be either. Resolving a Question Row records the decision and graduates
Fog the answer made specifiable into new rows. The pull to just execute the work is
usually the signal the record has crystallized. **Crystallization** is the phase exit: the Frontier empties
and what remains is ordinary PR-shaped execution work — ideation is a phase every
Objective passes through; this pattern names deliberately staying there while the way is
found. The vocabulary (Destination, Question Row, Frontier, Fog, Crystallization) is
canonical in the root `CONTEXT.md`. The pattern is an ns-native adaptation of the
vendored `wayfinder` skill; lineage, deliberate drops, and the upstream-sync process
live in `docs/agents/wayfinder-objective-adaptation.md`.

Skill support: `objective-next` recommends from the Frontier and recognizes
Crystallization; `objective-update` resolves Question Rows and graduates Fog. Composes
with orienting and autoobjective (wayfinding dominant until Crystallization); its
natural first execution shape after Crystallization is a steelthread. Creation:
`objective-create-wayfinding` (the facade takes the vendored method skill's name).

### Steelthread Objective

An Objective whose scope is deliberately the thinnest end-to-end slice of a larger
ambition: one real task completing through every layer of the real system, with
widening explicitly out of scope. The seams between layers are where the surprises
live; the thread de-risks integration while the design is still cheap to change.
Recognize it by: `## Completion Criteria` is the thread validated end-to-end,
`## Non-Goals` names the deferred breadth, and `## Parked` holds already-decided
follow-on work. The pattern names the whole record's scope — a steelthread roadmap row
inside a broader Objective is a milestone, not a Steelthread Objective. Composes well
with autoobjective (a bounded, slice-shaped thread is a natural autorun target) and
often becomes the first Subobjective under an Umbrella; never composes with standing — a
steelthread is always bounded. It is the natural first execution shape after an Ideation
Objective's Crystallization. Creation: `objective-create-steelthread`.

### Readme-Driven-Development Objective (experimental)

**Experimental pattern.** A fresh Objective whose canonical reference is a user-facing
README draft at `references/README-draft.md`, developed via the readme-driven-development
loop: the README is the design contract where decisions settle, `roadmap.md` carries
execution state, and other `references/` files support the README without overriding it.
Every run creates a new Objective — never reuse or attach to an existing one. Method:
the portable `readme-driven-development` skill. Creation:
`objective-create-readme-driven-development`.
