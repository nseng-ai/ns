# Objective Edges

## Thesis

Inter-objective relationships today live only as free prose inside `objective.md` files —
mirrored sentences in two records with nothing keeping them consistent. The concrete failure:
a hard dependency between `checkout-free-sdl-distribution` and `ship-objectives-to-customers`
exists only as two prose sentences that can silently drift, the same mirrored-prose failure
mode the repo-ontology Objective already flags for its parity table.

This Objective introduces **Record Frontmatter** — a YAML block at the top of `objective.md`
— carrying exactly two facts:

- **Objective Edges**: undirected, kind-less, mirrored connections between two Objective
  records. Each side carries an **Edge Annotation** (`annotation:`), a required prose sentence
  written from that record's perspective. Direction, causality, and relationship kind live in
  the prose, not the schema. Edge identity is the unordered slug pair; at most one edge
  between two records.
- **Blocked Sentence**: a prose-valued `blocked:` key. Presence means the record is blocked
  (for any reason — another objective, an external gate); the value says why. There is no
  boolean; the sentence is the state. Blocked is a sub-state of open.

The design philosophy is "edges with annotations, ontology stays in prose": the formal layer
records only graph structure, prompting writes and interprets the semantics, and a cheap
repo-wide linter enforces structural integrity. Mirrored storage is safe here precisely
because the linter enforces symmetry — the drift risk that killed prose mirroring is cured by
machine-checked invariants, not by single-source storage. Typed edge kinds (blocking, parent,
decision-ownership, subsumption) were considered and rejected for v1; a taxonomy would be
inconsistently populated and any check logic keyed on it would silently miss edges that
skipped it.

Frontmatter shape:

```yaml
---
blocked: First external publish is gated on checkout-free distribution landing.
edges:
  - objective: checkout-free-sdl-distribution
    annotation: Consumed as a hard dependency; must land before this ships externally.
---
```

## Scope

- **Record Frontmatter format change.** YAML frontmatter becomes a permitted (optional) block
  at the top of `objective.md`, holding only the `blocked` and `edges` keys. Every reader of
  `objective.md` (check heading lints, `read-objective`, `list`, orientation loading, skills)
  must parse or strip it.
- **Edge encoding.** `edges:` is a list of `{objective: <slug>, annotation: <sentence>}`
  entries, mirrored in both endpoints' frontmatter. Annotations are required on both sides and
  written from the declaring record's perspective.
- **Blocked Sentence.** Prose-valued `blocked:` key; presence means blocked, value must be a
  non-empty sentence. Set and cleared only by skill judgment, never by machine auto-flip.
- **Linter in `sdl objective check`.** All structural violations are errors: dangling slug,
  missing mirror side, empty or missing annotation, duplicate pair entry, malformed
  frontmatter, empty blocked sentence. The linter sweeps all records (per-slug check also
  validates that record's edges including mirror lookups), stays cheap (frontmatter-only
  parsing, no full-body reads), and runs in CI via `just`. Slug resolution looks in both the
  active and archive roots; archiving an endpoint does not break an edge.
- **List rendering.** `sdl objective list` gains an EDGES column to the right of LATEST
  UPDATE showing the edge count, blank when zero; blocked records get a distinct STATUS
  indicator (blocked as sub-state of open).
- **Skill-owned mutation.** No public CLI mutation surface. The objective-create,
  objective-update, and objective-close skills own writing edges and judging the Blocked
  Sentence: close flows re-judge edge counterparts' blocked state ("you are closing the thing
  their annotation says gates them"); update flows re-judge the record's own sentence. Hidden
  `sdl objective exec` helpers are permitted where a skill needs a deterministic assist.
- **Seed.** Encode the live edge `checkout-free-sdl-distribution ↔
  ship-objectives-to-customers` with perspective-correct annotations on both sides, plus a
  Blocked Sentence on `ship-objectives-to-customers`. This is the feature's acceptance test —
  its own motivating case. Everything beyond the seed is opportunistic.
- **Vocabulary and decision record.** Root `CONTEXT.md` gains the system terms (Objective
  Edge, Edge Annotation, Blocked Sentence, Record Frontmatter, and a State/status-cluster line
  distinguishing blocked-as-substate-of-open); `@sdl/objective` `CONTEXT.md` gains the surface
  terms (edge linting in check, EDGES column). One ADR records the zero-kind mirrored design
  and the rejected alternatives (typed taxonomy, formal directionality, single-sided storage).

## Non-Goals

- No typed edge kinds, enums, or machine-readable semantics on edges — not even an optional
  kind field. If real automation later needs machine-distinguishable blocking, that is a new
  decision informed by real edges.
- No formal directionality. The design deliberately walked back from `to:`/`from:` role keys;
  direction lives in the annotations.
- No public mutation CLI (`edge add`/`edge remove`). Deferred until an automation consumer
  exists or there is evidence agents fumble the two-file edit despite the linter.
- No backfill sweep. Closed records' relationship prose (consolidation, subsumption,
  umbrella history) is historical narrative, never converted to live edges.
- No hierarchy, dependency ordering, or "blocked" derivation in the machine layer. The
  linter checks structure only; all judgment is prompting-owned.
- No frontmatter keys beyond `blocked` and `edges`, and no registries, UUIDs, or hidden
  attachment metadata riding along.

## Completion Criteria

- Record Frontmatter parses (or is cleanly stripped) in every `objective.md` reader; heading
  checks and orientation loading behave identically for records with and without frontmatter.
- The edge/blocked linter is live in `sdl objective check`, sweeps all records, reports the
  structural violations as errors, and runs in CI via `just`.
- `sdl objective list` shows the EDGES count column (blank when zero) and the blocked STATUS
  indicator.
- objective-create, objective-update, and objective-close skills document and own edge
  mutation and blocked judgment, including close-time counterpart re-judgment.
- The seed edge and Blocked Sentence are encoded and the repo-wide check passes.
- Root and `@sdl/objective` `CONTEXT.md` entries and the ADR are landed.

## Assumptions and Risks

Assumptions:

- YAML frontmatter can be introduced without breaking existing tooling: the set of
  `objective.md` readers is enumerable within the objective capability package and the
  Objective skill family, and each can strip or parse the block.
- Mirrored storage plus a CI-enforced symmetry linter is sufficient to prevent edge drift; no
  sync command or single-source store is needed.
- Prompting (via the updated skills) reliably writes perspective-correct annotations on both
  sides; the linter can verify structure but not prose quality.

Risks:

- Blocked-state staleness for external (non-edge) blockers has no machine catch — the
  edge-to-open-objective lint was deliberately given up when `blocked` was widened to any
  reason. Freshness is entirely prompting-owned at the close/update touchpoints; if those
  flows miss it, stale blocked sentences accumulate.
- Frontmatter introduction touches every reader of `objective.md`; a missed reader
  mis-renders records (for example, a raw heading check seeing the `---` fence as content).
- Hand-edited YAML in ~120 checked-in records is fragile; the CI sweep erroring on structural
  violations is the mitigation, and it must stay cheap enough that nobody is tempted to skip
  it.

## Open Questions

- ~~Exact CLI spelling of the repo-wide sweep~~ Resolved by the linter slice:
  `sdl objective check --all` (short `-a`), scoped to edge/blocked structural lint only —
  a full-check sweep cannot gate CI while 41/120 legacy records fail old update-heading
  lints; no-slug behavior is unchanged.
- ~~Glyph and styling for the blocked STATUS indicator~~ Resolved by the list-rendering
  slice: `⊘` (U+2298, ascii fallback `!`) with warn intent, keeping the STATUS word `open`
  so blocked reads as a sub-state; pretty surface adds a footer legend, table/markdown
  surfaces render `⊘ open (blocked)`.
- ~~Whether any consumer needs frontmatter awareness beyond stripping~~ Landed answer:
  no reader needed more than strip-or-parse. Every `objective.md` reader (heading checks,
  `read-objective`, `list`, `load-orientations`) behaves identically with and without a
  fence; `list` opted in to surface edge count and blocked state, and `ns objective show`
  added edge/back-edge detail — neither required new frontmatter semantics elsewhere.
- ~~ADR number and final title at landing time~~ Resolved: landed as
  `docs/adr/0025-zero-kind-mirrored-objective-edges.md` (0025 was not claimed by an
  unrelated ADR before landing).

## Closure

Outcome: **completed and landed on trunk (`master`).** Record Frontmatter — the optional
`objective.md` YAML block carrying exactly `blocked` and `edges` — is live, machine-checked,
rendered, skill-owned, seeded, and documented. Every Completion Criterion verifies against
HEAD plus current worktree state:

- **Frontmatter parses in every reader.** `ts/packages/capabilities/objectives/src/core/record-frontmatter.ts`
  and `.../operations/record-frontmatter-read.ts` land the shared reader; the repo-wide sweep
  and `list` treat frontmattered and plain records identically.
- **Linter live in `check`, sweeps all, errors, CI-wired.**
  `ts/packages/capabilities/objectives/src/core/operations/edge-lint.ts` is folded into
  `ns objective check <slug>` and `ns objective check --all`; the `--all` sweep reports
  `sweep-ok (0 violations)` across 128 records and is wired into `just check` (justfile:183).
- **`list` shows EDGES + blocked STATUS.** `ns objective list` renders an EDGES column
  (blank when zero) and `⊘ blocked` sub-state; live output shows `checkout-free-sdl-distribution`
  edges 2 and `ship-objectives-to-customers` `⊘ blocked` edges 4.
- **Skills own edge mutation and blocked judgment.** The `objective` umbrella skill carries
  the Record Frontmatter grounding; `objective-create`/`objective-update`/`objective-close`
  document the mirrored two-file edit, own-sentence and close-time counterpart re-judgment,
  and post-edit `ns objective check`.
- **Seed encoded, check passes.** `checkout-free-sdl-distribution` and
  `ship-objectives-to-customers` carry mirrored perspective-correct annotations plus a
  Blocked Sentence on the shipping side; the pair is now in active use and has grown edges
  beyond the seed (2 and 4 respectively), which is the strongest evidence the mechanism holds.
- **Vocabulary + ADR landed.** Root `CONTEXT.md` carries the four system terms plus the
  open/closed vs. active/archived vs. blocked state-cluster line; `@ns/objectives`
  `CONTEXT.md` carries the EDGES-column and edge-linting surface terms; ADR 0025 is on trunk.

Landing evidence: the reader, linter, seed edges, CONTEXT.md entries, and ADR are all present
on `master` (this refresh runs from a branch cut from `master`), and the CI-gating
`ns objective check --all` sweep is green on trunk with 0 violations.

Naming reconciliation: this record was authored under the pre-rename `sdl objective` /
`@sdl/objective` (singular) vocabulary. The shipped surface is `ns objective` and the package
is `@ns/objectives` at `ts/packages/capabilities/objectives/`; the `sdl`→`ns` and
package-name changes came from separate rename Objectives after this work landed and do not
alter the delivered design. Older prose/evidence lines in this record retain the historical
`sdl` spelling by immutability; the landed reality is the `ns` naming above.

Residual (non-blocking): the previously reported CONTEXT-MAP.md root-context description
lag (its term inventory did not enumerate the four new terms at authoring time) is a
documentation follow-up for a future CONTEXT session, not Objective work. The parked
public-mutation-CLI and typed-edge-kinds items remain deliberately deferred, not open work.
No public mutation CLI was needed; per-slug `ns objective check` supplies the deterministic
mirror verification the skills rely on.
