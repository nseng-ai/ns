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
- Whether any consumer needs frontmatter awareness beyond stripping (for example,
  `load-orientations` or Pi presentation surfaces).
- ADR number and final title at landing time.
